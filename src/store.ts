import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool, PoolClient } from 'pg';
import type { Report, Target, Snapshot, ChangeQuestion, Verdict } from './contracts.js';
import { commentKey, type Event } from './webhooks.js';
import type { RemoteComment, InlineInput } from './platform.js';
import type { DiffMetadata } from './review.js';
import { WorkflowConflict, type WorkflowStep, type WorkflowData, type WorkflowView, type WorkflowFailure } from './workflow-contract.js';
import { retryableFailure, recoveryAttempts } from './model-failure.js';

export function targetKey(t: Target): string { return createHash('sha256').update(JSON.stringify([t.platform, t.instance, t.repository, t.number])).digest('hex'); }
export interface CommandResult { snapshot: Snapshot; body: string; questions?: ChangeQuestion[]; batchKind?: 'csinterview'; questionThread?: Omit<InlineInput, 'body'>; revealThreadVersion?: 1; start?: number; answered?: string; grades?: { id: string; verdict: Verdict }[] }
export interface Job { id: string; target_key: string; kind: 'review' | 'ci' | 'command'; body: Event & { force?: boolean }; state: string; owner: string; attempts: number; result: Report | null; diff: Record<string, DiffMetadata> | null; max_inline: number; command_result?: CommandResult | null; workflow_step?: WorkflowStep | null; workflow_status?: 'pending' | 'running' | null; workflow_owner?: string | null; workflow_data?: WorkflowData; due_at?: Date }
export class Store {
  constructor(readonly pool: Pool) {}
  async migrate(): Promise<void> {
    const sql = await readFile(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8');
    await this.transaction(async c => { await c.query('SELECT pg_advisory_xact_lock(710632419)'); await c.query(sql); });
  }
  async transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect(); try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; }
    catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  }
  /** Exclude pending work and hold the same lock as claim until source deletion ends. */
  async cleanupWorkspaces(cleanup: (protectedJobs: ReadonlySet<string>) => Promise<void>): Promise<void> {
    await this.transaction(async c => {
      await c.query('SELECT pg_advisory_xact_lock(710632418)');
      const rows = await c.query("SELECT id FROM jobs WHERE state IN ('queued','running','ready','publishing')");
      await cleanup(new Set(rows.rows.map(row => String(row.id))));
    });
  }
  async enqueue(event: Event, force = false): Promise<string | null> {
    const key = targetKey(event.target);
    return this.transaction(async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
      const admitted = await c.query('INSERT INTO deliveries(key) VALUES($1) ON CONFLICT DO NOTHING RETURNING key', [`${key}:${event.kind}:${event.deliveryId}`]);
      if (!admitted.rowCount) return null;
      await c.query('INSERT INTO targets(key,target) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [key, event.target]);
      if (event.kind === 'closed') { await c.query("UPDATE jobs SET state='superseded',owner=NULL,lease_until=NULL,updated_at=now() WHERE target_key=$1 AND kind<>'command' AND state IN ('queued','running','ready','publishing')", [key]); return null; }
      if (event.kind === 'review') {
        await c.query("UPDATE jobs SET state='superseded',owner=NULL,lease_until=NULL,updated_at=now() WHERE target_key=$1 AND kind<>'command' AND state IN ('running','ready','publishing') AND ($2::boolean OR coalesce(body->>'headSha','')<>$3)", [key, force, event.headSha ?? '']);
        const queued = await c.query("SELECT id,body FROM jobs WHERE target_key=$1 AND kind='review' AND state='queued' FOR UPDATE", [key]);
        if (queued.rows[0]) {
          const prior = queued.rows[0], sameHead = prior.body.headSha === event.headSha;
          const regenerate = event.regenerate || (sameHead && prior.body.regenerate);
          const recovery = sameHead && !event.requested && event.recoveryAttempt === undefined && prior.body.recoveryAttempt !== undefined
            ? { recoveryAttempt: prior.body.recoveryAttempt, recoverySnapshot: prior.body.recoverySnapshot ?? prior.body.target } : {};
          const body = { ...event, ...recovery, force: force || Boolean(sameHead && prior.body.force), ...(regenerate ? { regenerate: true } : {}), ...(event.requested || prior.body.requested ? { requested: true } : {}) };
          await c.query("UPDATE jobs SET body=$2,workflow_step=CASE WHEN $3 THEN NULL ELSE workflow_step END,workflow_status=CASE WHEN $3 THEN NULL ELSE workflow_status END,workflow_data=CASE WHEN $3 THEN '{}'::jsonb ELSE workflow_data END,updated_at=now() WHERE id=$1", [prior.id, body, !sameHead || force || Boolean(event.regenerate)]); return prior.id;
        }
      }
      if (event.kind === 'ci') {
        const queued = await c.query("SELECT id FROM jobs WHERE target_key=$1 AND kind='ci' AND state='queued' FOR UPDATE", [key]);
        if (queued.rowCount) { await c.query('UPDATE jobs SET body=$2,updated_at=now() WHERE id=$1', [queued.rows[0].id, event]); return queued.rows[0].id; }
      }
      const id = randomUUID();
      await c.query("INSERT INTO jobs(id,target_key,kind,body,state,due_at) VALUES($1,$2,$3,$4,'queued',now())", [id, key, event.kind, { ...event, force }]);
      return id;
    });
  }
  async claim(orchestrated = false): Promise<Job | null> {
    return this.transaction(async c => {
      await c.query('SELECT pg_advisory_xact_lock(710632418)');
      await c.query("UPDATE jobs SET state=CASE WHEN attempts>=3 THEN 'failed' WHEN state='publishing' THEN 'ready' ELSE 'queued' END,owner=NULL,lease_until=NULL,error='expired lease',updated_at=now() WHERE state IN ('running','publishing') AND lease_until<now()");
      if ((await c.query("SELECT id FROM jobs WHERE state IN ('running','publishing') LIMIT 1")).rowCount) return null;
      const selected = await c.query("SELECT j.* FROM jobs j WHERE j.state IN ('queued','ready') AND j.due_at<=now() AND j.attempts<3 ORDER BY CASE WHEN j.kind='command' THEN 0 ELSE 1 END,j.due_at,j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1");
      const job = selected.rows[0]; if (!job) return null;
      const owner = randomUUID(), state = job.state === 'ready' ? 'publishing' : 'running';
      return (await c.query("UPDATE jobs SET state=$2,owner=$3,lease_until=now()+interval '90 seconds',attempts=attempts+1,updated_at=now(),workflow_step=CASE WHEN $4 THEN coalesce(workflow_step,CASE WHEN $2='publishing' THEN 'publish' WHEN kind='command' THEN 'command' WHEN kind='ci' THEN 'complete' ELSE 'prepare' END) ELSE workflow_step END,workflow_status=CASE WHEN $4 THEN 'pending' ELSE workflow_status END,workflow_owner=CASE WHEN $4 THEN $3::uuid ELSE workflow_owner END WHERE id=$1 RETURNING *", [job.id, state, owner, orchestrated])).rows[0];
    });
  }
  async assertLease(id: string, owner: string): Promise<void> {
    if (!(await this.pool.query("SELECT 1 FROM jobs WHERE id=$1 AND owner=$2 AND state IN ('running','publishing') AND lease_until>now()", [id, owner])).rowCount) throw new Error('Job lease lost');
  }
  async heartbeat(id: string, owner: string): Promise<void> {
    if (!(await this.pool.query("UPDATE jobs SET lease_until=now()+interval '90 seconds' WHERE id=$1 AND owner=$2 AND state IN ('running','publishing') AND lease_until>now()", [id, owner])).rowCount) throw new Error('Job lease lost');
  }
  async workflowView(id: string, owner: string): Promise<WorkflowView> {
    const job = await this.getJob(id);
    if (!job || job.workflow_owner !== owner || !job.workflow_step) throw new WorkflowConflict('Workflow ownership changed');
    const status = ['completed','failed','superseded'].includes(job.state) ? job.state as 'completed' | 'failed' | 'superseded'
      : ['queued','ready'].includes(job.state) ? 'retry' : job.workflow_status ?? 'pending';
    return { available: true, jobId: job.id, owner, kind: job.kind, step: job.workflow_step, status, ...(job.workflow_data?.failure ? { failure: job.workflow_data.failure } : {}), ...(status === 'retry' && job.due_at ? { retryAt: new Date(job.due_at).toISOString() } : {}) };
  }
  async beginWorkflowStep(id: string, owner: string, step: WorkflowStep): Promise<boolean> {
    const view = await this.workflowView(id, owner);
    const job = (await this.getJob(id))!;
    if (job.workflow_data?.completed?.includes(step) || (view.step === step && ['completed','failed','superseded','retry'].includes(view.status))) return false;
    try { await this.assertLease(id, owner); } catch { throw new WorkflowConflict('Workflow lease expired'); }
    const started = await this.pool.query("UPDATE jobs SET workflow_status='running',attempts=CASE WHEN attempts=0 THEN 1 ELSE attempts END,updated_at=now() WHERE id=$1 AND owner=$2 AND workflow_owner=$2 AND workflow_step=$3 AND workflow_status='pending' AND state IN ('running','publishing') AND lease_until>now() RETURNING id", [id, owner, step]);
    if (started.rowCount) return true;
    const current = await this.workflowView(id, owner);
    if (current.step !== step || current.status !== 'running') throw new WorkflowConflict('Step is not ready');
    return false;
  }
  async advanceWorkflow(id: string, owner: string, step: WorkflowStep, next: WorkflowStep, data: WorkflowData = {}): Promise<void> {
    const updated = await this.pool.query("UPDATE jobs SET workflow_step=$4,workflow_status='pending',workflow_data=(workflow_data || $5::jsonb) || jsonb_build_object('completed',coalesce(workflow_data->'completed','[]'::jsonb) || to_jsonb($3::text)),attempts=0,lease_until=now()+interval '90 seconds',updated_at=now() WHERE id=$1 AND owner=$2 AND workflow_step=$3 AND workflow_status='running' AND state IN ('running','publishing') AND lease_until>now() RETURNING id", [id, owner, step, next, JSON.stringify(data)]);
    if (!updated.rowCount) throw new WorkflowConflict('Workflow lease lost');
  }
  async recordWorkflowFailure(id: string, owner: string, failure: WorkflowFailure): Promise<void> {
    await this.pool.query("UPDATE jobs SET workflow_data=workflow_data || jsonb_build_object('failure',$3::jsonb) WHERE id=$1 AND owner=$2 AND lease_until>now()", [id, owner, JSON.stringify(failure)]);
  }
  async getJob(id: string): Promise<Job | null> { return (await this.pool.query('SELECT * FROM jobs WHERE id=$1', [id])).rows[0] ?? null; }
  async getTarget(t: Target): Promise<{ report: Report | null } | null> { return (await this.pool.query('SELECT * FROM targets WHERE key=$1', [targetKey(t)])).rows[0] ?? null; }
  /** Operator-only import from authenticated platform reads; bodies alone never establish trust. */
  async rememberBotComments(target: Target, comments: RemoteComment[], botLogin: string): Promise<void> {
    await this.transaction(async c => {
      const key = targetKey(target);
      await c.query('INSERT INTO targets(key,target) VALUES($1,$2) ON CONFLICT DO NOTHING', [key, target]);
      for (const comment of comments) {
        if (comment.author !== botLogin || !comment.body.includes('<!-- codereviewbot:')) continue;
        await c.query('INSERT INTO bot_comment_history(target_key,surface,comment_id,bot_login) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [key, comment.surface, comment.id, botLogin]);
      }
    });
  }
  async botCommentHistory(target: Target): Promise<Set<string>> {
    const rows = await this.pool.query('SELECT surface,comment_id AS id FROM bot_comment_history WHERE target_key=$1', [targetKey(target)]);
    return new Set(rows.rows.map(commentKey));
  }
  async recoveryTargets(scope: Pick<Target, 'platform' | 'instance' | 'repository'>): Promise<Target[]> {
    const rows = await this.pool.query("SELECT DISTINCT body->'target' AS target FROM jobs WHERE kind='review' AND state='failed' AND (body->>'merged'='true' OR body->>'requested'='true') AND body->'target'->>'platform'=$1 AND body->'target'->>'instance'=$2 AND body->'target'->>'repository'=$3", [scope.platform, scope.instance, scope.repository]);
    return rows.rows.map(r => r.target);
  }
  async recoveryEvent(snap: Snapshot, now = Date.now()): Promise<Event | null> {
    const key = targetKey(snap);
    if ((await this.pool.query("SELECT 1 FROM jobs WHERE target_key=$1 AND kind='review' AND state IN ('queued','running','ready','publishing') LIMIT 1", [key])).rowCount) return null;
    const prior = (await this.pool.query("SELECT id,body,result,updated_at FROM jobs WHERE target_key=$1 AND kind='review' AND state='failed' AND (result->>'state'='failed' OR (result IS NULL AND body ? 'recoveryAttempt')) AND coalesce(result->'snapshot',body->'recoverySnapshot',body->'target')->>'headSha'=$2 AND coalesce(result->'snapshot',body->'recoverySnapshot',body->'target')->>'baseSha'=$3 AND coalesce(result->'snapshot',body->'recoverySnapshot',body->'target')->>'startSha'=$4 ORDER BY updated_at DESC,id DESC LIMIT 1", [key, snap.headSha, snap.baseSha, snap.startSha])).rows[0];
    if (!prior) return null;
    const attempt = recoveryAttempts(prior.body, snap) + 1;
    const failure = (prior.result as Report | null)?.failure;
    if (attempt > 3 || (failure && !retryableFailure(failure))) return null;
    const retryAt = failure?.retryAt ? Date.parse(failure.retryAt) : new Date(prior.updated_at).getTime() + 5 * 60000;
    if (!Number.isFinite(retryAt) || now < retryAt) return null;
    // Every controller derives the same key from the preceding failed job; enqueue admits it once.
    return { kind: 'review', target: snap, ...(prior.body.merged ? { merged: true } : {}), ...(prior.body.requested ? { requested: true } : {}), headSha: snap.headSha, deliveryId: `recover:questions-v3:${prior.id}:${attempt}`, regenerate: true, recoveryAttempt: attempt, recoverySnapshot: snap };
  }
  async saveCommandResult(id: string, owner: string, result: CommandResult): Promise<void> {
    const saved = await this.pool.query("UPDATE jobs SET command_result=$3,updated_at=now() WHERE id=$1 AND owner=$2 AND kind='command' AND state='running' AND lease_until>now() AND command_result IS NULL", [id, owner, result]);
    if (!saved.rowCount) { await this.assertLease(id, owner); throw new Error('Command result is already immutable'); }
  }
  async learningBatches(t: Snapshot): Promise<CommandResult[]> {
    const rows = await this.pool.query("SELECT command_result FROM jobs WHERE target_key=$1 AND kind='command' AND command_result->'questions' IS NOT NULL AND command_result->'snapshot'->>'headSha'=$2 AND command_result->'snapshot'->>'baseSha'=$3 AND command_result->'snapshot'->>'startSha'=$4 ORDER BY created_at,id", [targetKey(t), t.headSha, t.baseSha, t.startSha]);
    return rows.rows.map(row => row.command_result);
  }
  async questionHistory(t: Snapshot): Promise<ChangeQuestion[]> {
    const rows = await this.pool.query("SELECT DISTINCT entry.question FROM jobs j CROSS JOIN LATERAL jsonb_array_elements(j.result->'questions') AS entry(question) WHERE j.target_key=$1 AND j.kind<>'command' AND j.result->>'state' IN ('completed','partial') AND j.result->'snapshot'->>'headSha'=$2 AND j.result->'snapshot'->>'baseSha'=$3 AND j.result->'snapshot'->>'startSha'=$4", [targetKey(t), t.headSha, t.baseSha, t.startSha]);
    return rows.rows.map(row => row.question);
  }
  async answeredQuestions(t: Snapshot): Promise<Set<string>> {
    return new Set((await this.answerResults(t)).keys());
  }
  // Only graded answers whose reply was published count; the latest grade per question wins.
  async answerResults(t: Snapshot): Promise<Map<string, Verdict | null>> {
    const rows = await this.pool.query("SELECT command_result->>'answered' AS id, command_result->'grades' AS grades FROM jobs WHERE target_key=$1 AND kind='command' AND state='completed' AND (command_result->>'answered' IS NOT NULL OR command_result->'grades' IS NOT NULL) AND command_result->'snapshot'->>'headSha'=$2 AND command_result->'snapshot'->>'baseSha'=$3 AND command_result->'snapshot'->>'startSha'=$4 ORDER BY created_at, id", [targetKey(t), t.headSha, t.baseSha, t.startSha]);
    const results = new Map<string, Verdict | null>();
    for (const row of rows.rows) {
      if (Array.isArray(row.grades)) for (const g of row.grades) results.set(g.id, g.verdict);
      else if (row.id && !results.has(row.id)) results.set(row.id, null);
    }
    return results;
  }
  async saveResult(id: string, owner: string, report: Report, diff: Record<string, DiffMetadata>, maxInline: number, reviewSeconds: number | null = null, orchestrated = false): Promise<void> {
    await this.transaction(async c => {
      const row = await c.query("UPDATE jobs SET result=$3,diff=$4,max_inline=$5,review_seconds=$6,state=CASE WHEN $7 THEN 'publishing' ELSE 'ready' END,owner=CASE WHEN $7 THEN owner ELSE NULL END,lease_until=CASE WHEN $7 THEN now()+interval '90 seconds' ELSE NULL END,workflow_step=CASE WHEN $7 THEN 'publish' ELSE workflow_step END,workflow_status=CASE WHEN $7 THEN 'pending' ELSE workflow_status END,workflow_data=CASE WHEN $7 THEN workflow_data || jsonb_build_object('completed',coalesce(workflow_data->'completed','[]'::jsonb) || to_jsonb(workflow_step)) ELSE workflow_data END,attempts=0,updated_at=now() WHERE id=$1 AND owner=$2 AND state='running' AND lease_until>now() RETURNING target_key", [id, owner, report, diff, maxInline, reviewSeconds, orchestrated]);
      if (!row.rows[0]) throw new Error('Job lease lost');
      await c.query('UPDATE targets SET report=$2,updated_at=now() WHERE key=$1', [row.rows[0].target_key, report]);
    });
  }
  /** Median of the latest question generations in this mode, falling back to any mode, then to a fixed guess. */
  async reviewEstimate(mode: 'full' | 'incremental'): Promise<{ minutes: number; measured: boolean }> {
    const median = async (sameMode: boolean) => (await this.pool.query("SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY review_seconds) AS seconds FROM (SELECT review_seconds FROM jobs WHERE kind='review' AND result->>'schemaVersion'='2' AND review_seconds IS NOT NULL AND (NOT $1::boolean OR result->>'mode'=$2) ORDER BY updated_at DESC LIMIT 20) recent", [sameMode, mode])).rows[0]?.seconds as number | null;
    return estimateMinutes(await median(true) ?? await median(false));
  }
  async complete(id: string, owner: string): Promise<void> {
    if (!(await this.pool.query("UPDATE jobs SET state=CASE WHEN kind='review' AND result->>'state'='failed' THEN 'failed' ELSE 'completed' END,owner=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND owner=$2 AND state IN ('running','publishing') AND lease_until>now()", [id, owner])).rowCount) throw new Error('Job lease lost');
  }
  async supersede(id: string, owner: string): Promise<void> { await this.pool.query("UPDATE jobs SET state='superseded',owner=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND owner=$2", [id, owner]); }
  async fail(job: Job, detail: string): Promise<void> {
    await this.pool.query("UPDATE jobs SET state=CASE WHEN attempts>=3 THEN 'failed' WHEN state='publishing' THEN 'ready' ELSE 'queued' END,owner=NULL,lease_until=NULL,error=$3,due_at=now()+interval '60 seconds',updated_at=now() WHERE id=$1 AND owner=$2", [job.id, job.owner, detail.slice(0, 300)]);
  }
  async retry(id: string): Promise<boolean> { return Boolean((await this.pool.query("UPDATE jobs SET state=CASE WHEN result IS NOT NULL AND result->>'state'<>'failed' AND kind<>'command' THEN 'ready' ELSE 'queued' END,workflow_step=CASE WHEN (result IS NULL OR result->>'state'='failed') AND kind='review' THEN NULL ELSE workflow_step END,workflow_status=CASE WHEN (result IS NULL OR result->>'state'='failed') AND kind='review' THEN NULL ELSE workflow_status END,workflow_data=CASE WHEN (result IS NULL OR result->>'state'='failed') AND kind='review' THEN '{}'::jsonb ELSE workflow_data END,result=CASE WHEN result->>'state'='failed' THEN NULL ELSE result END,diff=CASE WHEN result->>'state'='failed' THEN NULL ELSE diff END,body=body-'recoveryAttempt',attempts=0,due_at=now(),error=NULL,updated_at=now() WHERE id=$1 AND state='failed'", [id])).rowCount); }
  async health(): Promise<{ failed: number; queued: number }> {
    const rows = (await this.pool.query('SELECT state,count(*)::int AS count FROM jobs GROUP BY state')).rows;
    const failures = (await this.pool.query("SELECT (SELECT count(*)::int FROM targets WHERE report->>'state'='failed') + (SELECT count(*)::int FROM jobs WHERE state='failed' AND coalesce(result->>'state','')<>'failed') AS count")).rows[0].count;
    return { failed: failures, queued: rows.filter(r => ['queued', 'ready'].includes(r.state)).reduce((n, r) => n + r.count, 0) };
  }
}
// Rounded up so the notice rarely promises less time than generation takes.
export function estimateMinutes(seconds: number | null): { minutes: number; measured: boolean } {
  return seconds == null ? { minutes: 2, measured: false } : { minutes: Math.max(1, Math.ceil(seconds / 60)), measured: true };
}
