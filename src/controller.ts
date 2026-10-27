import { z } from 'zod';
import { Store, type Job } from './store.js';
import { Platform } from './platform.js';
import { Workspaces } from './workspace.js';
import { generateQuestions, archivedFindings, hasQuestionSource, type Model } from './review.js';
import { emptyReport, reviewed, isQuestionReport, hasChangeQuestions, withoutKeys, AnswerSchema, type Snapshot, type Report, type Target } from './contracts.js';
import { publish, Superseded } from './publish.js';
import { HttpError } from './http-client.js';
import { parseCommand, type Command } from './commands.js';
import { renderAnswer, renderReport, renderProgress, renderCommandHelp, COMMAND_HELP_HINT, plain, renderAck, ackMarker, summaryMarker, SUMMARY_MARKER, type AckState } from './render.js';
import { redact } from './redact.js';
import { handleLearning, learningInput, patches, readable } from './learning-command.js';
import { answerSecurity, grounding, sourceTools } from './prompt-blocks.js';
import { commentKey, type Comment, type Event } from './webhooks.js';
import { syncAnswerGate } from './answer-gate.js';
import { sameRevision, questionId } from './learning.js';
import type { Mattermost } from './mattermost.js';
import { Workflow } from './workflow.js';
import { failureInfo, failureMessage, scheduleFailure, recoveryAttempts } from './model-failure.js';

export interface FailureContext { snap?: Snapshot; previous?: Report | null; requireAnswers?: boolean }
export interface PreparedReview { snap: Snapshot; previous: Report | null; prepared: Awaited<ReturnType<Workspaces['prepare']>>; prepareMs: number; requireAnswers: boolean; cached: Report | null }
export interface GeneratedReview { report: Report; diff: Record<string, import('./review.js').DiffMetadata>; reviewSeconds: number | null }

