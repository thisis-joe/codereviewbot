import { ApiClient, HttpError, type TokenSource } from './http-client.js';
import type { RepositoryConfig } from './config.js';
import { Sha, type Snapshot, type Target, type Check, type Candidate } from './contracts.js';

export interface RemoteComment { id: string; body: string; author: string; url: string; discussionId?: string }
export interface InlineInput { path: string; oldPath: string; line: number; side?: 'LEFT' | 'RIGHT'; body: string; suggestion: Candidate['suggestion'] }
export class Platform {
  readonly api: ApiClient;
  readonly root: string;
  constructor(readonly config: RepositoryConfig, readonly token: TokenSource) {
    this.api = new ApiClient(config.platform === 'github' ? config.instance : `${config.instance}/api/v4`, config.platform, token);
    this.root = config.platform === 'github' ? `/repos/${config.repository.split('/').map(encodeURIComponent).join('/')}` : `/projects/${encodeURIComponent(config.repository)}`;
  }
  target(number: number): Target { return { platform: this.config.platform, instance: this.config.instance, repository: this.config.repository, number }; }
  async snapshot(number: number): Promise<Snapshot> {
    const gh = this.config.platform === 'github';
    const pr = await this.api.request(`${this.root}/${gh ? 'pulls' : 'merge_requests'}/${number}`);
    if ((gh && (pr.state !== 'open' || pr.merged)) || (!gh && pr.state !== 'opened')) throw new HttpError(410, 'PR/MR is closed');
    let baseSha: string, headSha: string, startSha: string;
    if (gh) {
      headSha = Sha.parse(pr.head?.sha); startSha = Sha.parse(pr.base?.sha);
      const comparison = await this.api.request(`${this.root}/compare/${startSha}...${headSha}`);
      baseSha = Sha.parse(comparison.merge_base_commit?.sha);
    } else {
      baseSha = Sha.parse(pr.diff_refs?.base_sha); headSha = Sha.parse(pr.diff_refs?.head_sha); startSha = Sha.parse(pr.diff_refs?.start_sha);
    }
    const webUrl = String(gh ? pr.html_url : pr.web_url);
    const web = new URL(webUrl), allowed = new URL(this.config.instance);
    const expectedHost = allowed.hostname === 'api.github.com' ? 'github.com' : allowed.hostname;
    if (web.protocol !== 'https:' || web.hostname !== expectedHost) throw new Error('Unexpected PR/MR web URL');
    return { ...this.target(number), baseSha, headSha, startSha, previousSha: null, policyVersion: 'default', title: String(pr.title ?? '').slice(0, 500), description: String((gh ? pr.body : pr.description) ?? '').slice(0, 20000), webUrl };
  }
  async openNumbers(): Promise<number[]> {
    const gh = this.config.platform === 'github';
    return (await this.api.pages(`${this.root}/${gh ? 'pulls?state=open' : 'merge_requests?state=opened&scope=all'}`)).map(p => Number(gh ? p.number : p.iid));
  }
  async comments(number: number): Promise<RemoteComment[]> {
    const gh = this.config.platform === 'github';
    const values = await this.api.pages(`${this.root}/${gh ? 'issues' : 'merge_requests'}/${number}/${gh ? 'comments' : 'notes'}`);
    return values.map(c => ({ id: String(c.id), body: String(c.body ?? ''), author: String(gh ? c.user?.login : c.author?.username), url: c.html_url ?? '', discussionId: c.discussion_id }));
  }
  async inlineComments(number: number): Promise<RemoteComment[]> {
    if (this.config.platform === 'github') return (await this.api.pages(`${this.root}/pulls/${number}/comments`)).map(c => ({ id: String(c.id), body: String(c.body ?? ''), author: String(c.user?.login), url: c.html_url ?? '' }));
    const discussions = await this.api.pages(`${this.root}/merge_requests/${number}/discussions`);
    return discussions.flatMap(d => (d.notes ?? []).map((n: any) => ({ id: String(n.id), body: String(n.body ?? ''), author: String(n.author?.username), url: '', discussionId: String(d.id) })));
  }
  owned(c: RemoteComment): boolean { return c.author === this.config.botLogin; }
  async comment(number: number, body: string, id?: string): Promise<unknown> {
    const gh = this.config.platform === 'github';
    const path = id ? `${this.root}/${gh ? 'issues/comments' : `merge_requests/${number}/notes`}/${encodeURIComponent(id)}` : `${this.root}/${gh ? 'issues' : 'merge_requests'}/${number}/${gh ? 'comments' : 'notes'}`;
    return this.api.request(path, id ? (gh ? 'PATCH' : 'PUT') : 'POST', { body });
  }
  async inline(s: Snapshot, value: InlineInput): Promise<unknown> {
    if (this.config.platform === 'github') {
      return this.api.request(`${this.root}/pulls/${s.number}/comments`, 'POST', { commit_id: s.headSha, path: value.path, line: value.suggestion?.endLine ?? value.line, side: value.side ?? 'RIGHT', body: value.body,
        ...(value.suggestion && value.suggestion.startLine !== value.suggestion.endLine ? { start_line: value.suggestion.startLine, start_side: 'RIGHT' } : {}) });
    }
    return this.api.request(`${this.root}/merge_requests/${s.number}/discussions`, 'POST', { body: value.body,
      position: { position_type: 'text', base_sha: s.baseSha, start_sha: s.startSha, head_sha: s.headSha, old_path: value.oldPath, new_path: value.path, ...(value.side === 'LEFT' ? { old_line: value.line } : { new_line: value.line }) } });
  }
  async reply(number: number, body: string, parentId: string | null, discussionId: string | null): Promise<unknown> {
    if (this.config.platform === 'github' && parentId) return this.api.request(`${this.root}/pulls/${number}/comments/${encodeURIComponent(parentId)}/replies`, 'POST', { body });
    if (this.config.platform === 'gitlab' && discussionId) return this.api.request(`${this.root}/merge_requests/${number}/discussions/${encodeURIComponent(discussionId)}/notes`, 'POST', { body });
    return this.comment(number, body);
  }
  async permission(username: string): Promise<'none' | 'write' | 'maintain'> {
    if (!username || username === this.config.botLogin) return 'none';
    try {
      if (this.config.platform === 'github') {
        const p = await this.api.request(`${this.root}/collaborators/${encodeURIComponent(username)}/permission`);
        if (['admin', 'maintain'].includes(p.permission)) return 'maintain';
        return p.permission === 'write' ? 'write' : 'none';
      }
      const users = await this.api.request(`/users?username=${encodeURIComponent(username)}`);
      if (!users[0]?.id) return 'none';
      const member = await this.api.request(`${this.root}/members/all/${Number(users[0].id)}`);
      return member.access_level >= 40 ? 'maintain' : member.access_level >= 30 ? 'write' : 'none';
    } catch (e) { if (e instanceof HttpError && [403, 404].includes(e.status)) return 'none'; throw e; }
  }
  async checks(s: Snapshot): Promise<Check[]> {
    const result: Check[] = [];
    try {
      if (this.config.platform === 'github') {
        let page = 1;
        for (;;) {
          const runs = await this.api.request(`${this.root}/commits/${s.headSha}/check-runs?per_page=100&page=${page}`);
          const items = runs.check_runs ?? [];
          for (const c of items) if (c.head_sha === s.headSha) {
            result.push({ name: `CI: ${c.name}`, status: c.status !== 'completed' ? 'pending' : ['success', 'neutral', 'skipped'].includes(c.conclusion) ? 'passed' : 'failed', detail: `${c.output?.title ?? ''}\n${c.output?.summary ?? ''}\n${c.output?.text ?? ''}`.slice(0, 5500), url: c.html_url ?? null });
          }
          if (items.length < 100) break; if (++page > 10) throw new Error('Check pagination limit');
        }
        const legacy = await this.api.request(`${this.root}/commits/${s.headSha}/status`);
        const seen = new Set<string>();
        for (const c of legacy.statuses ?? []) if (!seen.has(c.context)) { seen.add(c.context); result.push({ name: `CI: ${c.context}`, status: c.state === 'success' ? 'passed' : c.state === 'pending' ? 'pending' : 'failed', detail: String(c.description ?? '').slice(0, 5500), url: c.target_url ?? null }); }
      } else {
        const pipelines = await this.api.pages(`${this.root}/merge_requests/${s.number}/pipelines`);
        const latest = pipelines.find(p => p.sha === s.headSha);
        if (latest) {
          const jobs = await this.api.pages(`${this.root}/pipelines/${Number(latest.id)}/jobs?include_retried=false`);
          for (const job of jobs) {
            let detail = `${job.name}: ${job.status}`;
            if (job.status === 'failed') {
              try { detail += '\n' + (await this.api.request(`${this.root}/jobs/${Number(job.id)}/trace`, 'GET', undefined, true)).slice(-5000); }
              catch { detail += '\n실패 로그 확인 불가'; }
            }
            result.push({ name: `CI: ${job.name}`, status: job.status === 'success' || job.status === 'skipped' ? 'passed' : ['failed', 'canceled'].includes(job.status) ? 'failed' : 'pending', detail: detail.slice(0, 5500), url: job.web_url ?? null });
          }
        }
      }
    } catch { result.push({ name: 'CI·정적 검사', status: 'unavailable', detail: '검사 결과 조회 실패. 권한 또는 API 상태를 확인하세요.', url: null }); }
    if (!result.length) result.push({ name: 'CI·정적 검사', status: 'not_run', detail: '이 커밋의 CI·정적 검사 결과 없음. 로컬 검사 미실행.', url: null });
    return result;
  }
  async linkedIssues(description: string): Promise<string[]> {
    const ids = [...new Set([...description.matchAll(/(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)].map(m => m[1]!))].slice(0, 5);
    return Promise.all(ids.map(async id => {
      try { const issue = await this.api.request(`${this.root}/issues/${id}`); return `#${id}: ${String(issue.title ?? '')}\n${String(issue.body ?? issue.description ?? '').slice(0, 6000)}`; }
      catch { return `#${id}: 연결된 이슈 확인 불가`; }
    }));
  }
}
