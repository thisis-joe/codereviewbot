import { isBotLogin } from './config.js';
import { createHash, randomUUID } from 'node:crypto';
import type { Target, Report } from './contracts.js';
import { hasChangeQuestions } from './contracts.js';
import type { Platform } from './platform.js';
import type { Authenticated } from './webhooks.js';
import { Store, targetKey } from './store.js';
import { plain, summaryMarker } from './render.js';
import { redact } from './redact.js';

type PushCommit = { id: string; subject: string; timestamp: number | null; parentCount?: number };
type Notification = { kind: 'opened' | 'reopened' | 'merged' | 'closed'; title: string }
  | { kind: 'questions'; title: string; count: number; noteId: string; partial?: boolean }
  | { kind: 'commented'; title: string; noteId: string; author?: string; preview?: string }
  | { kind: 'push'; branch: string; count: number; author: string; before: string; after: string; commits?: PushCommit[] };
interface Pending { key: string; target: Target; payload: Notification; owner: string; attempts: number }
const repositoryKey = (t: Pick<Target, 'platform' | 'instance' | 'repository'>) => JSON.stringify([t.platform, t.instance, t.repository]);

// Store subjects, ordering and parent counts; never trust webhook-provided URLs.
function pushCommits(values: unknown): PushCommit[] {
  if (!Array.isArray(values)) return [];
  return [...new Map(values.flatMap(c => {
    if (!c || typeof c.id !== 'string' || !/^[a-f0-9]{40,64}$/.test(c.id)) return [];
    const message = typeof c.message === 'string' ? c.message : typeof c.title === 'string' ? c.title : '';
    const subject = redact(message).trim().split(/[\r\n]/, 1)[0]!.trim().slice(0, 500);
    if (!subject) return [];
    const timestamp = Date.parse(c.timestamp ?? c.committed_date ?? c.created_at);
    const parents = Array.isArray(c.parent_ids) && c.parent_ids.every((id: unknown) => typeof id === 'string' && /^[a-f0-9]{40,64}$/.test(id)) ? c.parent_ids : undefined;
    return [[c.id, { id: c.id, subject, timestamp: Number.isFinite(timestamp) ? timestamp : null, ...(parents ? { parentCount: parents.length } : {}) }] as const];
  })).values()];
}

