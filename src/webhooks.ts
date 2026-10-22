import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { RepositoryConfig } from './config.js';
import type { Target, Snapshot } from './contracts.js';

export interface Comment { id: string; body: string; author: string; parentId: string | null; discussionId: string | null; surface: 'issue' | 'review' | 'note' }
export function commentKey(comment: Comment): string { return `${comment.surface}-${comment.id}`; }
// `requested` marks work a person asked for by command; only that work also runs on a closed or merged PR/MR.
export interface Event { kind: 'review' | 'ci' | 'command' | 'closed'; target: Target; deliveryId: string; headSha?: string; regenerate?: boolean; requested?: boolean; recoveryAttempt?: number; recoverySnapshot?: Snapshot; comment?: Comment }
export interface Authenticated { repo: RepositoryConfig; deliveryId: string; event: string; body: any }
export function equal(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}
export function authenticate(platform: 'github' | 'gitlab', headers: Record<string, string | string[] | undefined>, raw: Buffer, repos: RepositoryConfig[], env: NodeJS.ProcessEnv = process.env, now = Date.now() / 1000): Authenticated {
  if (raw.length > 2 * 1024 * 1024) throw new Error('Webhook too large');
  const body = JSON.parse(raw.toString('utf8'));
  const repository = platform === 'github' ? body.repository?.full_name : body.project?.path_with_namespace;
  const header = (key: string) => typeof headers[key] === 'string' ? headers[key] as string : '';
  for (const repo of repos.filter(r => r.platform === platform && r.repository === repository && r.enabled !== false)) {
    const secret = env[repo.webhookSecretEnv]; if (!secret) continue;
    let valid = false;
    if (platform === 'github') valid = equal(`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`, header('x-hub-signature-256'));
    else if (repo.webhookAuth === 'secret') valid = equal(secret, header('x-gitlab-token'));
    else {
      const timestamp = header('webhook-timestamp'), id = header('webhook-id');
      if (/^\d+$/.test(timestamp) && id && Math.abs(now - Number(timestamp)) <= 300) {
        const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
        if (key.length >= 16) {
          const signature = `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.`).update(raw).digest('base64')}`;
          valid = header('webhook-signature').split(' ').some(s => equal(signature, s));
        }
      }
    }
    if (valid) return { repo, body, event: header(platform === 'github' ? 'x-github-event' : 'x-gitlab-event'),
      deliveryId: header(platform === 'github' ? 'x-github-delivery' : 'webhook-id') || header('x-gitlab-event-uuid') || createHash('sha256').update(raw).digest('hex') };
  }
  throw new Error('Webhook authentication failed or repository not allowed');
}
export function normalize(input: Authenticated): Event[] {
  const { repo: r, body: b, deliveryId, event } = input;
  const base = (number: unknown): Target | null => Number.isSafeInteger(number) && Number(number) > 0 ? { platform: r.platform, instance: r.instance, repository: r.repository, number: Number(number) } : null;
  const output = (kind: Event['kind'], number: unknown, extra: Partial<Event> = {}): Event[] => { const target = base(number); return target ? [{ kind, target, deliveryId, ...extra }] : []; };
  if (r.platform === 'github') {
    if (event === 'pull_request') {
      if (b.action === 'closed') return output('closed', b.pull_request?.number);
      if (['opened', 'reopened', 'synchronize', 'ready_for_review'].includes(b.action) || (b.action === 'edited' && b.changes?.base)) return output('review', b.pull_request?.number, { headSha: b.pull_request?.head?.sha });
    }
    if (['issue_comment', 'pull_request_review_comment'].includes(event) && b.action === 'created' && (b.issue?.pull_request || b.pull_request)) {
      const c = b.comment;
      if (!c || c.user?.type === 'Bot' || c.user?.login === r.botLogin || c.body?.length > 8000) return [];
      return output('command', b.issue?.number ?? b.pull_request?.number, { comment: { id: String(c.id), body: String(c.body ?? ''), author: c.user?.login ?? '', parentId: c.in_reply_to_id ? String(c.in_reply_to_id) : null, discussionId: null, surface: event === 'issue_comment' ? 'issue' : 'review' } });
    }
  } else {
    const a = b.object_attributes;
    if (b.object_kind === 'merge_request') {
      if (['close', 'merge'].includes(a?.action)) return output('closed', a.iid);
      if (['open', 'reopen'].includes(a?.action) || (a?.action === 'update' && (a.oldrev || b.changes?.target_branch))) return output('review', a.iid, { headSha: a.last_commit?.id });
    }
    if (b.object_kind === 'note' && a?.noteable_type === 'MergeRequest' && (!a.action || a.action === 'create') && b.user?.username !== r.botLogin && a.note?.length <= 8000) {
      return output('command', b.merge_request?.iid, { comment: { id: String(a.id), body: a.note ?? '', author: b.user?.username ?? '', parentId: null, discussionId: a.discussion_id ?? null, surface: 'note' } });
    }
  }
  return [];
}
