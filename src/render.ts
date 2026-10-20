import { checkNames, hasChangeQuestions, type Report, type Finding, type Snapshot } from './contracts.js';

export const SUMMARY_MARKER = '<!-- codereviewbot:summary:v1 -->';
const status = { running: '진행 중', completed: '완료', partial: '부분 완료', failed: '실패', paused: '일시정지' };
const findingStatus = { new: '새로 발견', open: '유지', fixed: '수정 확인', dismissed: '기각', unverified: '확인 불가' };
const checkStatus = { clear: '지적 없음', found: '발견', not_run: '미실행', pending: '진행 중', unavailable: '확인 불가', not_applicable: '해당 없음', passed: '통과', failed: '실패', skipped: '건너뜀', neutral: '중립' };
export function plain(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]{}()#+.!|~-])/g, '\\$1').replace(/@/g, '@\u200b').replace(/[\r\n]+/g, ' ');
}
export function codeLink(s: Snapshot, path: string, line?: number, side = 'RIGHT'): string {
  const u = new URL(s.webUrl);
  const repo = s.platform === 'github' ? u.pathname.split('/pull/')[0]! : u.pathname.split('/-/merge_requests/')[0]!;
  return `${u.origin}${repo}/${s.platform === 'github' ? 'blob' : '-/blob'}/${side === 'LEFT' ? s.baseSha : s.headSha}/${path.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`;
}
function ref(s: Snapshot, path: string, line?: number, side = 'RIGHT', labelLimit = 500): string {
  const half = Math.floor(labelLimit / 2);
  const label = path.length > labelLimit ? `${path.slice(0, half - 1)}…${path.slice(-half)}` : path;
  return `[${plain(label)}${line ? `:${line}` : ''}](${codeLink(s, path, line, side)})`;
}
function clip(value: string, length: number): string { return value.length > length ? value.slice(0, length) + '…' : value; }
function list(values: string[]): string { return values.length ? values.map(x => `- ${plain(x)}`).join('\n') : '없음'; }
function verdict(r: Report): string {
  if (r.state !== 'completed') return '판단 보류';
  const active = r.findings.filter(f => ['new', 'open', 'unverified'].includes(f.status));
  if (active.some(f => f.severity === 'P0' || f.severity === 'P1')) return '수정 필요';
  if (active.length || r.checks.some(c => c.status === 'failed' || c.status === 'unavailable' || c.status === 'pending')) return '확인 권장';
  return '현재 검토 범위에서 지적 없음';
}
export function renderReport(r: Report): string {
  const full = renderReportBody(r); if (full.length <= 60000) return full;
  const short = (value: string) => clip(value, 200);
  const sorted = [...r.findings].sort((a, b) => Number(['fixed', 'dismissed'].includes(a.status)) - Number(['fixed', 'dismissed'].includes(b.status)) || a.severity.localeCompare(b.severity) || a.id.localeCompare(b.id));
  for (const limit of [40, 20, 10, 5, 2, 1, 0]) {
    const tight = limit <= 2, excerpt = tight ? (value: string) => clip(value, 80) : short;
    const priority = (value: Report['checks'][number]) => ['failed', 'unavailable', 'pending', 'skipped', 'neutral', 'not_run', 'found', 'not_applicable', 'passed', 'clear'].indexOf(value.status);
    const compact: Report = { ...r, state: r.state === 'completed' ? 'partial' : r.state, summary: excerpt(r.summary),
      findings: sorted.slice(0, limit), checks: [...r.checks].sort((a, b) => priority(a) - priority(b)).slice(0, tight ? 5 : 30).map(c => ({ ...c, name: clip(c.name, 80), detail: clip(c.detail, tight ? 80 : 120) })), recommendedTests: r.recommendedTests.slice(0, tight ? 3 : 5).map(excerpt),
      questions: hasChangeQuestions(r) ? r.questions!.slice(0, 3) : undefined,
      limitations: [`댓글 길이 제한으로 내용·목록을 축약했습니다. 발견 사항 ${r.findings.length}건 중 ${Math.min(limit, r.findings.length)}건, 검사 ${r.checks.length}건 중 ${Math.min(tight ? 5 : 30, r.checks.length)}건을 표시합니다. 상세 내용은 인라인 댓글 또는 /reviewbot explain ID로 확인하세요.`, ...r.limitations.slice(0, tight ? 3 : 5).map(excerpt)] };
    const body = renderReportBody(compact, compact.checks.length < r.checks.length); if (body.length <= 60000) return body;
  }
  throw new Error('Report metadata exceeds comment budget');
}
function renderReportBody(r: Report, omittedChecks = false): string {
  const findings = [...r.findings].sort((a, b) => a.severity.localeCompare(b.severity) || a.path.localeCompare(b.path) || a.line - b.line || a.id.localeCompare(b.id));
  const rows = findings.map(f => `| ${f.id} | ${f.severity} | ${findingStatus[f.status]} | ${plain(f.title)} | ${ref({ ...r.snapshot, headSha: f.observedHeadSha ?? r.snapshot.headSha, baseSha: f.observedBaseSha ?? r.snapshot.baseSha }, f.side === 'LEFT' ? f.oldPath ?? f.path : f.path, f.line, f.side)} |`);
  const ci = (name: string) => !checkNames.slice(0, 6).includes(name as typeof checkNames[number]);
  const checks = r.checks.filter(c => ci(c.name) || ['failed', 'unavailable', 'pending', 'not_run'].includes(c.status))
    .map(c => `- ${plain(c.name)}: ${checkStatus[c.status]}${c.detail.trim() ? ` — ${plain(clip(c.detail.trim(), 200))}` : ''}`);
  if (!r.checks.some(c => ci(c.name))) checks.push(omittedChecks ? '- CI: 검사 목록이 축약되었습니다.' : '- CI: 확인된 실행 결과 없음');
  const s = r.snapshot, web = new URL(s.webUrl);
  const repo = s.platform === 'github' ? web.pathname.split('/pull/')[0]! : web.pathname.split('/-/merge_requests/')[0]!;
  const commit = `${web.origin}${repo}/${s.platform === 'github' ? 'commit' : '-/commit'}/${s.headSha}`;
  const questions = ['completed', 'partial'].includes(r.state) && hasChangeQuestions(r)
    ? r.questions!.map((q, i) => `${i + 1}. ${plain(q.question)} — ${ref(s, q.path, q.line, q.side, 80)}`)
    : [r.state === 'failed' ? '리뷰를 완료하지 못해 질문을 생성하지 못했습니다.'
      : r.state === 'running' || r.state === 'paused' ? '리뷰 완료 후 이번 변경에 대한 질문을 제공합니다.'
      : r.questionsUnavailableReason ? plain(r.questionsUnavailableReason)
      : '질문이 없는 이전 리뷰입니다. /reviewbot full로 다시 생성할 수 있습니다.'];
  return [SUMMARY_MARKER, '<!-- codereviewbot:format:v2 -->', '## CodeReviewBot 리뷰', '',
    `**${verdict(r)}** · ${status[r.state]} · ${r.mode === 'full' ? '전체' : '증분'} · [${s.headSha.slice(0, 8)}](${commit})`, '',
    '### 1. 변경 요약', '', plain(r.summary), '', '### 2. 발견 사항', '',
    ...(rows.length ? ['| ID | 심각도 | 상태 | 내용 | 위치 |', '|---|---|---|---|---|', ...rows] : ['현재 검토 범위에서 발견 사항 없음.']), '',
    '### 3. 검증·주의사항', '', '- 로컬 테스트: 미실행', ...checks,
    ...(r.reviewedFiles.length || r.excludedFiles.length ? [`- 검토 파일 ${r.reviewedFiles.length}개${r.excludedFiles.length ? ` · 제외 ${r.excludedFiles.length}개` : ''}`] : []),
    ...r.limitations.map(l => `- ${plain(l)}`),
    ...(r.recommendedTests.length ? ['', '**권장 확인**', '', list(r.recommendedTests)] : []), '',
    '### 4. 변경 이해 질문', '', ...questions,
  ].join('\n');
}
export function renderFinding(f: Finding, s: Snapshot): string {
  const full = renderFindingBody(f, s); if (full.length <= 60000) return full;
  const short = (value: string) => value.length > 700 ? value.slice(0, 700) + '… (축약)' : value;
  return renderFindingBody({ ...f, problem: short(f.problem), condition: short(f.condition), impact: short(f.impact), fix: short(f.fix), test: short(f.test),
    evidence: f.evidence.slice(0, 4).map(e => ({ ...e, reason: short(e.reason) })) }, s);
}
function renderFindingBody(f: Finding, s: Snapshot): string {
  let suggestion = '';
  if (f.suggestion) {
    const max = Math.max(2, ...[...f.suggestion.replacement.matchAll(/`+/g)].map(m => m[0].length));
    const fence = '`'.repeat(max + 1);
    const range = s.platform === 'gitlab' ? `:-${f.line - f.suggestion.startLine}+${f.suggestion.endLine - f.line}` : '';
    suggestion = `${fence}suggestion${range}\n${f.suggestion.replacement}\n${fence}\n\n제안 코드는 로컬에서 실행하지 않았습니다.`;
  }
  return [`<!-- codereviewbot:finding:v1:${f.id} -->`, `### [${f.severity}][${f.category}] ${plain(f.title)} · ${f.id}`, '',
    '**문제**', plain(f.problem), '', '**발생 조건**', plain(f.condition), '', '**영향**', plain(f.impact), '',
    '**근거**', ...f.evidence.map(e => `- ${ref(s, e.path, e.line, e.side)}: ${plain(e.reason)}`), '',
    '**수정 방향**', plain(f.fix), '', '**추천 검증**', plain(f.test), ...(f.suggestion ? ['', '**코드 제안**', suggestion] : [])].join('\n');
}
export function renderAnswer(a: { answer: string; evidence: string[]; next: string }, marker: string): string {
  return [`<!-- codereviewbot:reply:${marker.replace(/[^\w-]/g, '')} -->`, '### 답변', '', plain(a.answer), '',
    '### 코드 근거', '', list(a.evidence), '', '### 후속 조치·한계', '', plain(a.next)].join('\n');
}