export function givenName(display: string): string {
  const name = display.split(/[\[(_]/, 1)[0]!.trim();
  if (!name) return '작성자';
  const parts = name.split(/\s+/), first = parts[0]!;
  if (/^[가-힣]$/.test(first) && parts[1]) return parts[1];
  if (/^[가-힣]{2,4}$/.test(first)) return first.slice(/^(남궁|황보|제갈|선우|독고|서문|사공|동방)/.test(first) ? 2 : 1);
  return first;
}

export function renderNotification(target: Target, notification: Notification, author: string): string {
  const project = `${target.instance}/${target.repository.split('/').map(encodeURIComponent).join('/')}`;
  if (notification.kind === 'push') {
    const who = plain(givenName(notification.author)), branch = plain(redact(notification.branch));
    const created = /^0+$/.test(notification.before);
    const link = created ? `${project}/-/commits/${encodeURIComponent(notification.branch).replace(/[()]/g, c => c === '(' ? '%28' : '%29')}` : `${project}/-/compare/${notification.before}...${notification.after}`;
    const commits = notification.commits ?? [];
    const classified = commits.length === notification.count && commits.every(c => c.parentCount !== undefined);
    const merges = commits.filter(c => c.parentCount !== undefined && c.parentCount > 1).length;
    const counts = classified ? `변경 커밋 ${notification.count - merges}개 · 병합 커밋 ${merges}개` : `전체 커밋 ${notification.count}개 · 분류 미확인`;
    const headline = created ? `**${who}**님의 **새 브랜치가 생겼어요.** 🌱` : `**${who}**님의 **${counts}**가 올라왔어요. 🚀`;
    const lines = created ? [] : [...commits].filter(c => c.parentCount !== undefined && c.parentCount <= 1)
      .sort((a, b) => (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity))
      .map(c => {
        const match = /^([a-zA-Z]+(?:\([^\r\n]*?\))?!?:)\s+(.+)$/.exec(c.subject);
        const label = match ? `*${plain(match[1]!)}* **${plain(match[2]!)}**` : `**${plain(c.subject)}**`;
        return `- [${label}](${project}/-/commit/${c.id})`;
      });
    return `${headline}\n[**${branch}**](${link})${lines.length ? '\n\n' + lines.join('\n') : ''}`;
  }
  const url = `${project}/-/merge_requests/${target.number}`;
  const link = 'noteId' in notification ? `${url}#note_${notification.noteId}` : url;
  const who = plain(givenName(notification.kind === 'commented' ? notification.author ?? author : author));
  const labels = {
    questions: `**${who}**님의 MR에 **질문이 준비됐어요.** 🧩`,
    opened: `**${who}**님이 **새 MR**을 열었어요. 📬`,
    reopened: `**${who}**님이 **MR을 다시 열었어요.** 🔄`,
    merged: `**${who}**님의 **MR이 머지됐어요!** 🎉`,
    closed: `**${who}**님의 **MR이 닫혔어요.** 🗃️`,
    commented: `**${who}**님이 MR에 **댓글을 남겼어요.** 💬`,
  };
  const preview = notification.kind === 'commented' && notification.preview ? `\n\n*“${plain(redact(notification.preview))}”*` : '';
  return `${labels[notification.kind]}\n[**MR !${target.number} · ${plain(redact(notification.title).slice(0, 500))}**](${link})${preview}`;
}

/** Destinations come only from trusted per-repository configuration, never webhook data. */
export class Mattermost {
  active: Promise<void> | null = null;
  private readonly destinations = new Map<string, { platform: Platform; url: string }>();
  constructor(readonly store: Store, platforms: Platform[], env: NodeJS.ProcessEnv = process.env, readonly transport: typeof fetch = fetch) {
    for (const platform of platforms) {
      const config = platform.config, value = config.mattermostWebhookEnv && env[config.mattermostWebhookEnv];
      if (config.platform !== 'gitlab' || config.enabled === false || !value) continue;
      let url: URL;
      try { url = new URL(value); } catch { throw new Error('Invalid Mattermost webhook URL'); }
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/^\/hooks\/[a-z0-9]+$/i.test(url.pathname)) throw new Error('Invalid Mattermost webhook URL');
      this.destinations.set(repositoryKey(config), { platform, url: url.toString() });
    }
  }
  private async enqueue(target: Target, source: string, payload: Notification): Promise<boolean> {
    if (!this.destinations.has(repositoryKey(target))) return false;
    const key = createHash('sha256').update(`${targetKey(target)}:${source}`).digest('hex');
    return Boolean((await this.store.pool.query('INSERT INTO mattermost_notifications(key,target,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING key', [key, target, payload])).rowCount);
  }
  async capture(input: Authenticated): Promise<boolean> {
    if (!this.destinations.has(repositoryKey(input.repo))) return false;
    const { body: b, repo, deliveryId } = input, a = b.object_attributes;
    if (b.object_kind === 'push') {
      if (typeof b.ref !== 'string' || !b.ref.startsWith('refs/heads/') || b.ref.length > 250 || !/^[a-f0-9]{40,64}$/.test(b.before) || !/^[a-f0-9]{40,64}$/.test(b.after) || /^0+$/.test(b.after)) return false;
      const count = Number.isSafeInteger(b.total_commits_count) && b.total_commits_count >= 0 ? b.total_commits_count : Array.isArray(b.commits) ? b.commits.length : 0;
      return this.enqueue({ platform: repo.platform, instance: repo.instance, repository: repo.repository, number: 0 }, `push:${deliveryId}`, {
        kind: 'push', branch: b.ref.slice('refs/heads/'.length), count,
        commits: pushCommits(b.commits),
        author: typeof b.user_name === 'string' ? b.user_name.slice(0, 200) : '', before: b.before, after: b.after,
      });
    }
    const number = b.object_kind === 'merge_request' ? a?.iid : b.merge_request?.iid;
    if (!Number.isSafeInteger(number) || number <= 0) return false;
    const target: Target = { platform: repo.platform, instance: repo.instance, repository: repo.repository, number };
    const title = b.object_kind === 'merge_request' ? a?.title : b.merge_request?.title;
    if (typeof title !== 'string' || !title.trim()) return false;
    if (b.object_kind === 'merge_request') {
      const kinds = { open: 'opened', reopen: 'reopened', merge: 'merged', close: 'closed' } as const;
      const kind = kinds[a?.action as keyof typeof kinds];
      return typeof kind === 'string' ? this.enqueue(target, `event:${deliveryId}`, { kind, title: title.slice(0, 500) }) : false;
    }
    // Bot progress, inline questions, acknowledgements and grading remain on GitLab.
    if (b.object_kind === 'note' && a?.noteable_type === 'MergeRequest' && !a.system && (!a.action || a.action === 'create') && !isBotLogin(repo, b.user?.username ?? '') && /^\d+$/.test(String(a.id))) {
      const firstLine = typeof a.note === 'string' ? redact(a.note).trim().split(/[\r\n]/, 1)[0]! : '';
      return this.enqueue(target, `comment:${a.id}`, {
        kind: 'commented', title: title.slice(0, 500), noteId: String(a.id),
        author: typeof b.user?.name === 'string' ? b.user.name.slice(0, 200) : '',
        preview: firstLine.slice(0, 200) + (firstLine.length > 200 ? '…' : ''),
      });
    }
    return false;
  }
  async questionsPublished(platform: Platform, report: Report): Promise<void> {
    if (!this.destinations.has(repositoryKey(platform.config)) || !hasChangeQuestions(report)) return;
    const marker = summaryMarker(report.snapshot);
    const comment = (await platform.comments(report.snapshot.number)).find(c => platform.owned(c) && c.body.includes(marker));
    if (!comment || !/^\d+$/.test(comment.id)) throw new Error('Published question comment unavailable');
    await this.enqueue(report.snapshot, `questions:${marker}`, { kind: 'questions', title: report.snapshot.title, count: report.questions.length, noteId: comment.id, ...(report.state === 'partial' ? { partial: true } : {}) });
  }
  tick(): void {
    if (this.active || !this.destinations.size) return;
    this.active = this.dispatch().catch(() => console.error('{"event":"mattermost_failed","error":"queue_unavailable"}')).finally(() => { this.active = null; });
  }
  private async dispatch(): Promise<void> {
    const job: Pending | undefined = await this.store.transaction(async c => {
      // A restart after a write cannot prove whether the remote message was accepted.
      await c.query("UPDATE mattermost_notifications SET state='uncertain',owner=NULL,lease_until=NULL,error='expired_delivery',updated_at=now() WHERE state='sending' AND lease_until<now()");
      const row = (await c.query("SELECT * FROM mattermost_notifications WHERE state='queued' AND due_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
      if (!row) return;
      return (await c.query("UPDATE mattermost_notifications SET state='sending',owner=$2,attempts=attempts+1,lease_until=now()+interval '3 minutes',updated_at=now() WHERE key=$1 RETURNING *", [row.key, randomUUID()])).rows[0];
    });
    if (!job) return;
    const settle = async (state: string, error: string | null = null) => {
      await this.store.pool.query("UPDATE mattermost_notifications SET state=$3,error=$4,owner=NULL,lease_until=NULL,due_at=now()+interval '30 seconds',updated_at=now() WHERE key=$1 AND owner=$2 AND state='sending'", [job.key, job.owner, state, error]);
      console.info(JSON.stringify({ event: 'mattermost_delivery', state, repository: job.target.repository, number: job.target.number, ...(error ? { error } : {}) }));
    };
    const destination = this.destinations.get(repositoryKey(job.target));
    if (!destination) { await settle('failed', 'destination_unavailable'); return; }
    let author = '';
    if (job.payload.kind === 'push' && !/^0+$/.test(job.payload.before) && ((job.payload.commits?.length ?? 0) !== job.payload.count || job.payload.commits?.some(c => c.parentCount === undefined))) {
      try {
        const comparison = await destination.platform.api.request(`${destination.platform.root}/repository/compare?from=${job.payload.before}&to=${job.payload.after}&straight=true`);
        const commits = pushCommits(comparison?.commits);
        if (comparison?.compare_timeout || comparison?.overflow || commits.length !== job.payload.count) throw new Error('Incomplete push commits');
        for (const commit of commits) {
          if (commit.parentCount !== undefined) continue;
          const detail = await destination.platform.api.request(`${destination.platform.root}/repository/commits/${commit.id}`);
          const resolved = pushCommits([detail])[0];
          if (resolved?.id !== commit.id || resolved.parentCount === undefined) throw new Error('Missing commit parents');
          commit.parentCount = resolved.parentCount;
        }
        job.payload.commits = commits;
      } catch { await settle(job.attempts < 3 ? 'queued' : 'failed', 'commits_lookup_failed'); return; }
    }
    if (job.payload.kind !== 'push' && !(job.payload.kind === 'commented' && job.payload.author !== undefined)) {
      try {
        const mr = await destination.platform.api.request(`${destination.platform.root}/merge_requests/${job.target.number}`);
        author = typeof mr.author?.name === 'string' ? mr.author.name : '';
      } catch { await settle(job.attempts < 3 ? 'queued' : 'failed', 'author_lookup_failed'); return; }
    }
    const payload = { username: 'hey', text: renderNotification(job.target, job.payload, author), ...(destination.platform.config.mattermostChannel ? { channel: destination.platform.config.mattermostChannel } : {}) };
    try {
      const response = await this.transport(destination.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(5000) });
      await response.body?.cancel();
      if (response.status === 429 && job.attempts < 3) await settle('queued', 'rate_limited');
      else await settle(response.ok ? 'sent' : 'failed', response.ok ? null : `http_${response.status}`);
    } catch {
      // Never auto-repeat an ambiguous write; it may already be visible in the channel.
      await settle('uncertain', 'delivery_unknown');
    }
  }
}
