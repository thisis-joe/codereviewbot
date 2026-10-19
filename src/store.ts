import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Pool, PoolClient } from 'pg';
import type { Report, Target, Snapshot, ChangeQuestion } from './contracts.js';
import type { Event } from './webhooks.js';
import type { DiffMetadata } from './review.js';

export function targetKey(t: Target): string { return createHash('sha256').update(JSON.stringify([t.platform, t.instance, t.repository, t.number])).digest('hex'); }
export interface CommandResult { snapshot: Snapshot; body: string; questions?: ChangeQuestion[] }
export interface Job { id: string; target_key: string; kind: 'review' | 'ci' | 'command'; body: Event & { force?: boolean }; state: string; owner: string; attempts: number; result: Report | null; diff: Record<string, DiffMetadata> | null; max_inline: number; command_result?: CommandResult | null }
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
  async enqueue(event: Event, debounceMs = 30000, force = false): Promise<string | null> {
    const key = targetKey(event.target);
    return this.transaction(async c => {
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
      const admitted = await c.query('INSERT INTO deliveries(key) VALUES($1) ON CONFLICT DO NOTHING RETURNING key', [`${key}:${event.kind}:${event.deliveryId}`]);
      if (!admitted.rowCount) return null;
      await c.query('INSERT INTO targets(key,target) VALUES($1,$2) ON CONFLICT(key) DO NOTHING', [key, event.target]);
      if (event.kind === 'closed') { await c.query("UPDATE jobs SET state='superseded',owner=NULL,lease_until=NULL,updated_at=now() WHERE target_key=$1 AND kind<>'command' AND state IN ('queued','running','ready','publishing')", [key]); return null; }
      if (event.kind === 'review') {
        await c.query("UPDATE jobs SET state='superseded',owner=NULL,lease_until=NULL,updated_at=now() WHERE target_key=$1 AND kind<>'command' AND state IN ('running','ready','publishing') AND ($2::boolean OR coalesce(body->>'headSha','')<>$3)", [key, force, event.headSha ?? '']);
        const queued = await c.query("SELECT id FROM jobs WHERE target_key=$1 AND kind='review' AND state='queued' FOR UPDATE", [key]);
        if (queued.rows[0]) { const id = queued.rows[0].id; await c.query("UPDATE jobs SET body=$2,due_at=now()+$3::double precision*interval '1 millisecond',updated_at=now() WHERE id=$1", [id, { ...event, force }, debounceMs]); return id; }
      }
      if (event.kind === 'ci') {
        const queued = await c.query("SELECT id FROM jobs WHERE target_key=$1 AND kind='ci' AND state='queued' FOR UPDATE", [key]);
        if (queued.rowCount) { await c.query('UPDATE jobs SET body=$2,updated_at=now() WHERE id=$1', [queued.rows[0].id, event]); return queued.rows[0].id; }
      }
      const id = randomUUID();
      await c.query("INSERT INTO jobs(id,target_key,kind,body,state,due_at) VALUES($1,$2,$3,$4,'queued',now()+$5::double precision*interval '1 millisecond')", [id, key, event.kind, { ...event, force }, event.kind === 'review' ? debounceMs : 0]);
      return id;
    });
  }
  async claim(): Promise<Job | null> {
    return this.transaction(async c => {
      await c.query('SELECT pg_advisory_xact_lock(710632418)');
      await c.query("UPDATE jobs SET state=CASE WHEN attempts>=3 THEN 'failed' WHEN state='publishing' THEN 'ready' ELSE 'queued' END,owner=NULL,lease_until=NULL,error='expired lease',updated_at=now() WHERE state IN ('running','publishing') AND lease_until<now()");
      if ((await c.query("SELECT id FROM jobs WHERE state IN ('running','publishing') LIMIT 1")).rowCount) return null;
      const selected = await c.query("SELECT j.* FROM jobs j JOIN targets t ON t.key=j.target_key WHERE j.state IN ('queued','ready') AND j.due_at<=now() AND j.attempts<3 AND (NOT t.paused OR j.kind='command') ORDER BY CASE WHEN j.kind='command' THEN 0 ELSE 1 END,j.due_at,j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1");
      const job = selected.rows[0]; if (!job) return null;
      const owner = randomUUID(), state = job.state === 'ready' ? 'publishing' : 'running';
      return (await c.query("UPDATE jobs SET state=$2,owner=$3,lease_until=now()+interval '90 seconds',attempts=attempts+1,updated_at=now() WHERE id=$1 RETURNING *", [job.id, state, owner])).rows[0];
    });
  }
  async assertLease(id: string, owner: string): Promise<void> {
    if (!(await this.pool.query("SELECT 1 FROM jobs WHERE id=$1 AND owner=$2 AND state IN ('running','publishing') AND lease_until>now()", [id, owner])).rowCount) throw new Error('Job lease lost');
  }
  async heartbeat(id: string, owner: string): Promise<void> {
    if (!(await this.pool.query("UPDATE jobs SET lease_until=now()+interval '90 seconds' WHERE id=$1 AND owner=$2 AND state IN ('running','publishing') AND lease_until>now()", [id, owner])).rowCount) throw new Error('Job lease lost');
  }
  async getJob(id: string): Promise<Job | null> { return (await this.pool.query('SELECT * FROM jobs WHERE id=$1', [id])).rows[0] ?? null; }
  async getTarget(t: Target): Promise<{ paused: boolean; report: Report | null } | null> { return (await this.pool.query('SELECT * FROM targets WHERE key=$1', [targetKey(t)])).rows[0] ?? null; }
  async saveCommandResult(id: string, owner: string, result: CommandResult): Promise<void> {
    const saved = await this.pool.query("UPDATE jobs SET command_result=$3,updated_at=now() WHERE id=$1 AND owner=$2 AND kind='command' AND state='running' AND lease_until>now() AND command_result IS NULL", [id, owner, result]);
    if (!saved.rowCount) { await this.assertLease(id, owner); throw new Error('Command result is already immutable'); }
  }
  async learningBatches(t: Snapshot): Promise<CommandResult[]> {
    const rows = await this.pool.query("SELECT command_result FROM jobs WHERE target_key=$1 AND kind='command' AND command_result->'questions' IS NOT NULL AND command_result->'snapshot'->>'headSha'=$2 AND command_result->'snapshot'->>'baseSha'=$3 AND command_result->'snapshot'->>'startSha'=$4 ORDER BY created_at LIMIT 6", [targetKey(t), t.headSha, t.baseSha, t.startSha]);
    return rows.rows.map(row => row.command_result);
  }
  async questionHistory(t: Snapshot): Promise<ChangeQuestion[]> {
    const rows = await this.pool.query("SELECT DISTINCT entry.question FROM jobs j CROSS JOIN LATERAL jsonb_array_elements(j.result->'questions') AS entry(question) WHERE j.target_key=$1 AND j.kind<>'command' AND j.result->>'state' IN ('completed','partial') AND j.result->'snapshot'->>'headSha'=$2 AND j.result->'snapshot'->>'baseSha'=$3 AND j.result->'snapshot'->>'startSha'=$4", [targetKey(t), t.headSha, t.baseSha, t.startSha]);
    return rows.rows.map(row => row.question);
  }
  async saveResult(id: string, owner: string, report: Report, diff: Record<string, DiffMetadata>, maxInline: number): Promise<void> {
    await this.transaction(async c => {
      const row = await c.query("UPDATE jobs SET result=$3,diff=$4,max_inline=$5,state='ready',owner=NULL,lease_until=NULL,attempts=0,updated_at=now() WHERE id=$1 AND owner=$2 AND state='running' AND lease_until>now() RETURNING target_key", [id, owner, report, diff, maxInline]);
      if (!row.rows[0]) throw new Error('Job lease lost');
      await c.query('UPDATE targets SET report=$2,updated_at=now() WHERE key=$1', [row.rows[0].target_key, report]);
    });
  }
  async complete(id: string, owner: string): Promise<void> {
    if (!(await this.pool.query("UPDATE jobs SET state='completed',owner=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND owner=$2 AND state IN ('running','publishing') AND lease_until>now()", [id, owner])).rowCount) throw new Error('Job lease lost');
  }
  async supersede(id: string, owner: string): Promise<void> { await this.pool.query("UPDATE jobs SET state='superseded',owner=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND owner=$2", [id, owner]); }
  async fail(job: Job, detail: string): Promise<void> {
    await this.pool.query("UPDATE jobs SET state=CASE WHEN attempts>=3 THEN 'failed' WHEN state='publishing' THEN 'ready' ELSE 'queued' END,owner=NULL,lease_until=NULL,error=$3,due_at=now()+interval '60 seconds',updated_at=now() WHERE id=$1 AND owner=$2", [job.id, job.owner, detail.slice(0, 300)]);
  }
  async setPaused(t: Target, value: boolean): Promise<void> { await this.pool.query('UPDATE targets SET paused=$2,updated_at=now() WHERE key=$1', [targetKey(t), value]); }
  async dismiss(t: Target, id: string): Promise<boolean> {
    return this.transaction(async c => {
      const row = await c.query('SELECT report FROM targets WHERE key=$1 FOR UPDATE', [targetKey(t)]);
      const report = row.rows[0]?.report as Report | null; const finding = report?.findings.find(f => f.id === id);
      if (!report || !finding) return false;
      finding.status = 'dismissed'; report.delta.dismissed = [...new Set([...report.delta.dismissed, id])];
      for (const group of ['added', 'retained', 'fixed', 'unverified'] as const) report.delta[group] = report.delta[group].filter(value => value !== id);
      await c.query('UPDATE targets SET report=$2,updated_at=now() WHERE key=$1', [targetKey(t), report]);
      // A command can run before a saved result is published. Keep that result in sync.
      const ready = await c.query("SELECT id,result FROM jobs WHERE target_key=$1 AND state='ready' FOR UPDATE", [targetKey(t)]);
      for (const row of ready.rows) {
        const pending = row.result as Report | null, item = pending?.findings.find(f => f.id === id);
        if (!pending || !item) continue;
        item.status = 'dismissed'; pending.delta.dismissed = [...new Set([...pending.delta.dismissed, id])];
        for (const group of ['added', 'retained', 'fixed', 'unverified'] as const) pending.delta[group] = pending.delta[group].filter(value => value !== id);
        await c.query('UPDATE jobs SET result=$2,updated_at=now() WHERE id=$1', [row.id, pending]);
      }
      return true;
    });
  }
  async addFeedback(t: Target, author: string, rule: string, sourceKey: string = randomUUID()): Promise<string> {
    const id = randomUUID(); return (await this.pool.query('INSERT INTO feedback(id,target_key,author,rule,source_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_key) DO UPDATE SET source_key=EXCLUDED.source_key RETURNING id', [id, targetKey(t), author, rule.slice(0, 4000), sourceKey])).rows[0].id;
  }
  async approveFeedback(t: Target, id: string, author: string): Promise<boolean> {
    // Same repository, any PR/MR; no cross-repository learning propagation.
    const result = await this.pool.query("UPDATE feedback f SET status='approved',approved_by=$2 FROM targets source WHERE f.id=$1 AND f.target_key=source.key AND source.target->>'platform'=$3 AND source.target->>'instance'=$4 AND source.target->>'repository'=$5 AND f.status IN ('pending','approved')", [id, author, t.platform, t.instance, t.repository]); return Boolean(result.rowCount);
  }
  async rejectFeedback(t: Target, id: string, author: string): Promise<boolean> {
    return Boolean((await this.pool.query("UPDATE feedback f SET status='rejected',approved_by=$2 FROM targets source WHERE f.id=$1 AND f.target_key=source.key AND source.target->>'platform'=$3 AND source.target->>'instance'=$4 AND source.target->>'repository'=$5 AND f.status IN ('pending','rejected')", [id, author, t.platform, t.instance, t.repository])).rowCount);
  }
  async retry(id: string): Promise<boolean> { return Boolean((await this.pool.query("UPDATE jobs SET state=CASE WHEN result IS NOT NULL AND kind<>'command' THEN 'ready' ELSE 'queued' END,attempts=0,due_at=now(),error=NULL WHERE id=$1 AND state='failed'", [id])).rowCount); }
  async learnings(t: Target): Promise<string[]> {
    return (await this.pool.query("SELECT f.rule FROM feedback f JOIN targets source ON source.key=f.target_key WHERE f.status='approved' AND source.target->>'platform'=$1 AND source.target->>'instance'=$2 AND source.target->>'repository'=$3 ORDER BY f.created_at DESC LIMIT 30", [t.platform, t.instance, t.repository])).rows.map(r => r.rule);
  }
  async health(): Promise<{ failed: number; queued: number }> {
    const rows = (await this.pool.query('SELECT state,count(*)::int AS count FROM jobs GROUP BY state')).rows;
    return { failed: rows.find(r => r.state === 'failed')?.count ?? 0, queued: rows.filter(r => ['queued', 'ready'].includes(r.state)).reduce((n, r) => n + r.count, 0) };
  }
}