export class Controller {
  active: Promise<void> | null = null;
  reconciling = false;
  stopping = false;
  readonly workflow: Workflow;
  constructor(readonly store: Store, readonly platforms: Platform[], readonly workspaces: Workspaces, readonly model: Model, readonly notifications?: Mattermost) { this.workflow = new Workflow(this, workspaces.root ?? '/data'); }
  platform(t: Target): Platform {
    const platform = this.platforms.find(p => p.config.platform === t.platform && p.config.instance === t.instance && p.config.repository === t.repository);
    if (!platform) throw new Error('Repository no longer allowed'); return platform;
  }
  async tick(): Promise<string | null> {
    if (this.stopping) return null;
    this.notifications?.tick();
    if (this.active) return null;
    const job = await this.store.claim(); if (!job) return null;
    this.active = this.perform(job).catch(() => { console.error(JSON.stringify({ jobId: job.id, error: 'job_failure_handler' })); }).finally(() => { this.active = null; });
    return job.id;
  }
  async perform(job: Job): Promise<void> {
    const heartbeat = setInterval(() => { void this.store.heartbeat(job.id, job.owner).catch(() => {}); }, 15000);
    const context: FailureContext = {};
    try {
      const platform = this.platform(job.body.target), lease = () => this.store.assertLease(job.id, job.owner);
      if (job.state === 'publishing') {
        if (!await this.publishReview(job)) return;
        await this.synchronizeReview(job);
        await this.notifyReview(job);
        await this.store.complete(job.id, job.owner); return;
      }
      if (job.kind === 'command') { await this.command(job, platform, lease); await this.finishCommand(job); return; }
      if (job.kind === 'ci') { await this.store.complete(job.id, job.owner); return; }
      const prepared = await this.prepareReview(job, context);
      const generated = await this.generateReview(job, prepared);
      await this.validateReview(job, prepared.snap);
      await this.store.saveResult(job.id, job.owner, generated.report, generated.diff, 0, generated.reviewSeconds);
    } catch (error) { await this.handleFailure(job, error, context); }
    finally { clearInterval(heartbeat); }
  }
  async prepareReview(job: Job, context: FailureContext = {}): Promise<PreparedReview> {
    const platform = this.platform(job.body.target);
    const snap = await platform.snapshot(job.body.target.number, job.body.requested || job.body.merged);
    context.snap = snap;
    snap.title = redact(snap.title); snap.description = redact(snap.description);
    const previous = (await this.store.getTarget(snap))?.report ?? null;
    context.previous = previous;
    const started = Date.now();
    const priorSnapshot = !job.body.merged && !job.body.force && isQuestionReport(previous) && previous.state === 'completed' && !(job.body.regenerate && sameRevision(previous.snapshot, snap)) ? previous.snapshot : null;
    const prepared = await this.workspaces.prepare(platform, snap, job.id, priorSnapshot);
    context.requireAnswers = !job.body.merged && prepared.policy.requireAnswers === true;
    const prepareMs = Date.now() - started;
    await this.store.assertLease(job.id, job.owner);
    const cached = !job.body.force && !job.body.regenerate && isQuestionReport(previous) && reviewed(previous) && sameRevision(previous.snapshot, snap) && previous.snapshot.policyVersion === snap.policyVersion
      ? previous.snapshot.commits ? previous : { ...previous, snapshot: { ...previous.snapshot, commits: snap.commits } } : null;
    if (!cached) await this.announce(platform, snap, prepared.mode, previous);
    return { snap, previous, prepared, prepareMs, requireAnswers: context.requireAnswers, cached };
  }
  async generateReview(job: Job, value: PreparedReview): Promise<GeneratedReview> {
    if (value.cached) return { report: value.cached, diff: {}, reviewSeconds: null };
    const { snap, previous, prepared, prepareMs } = value;
    const issues = (await this.platform(job.body.target).linkedIssues(snap.description)).map(redact);
    const started = Date.now();
    const result = await generateQuestions(this.model, job.id, snap, prepared.policy, prepared.context, previous, prepared.guidelines, issues, prepared.mode);
    console.info(JSON.stringify({ jobId: job.id, event: 'questions_generated', prepareMs, generateMs: Date.now() - started, modelCalls: hasQuestionSource(prepared.context) ? 1 : 0 }));
    return { report: { ...result, requireAnswers: value.requireAnswers }, diff: Object.fromEntries(Object.entries(prepared.context.diff).map(([p, d]) => [p, { oldPath: d.oldPath, positions: d.positions }])), reviewSeconds: Math.round((Date.now() - started) / 1000) };
  }
  async validateReview(job: Job, snap: Snapshot): Promise<void> {
    await this.store.assertLease(job.id, job.owner);
    const live = await this.platform(job.body.target).snapshot(snap.number, job.body.requested || job.body.merged);
    if (!sameRevision(live, snap)) throw new Superseded('Review snapshot changed');
  }
  async publishReview(job: Job): Promise<boolean> {
    if (!job.result) throw new Error('Missing review result');
    const platform = this.platform(job.body.target);
    if (!isQuestionReport(job.result)) {
      const live = await platform.snapshot(job.body.target.number, job.body.requested || job.body.merged);
      await this.store.enqueue({ kind: 'review', target: job.body.target, headSha: live.headSha, deliveryId: `questions-v2:${job.id}`, ...(job.body.requested ? { requested: true } : {}), ...(job.body.merged ? { merged: true } : {}) }, true);
      return false;
    }
    const started = Date.now();
    await publish(platform, job.result, job.diff ?? {}, job.max_inline, () => this.store.assertLease(job.id, job.owner), await this.store.answerResults(job.result.snapshot), job.body.requested || job.body.merged, await this.historicalComments(platform, job.result.snapshot));
    console.info(JSON.stringify({ jobId: job.id, event: 'questions_published', publishMs: Date.now() - started }));
    return true;
  }
  async synchronizeReview(job: Job): Promise<void> {
    if (job.result) await this.syncGate(this.platform(job.body.target), job.result);
  }
  async notifyReview(job: Job): Promise<void> {
    if (job.result) await this.notifications?.questionsPublished(this.platform(job.body.target), job.result);
  }
  async finishCommand(job: Job): Promise<void> {
    const platform = this.platform(job.body.target);
    await this.store.complete(job.id, job.owner);
    if (job.body.comment) await this.settleAck(platform, job.body.target.number, job.body.comment);
    const result = (await this.store.getJob(job.id))?.command_result;
    if (result?.answered || result?.grades?.length) {
      const report = (await this.store.getTarget(job.body.target))?.report;
      if (report) { await this.refreshSummary(platform, report, true); await this.syncGate(platform, report); }
    }
  }
  async handleFailure(job: Job, error: unknown, context: FailureContext = {}, orchestrated = false): Promise<void> {
    const { snap, previous, requireAnswers } = context;
    const superseded = error instanceof Superseded || (error instanceof HttpError && error.status === 410);
    if (superseded) await this.store.supersede(job.id, job.owner);
    else if (snap && job.state !== 'publishing' && (job.attempts >= 3 || ['rate_limit', 'authentication'].includes(failureInfo(error).code))) {
      const failure = recoveryAttempts(job.body, snap) < 3 ? scheduleFailure(failureInfo(error)) : failureInfo(error);
      const failed = { ...emptyReport(snap, 'failed', failureMessage(failure)), failure, requireAnswers: requireAnswers ?? previous?.requireAnswers, findings: archivedFindings(previous ?? null) };
      try { await this.store.saveResult(job.id, job.owner, failed, {}, 0, null, orchestrated); } catch { await this.store.fail(job, 'Review failed after lease loss'); }
    } else await this.store.fail(job, error instanceof HttpError ? `Platform API ${error.status}` : 'Review execution failed; inspect runner authentication, resource limits and configuration');
    // Commands also run on closed PR/MRs, so a closed notice is only a fallback; the last failed attempt leaves a failure notice.
    if (job.kind === 'command' && job.body.comment && (superseded || job.attempts >= 3)) {
      try { await this.settleAck(this.platform(job.body.target), job.body.target.number, job.body.comment, superseded ? 'closed' : 'failed'); } catch { /* repository removed */ }
    }
    console.error(JSON.stringify({ jobId: job.id, kind: job.kind, stage: job.state, attempt: job.attempts, error: superseded ? 'superseded' : 'execution_failed', ...(error instanceof Superseded ? {} : { cause: describeFailure(error) }) }));
  }

  async command(job: Job, platform: Platform, lease: () => Promise<void>): Promise<void> {
    const comment = job.body.comment; if (!comment) return;
    const permission = await platform.permission(comment.author); if (permission === 'none') return;
    const normalized = normalizeMention(platform, comment.body);
    let command = parseCommand(normalized);
    const all = [...await platform.comments(job.body.target.number), ...await platform.inlineComments(job.body.target.number)];
    const key = commentKey(comment), marker = `<!-- codereviewbot:reply:${key.replace(/[^\w-]/g, '')} -->`;
    const historical = await this.historicalComments(platform, job.body.target);
    const trusted = (c: (typeof all)[number]) => platform.owned(c) || historical.has(commentKey(c));
    if (all.some(c => trusted(c) && c.body.includes(marker))) return;
    const usage = async (answer: string) => { await lease(); await platform.reply(job.body.target.number, [marker, plain(answer), '', COMMAND_HELP_HINT].join('\n'), comment.parentId, comment.discussionId); };
    if (command?.action === 'help') { await lease(); await platform.reply(job.body.target.number, renderCommandHelp(key), comment.parentId, comment.discussionId); return; }
    if (!command && /^\/(?:hey|reviewbot)\b/i.test(normalized.trim())) { await usage('명령을 확인하세요.'); return; }
    if (!command && (comment.parentId || comment.discussionId)) {
      const ids = new Set(all.filter(c => trusted(c) && c.surface === comment.surface && (c.id === comment.parentId || (comment.parentId && c.parentId === comment.parentId) || (comment.discussionId && c.discussionId === comment.discussionId))).flatMap(c => [...c.body.matchAll(/<!-- codereviewbot:question:(Q-[a-f0-9]{12}) -->/g)].map(m => m[1]!)));
      if (ids.size === 1) command = { action: 'answer', id: [...ids][0]!, text: comment.body.slice(0, 8000) };
      else if (ids.size > 1) { await usage('이 스레드에는 여러 질문이 있습니다. 답할 질문 번호를 명시하세요.'); return; }
    }
    if (!command) return;
    await lease();
    if (command.action === 'questions' || command.action === 'csinterview' || command.action === 'morecs' || command.action === 'answer' || command.action === 'reveal') {
      await handleLearning(command, job, platform, this.store, this.workspaces, this.model, all, lease, all.filter(trusted)); return;
    }
    const target = job.body.target;
    if (command.action === 'tryagain') { await this.enqueueFromCommand(job, platform); await usage('질문 재생성을 요청했습니다. 완료되면 질문 댓글에 반영됩니다.'); return; }
    if (command.action !== 'ask') return;
    const state = await this.store.getTarget(target);
    const snap = await platform.snapshot(target.number, true);
    snap.title = redact(snap.title); snap.description = redact(snap.description);
    const prepared = await this.workspaces.prepare(platform, snap, job.id, null);
    const payload = learningInput({ question: redact(command.text), snapshot: snap, diff: patches(prepared.context), report: withoutKeys(state?.report), policy: prepared.policy });
    if (!payload) { await usage('질문 자료가 입력 한도를 초과해 답변을 보류합니다. 질문 범위를 좁혀 다시 물어 주세요.'); return; }
    const result = AnswerSchema.parse(await this.model.run('answer', askPrompt(prepared.context.sourceDir, payload.json), job.id, 120000));
    // Evidence becomes code links, so only locations that exist in the pinned snapshot are posted.
    const evidence = result.evidence.filter(e => readable(e, prepared.context)).map(e => ({ ...e, reason: redact(e.reason) }));
    const text = (v: string | null) => v === null ? null : redact(v);
    await lease(); const latest = await platform.snapshot(target.number, true);
    if (latest.headSha !== snap.headSha || latest.baseSha !== snap.baseSha || latest.startSha !== snap.startSha) throw new Error('Answer snapshot changed; retry against latest code');
    await platform.reply(target.number, renderAnswer({ premise: text(result.premise), answer: redact(result.answer), why: text(result.why), evidence, unverified: text(result.unverified), dropped: result.evidence.length - evidence.length }, snap, key), comment.parentId, comment.discussionId);
  }
  /** Replies at once to an explicit command so its author knows it was received before the queue reaches it. */
  async acknowledge(event: Event, jobId: string): Promise<void> {
    const comment = event.comment; if (event.kind !== 'command' || !comment) return;
    const platform = this.platform(event.target), normalized = normalizeMention(platform, comment.body);
    if (!parseCommand(normalized) && !/^\/(?:hey|reviewbot)\b/i.test(normalized.trim())) return;
    if (await platform.permission(comment.author) === 'none') return;
    await platform.reply(event.target.number, renderAck(commentKey(comment)), comment.parentId, comment.discussionId);
    // A command that finished while the notice was being posted could not find it, so settle it here.
    const job = await this.store.getJob(jobId);
    const settled: Partial<Record<string, Exclude<AckState, 'received'> | 'done'>> = { completed: 'done', failed: 'failed', superseded: 'closed' };
    const state = job && settled[job.state]; if (state) await this.settleAck(platform, event.target.number, comment, state);
  }
  /** Deletes the received notice once the command is done, or rewrites it to say why it was not handled. */
  private async settleAck(platform: Platform, number: number, comment: Comment, state: Exclude<AckState, 'received'> | 'done' = 'done'): Promise<void> {
    try {
      const marker = ackMarker(commentKey(comment)), seen = new Set<string>();
      // GitLab lists the same note as a comment and as a discussion note.
      const acks = [...await platform.comments(number), ...await platform.inlineComments(number)].filter(c => platform.owned(c) && c.body.includes(marker) && !seen.has(`${c.surface}:${c.id}`) && seen.add(`${c.surface}:${c.id}`));
      const body = state === 'done' ? '' : renderAck(commentKey(comment), state);
      for (const ack of acks) {
        if (state === 'done') await platform.deleteComment(number, ack);
        else if (ack.body !== body) await platform.editComment(number, ack, body);
      }
    } catch { console.error(JSON.stringify({ repository: platform.config.repository, number, error: 'ack_settle_failed' })); }
  }
  // The summary comment says a review is running before the model starts; a failed notice must not block the review.
  private async announce(platform: Platform, snap: Snapshot, mode: 'full' | 'incremental', previous: Report | null): Promise<void> {
    try {
      const prior = previous && sameRevision(previous.snapshot, snap) ? { report: previous, results: await this.store.answerResults(previous.snapshot) } : undefined;
      const body = renderProgress(snap, await this.store.reviewEstimate(mode), prior);
      const existing = (await platform.comments(snap.number)).find(c => platform.owned(c) && c.body.includes(summaryMarker(snap)));
      if (existing?.body !== body) await platform.comment(snap.number, body, existing?.id);
    } catch { console.error(JSON.stringify({ repository: platform.config.repository, number: snap.number, error: 'progress_notice_failed' })); }
  }
  // Re-render the summary so each question shows its latest grade; a stale or superseded report is left alone.
  private async refreshSummary(platform: Platform, report: Report, allowClosed = false): Promise<void> {
    try {
      if (!sameRevision(report.snapshot, await platform.snapshot(report.snapshot.number, allowClosed))) return;
      const body = renderReport(report, await this.store.answerResults(report.snapshot));
      const comments = await platform.comments(report.snapshot.number);
      // Upgrade a pre-marker current summary only when every stored question ID proves its revision.
      const existing = comments.find(c => platform.owned(c) && c.body.includes(summaryMarker(report.snapshot)))
        ?? (hasChangeQuestions(report) ? comments.find(c => platform.owned(c) && c.body.includes(SUMMARY_MARKER) && !c.body.includes('<!-- codereviewbot:revision:')
          && report.questions.every(q => c.body.includes(`<!-- codereviewbot:question:${questionId(report.snapshot, q)} -->`))) : undefined);
      const historical = existing ? new Set<string>() : await this.historicalComments(platform, report.snapshot);
      const retiredSummary = comments.some(c => historical.has(commentKey(c)) && c.body.includes(summaryMarker(report.snapshot)));
      if ((existing || retiredSummary) && existing?.body !== body && body.length <= 60000) await platform.comment(report.snapshot.number, body, existing?.id);
    } catch { console.error(JSON.stringify({ repository: platform.config.repository, number: report.snapshot.number, error: 'summary_refresh_failed' })); }
  }
  private async historicalComments(platform: Platform, target: Target): Promise<Set<string>> {
    return platform.config.retiredBotLogins?.length ? this.store.botCommentHistory(target) : new Set();
  }
  // Gate failures (e.g. a missing status permission) must not block publishing; recovery retries every minute.
  private async syncGate(platform: Platform, report: Report): Promise<void> {
    try { await syncAnswerGate(platform, this.store, report); }
    catch { console.error(JSON.stringify({ repository: platform.config.repository, number: report.snapshot.number, error: 'answer_gate_failed' })); }
  }
  private async enqueueFromCommand(job: Job, platform: Platform): Promise<void> {
    const snap = await platform.snapshot(job.body.target.number, true);
    await this.store.enqueue({ kind: 'review', target: job.body.target, headSha: snap.headSha, deliveryId: `${job.id}:tryagain`, regenerate: true, requested: true });
  }
  readonly maintenance = new Map<string, Promise<void>>();
  maintain(task: 'reconcile' | 'recover' | 'cleanup'): Promise<void> {
    if (this.stopping) return Promise.resolve();
    const current = this.maintenance.get(task); if (current) return current;
    const operation = (async () => {
      if (task === 'cleanup') {
        await this.store.cleanupWorkspaces(protectedJobs => this.workspaces.cleanup(undefined, protectedJobs)); return;
      }
      for (const platform of this.platforms) {
        try {
          if (task === 'reconcile') {
            for (const number of await platform.openNumbers()) {
              const snap = await platform.snapshot(number), state = await this.store.getTarget(snap);
              if (state?.report && sameRevision(state.report.snapshot, snap)) await this.syncGate(platform, state.report);
            }
          } else {
            // Only previously admitted merge/manual work is eligible for automatic retry.
            for (const target of await this.store.recoveryTargets(platform.config)) {
              const snap = await platform.snapshot(target.number, true), retry = await this.store.recoveryEvent(snap);
              if (retry) await this.store.enqueue(retry);
            }
          }
        } catch { console.error(JSON.stringify({ repository: platform.config.repository, task, error: 'recovery_fetch_failed' })); }
      }
    })().finally(() => { this.maintenance.delete(task); });
    this.maintenance.set(task, operation);
    return operation;
  }
  async recover(): Promise<void> {
    if (this.reconciling || this.stopping) return; this.reconciling = true;
    try { for (const task of ['reconcile','recover','cleanup'] as const) await this.maintain(task); }
    finally { this.reconciling = false; }
  }
}
/** @hey helps a teammate understand this PR/MR and its code: premise first, then the answer, its reason and checked code locations. */
function askPrompt(sourceDir: string, payload: string): string {
  return `당신은 이 저장소의 시니어 엔지니어입니다. 동료가 이 PR/MR과 코드에 관해 물었습니다. 동료가 이 변경과 코드를 이해하도록 한국어로 답하세요.

[답의 구성]

1. premise: 질문의 전제가 코드와 다르면(없는 함수나 동작, 반대로 이해한 동작, 이 변경이 바꾸지 않은 것) 무엇이 다르고 실제로는 어떤지 1~2문장으로 먼저 바로잡으세요. 전제가 맞으면 null입니다.
2. answer: 질문에 대한 직접적인 답을 1~3문장으로 씁니다. 배경 설명으로 시작하지 마세요.
3. why: 왜 그렇게 동작하는지, 또는 이 변경이 왜 그렇게 바꿨는지 1~4문장으로 씁니다. 변경 전후의 차이와, 그 변경이 지키는 보장이나 막는 위험을 연결하세요. 답만으로 충분한 조회 질문이면 null입니다.
4. evidence: answer·why·premise의 사실을 뒷받침하는 코드 위치 {path, line, side, reason}입니다. 직접 읽어 확인한 줄만 적습니다. 변경 후 코드는 RIGHT, 변경 전 코드는 LEFT입니다.
5. unverified: 코드로 확인하지 못한 것(런타임 설정, 외부 서비스 동작, 배포 환경, 작성자의 의도 등)을 1~2문장으로 적습니다. 없으면 null입니다.

[질문 종류별]

- 조회(어디서·무엇을·몇 번처럼 코드에서 찾으면 되는 질문): answer와 evidence면 충분합니다. CS 개념은 설명하지 마세요.
- 설계·이유(왜 이렇게 했는지, 대안과 비교): answer 다음 why에서 이 변경이 얻는 보장과 치르는 대가를 설명하세요. 판단이 CS 원리에 달려 있을 때만 그 원리를 이름과 함께 한 문장으로 설명합니다.
- 전제가 틀린 질문: premise에서 먼저 바로잡고, 바로잡은 전제 위에서 답하세요.

[근거와 범위]

- ${sourceTools(sourceDir)} 질문에 답하는 데 필요한 코드만 확인하세요. diff에는 이번 변경의 패치가 있습니다.
- report.questions는 이미 출제된 질문이며 정답은 포함하지 않습니다.
- ${grounding}
- 명령어 예시나 명령어 표를 답에 넣지 마세요.

[예시]

아래 예시는 기준을 보여 주기 위한 것이며 이 저장소와 무관합니다.
질문: "재시도할 때마다 새 멱등 키를 만드는 이유가 뭔가요?"
- 나쁜 답: "멱등성은 같은 요청을 여러 번 보내도 결과가 같은 성질입니다. 분산 시스템에서는…" — 잘못된 전제를 지나치고 개념 강의로 시작합니다.
- 좋은 답: premise "이 변경은 새 키를 만들지 않습니다. 첫 요청의 키를 저장해 재시도에 재사용합니다." answer "그래서 타임아웃 뒤 재시도해도 외부 승인 서비스가 같은 요청으로 알아보고 승인을 한 번만 합니다." evidence [pay.ts:12 키 저장, pay.ts:20 재시도에서 저장된 키 사용]

[출력]

지정된 출력 스키마에 맞는 JSON만 반환하세요.

${answerSecurity}

질문 자료(JSON 데이터):
${payload}`;
}
function normalizeMention(platform: Platform, body: string): string {
  const mention = platform.config.botLogin.replace(/\[bot\]$/, '');
  return body.replace(new RegExp(`^@${mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i'), '@hey ');
}

// Names the failure for operators without echoing model output: schema errors keep field paths and issue codes only.
function describeFailure(error: unknown): string {
  if (error instanceof z.ZodError) return `schema mismatch: ${error.issues.slice(0, 5).map(i => `${i.path.map(String).join('.') || '(root)'} ${i.code}`).join(', ')}`;
  if (error instanceof SyntaxError) return 'invalid JSON from runner';
  return redact(error instanceof Error ? `${error.constructor.name}: ${error.message}` : 'unknown').slice(0, 300);
}
