import { checkNames, type Report, type Finding, type Snapshot, type Flow } from './contracts.js';

export const SUMMARY_MARKER = '<!-- codereviewbot:summary:v1 -->';
const status = { running: '진행 중', completed: '완료', partial: '부분 완료', failed: '실패', paused: '일시정지' };
const findingStatus = { new: '새로 발견', open: '유지', fixed: '수정 확인', dismissed: '기각', unverified: '확인 불가' };
const checkStatus = { clear: '지적 없음', found: '발견', not_run: '미실행', pending: '진행 중', unavailable: '확인 불가', not_applicable: '해당 없음', passed: '통과', failed: '실패' };
export function plain(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/([\\`*_[\]{}()#+.!|~-])/g, '\\$1').replace(/@/g, '@\u200b').replace(/[\r\n]+/g, ' ');
}
export function codeLink(s: Snapshot, path: string, line?: number): string {
  const u = new URL(s.webUrl);
  const repo = s.platform === 'github' ? u.pathname.split('/pull/')[0]! : u.pathname.split('/-/merge_requests/')[0]!;
  return `${u.origin}${repo}/${s.platform === 'github' ? 'blob' : '-/blob'}/${s.headSha}/${path.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`;
}
function ref(s: Snapshot, path: string, line?: number): string {
  return `[${plain(path)}${line ? `:${line}` : ''}](${codeLink(s, path, line)})`;
}
function list(values: string[]): string { return values.length ? values.map(x => `- ${plain(x)}`).join('\n') : '없음'; }
function verdict(r: Report): string {
  if (r.state !== 'completed') return '판단 보류';
  const active = r.findings.filter(f => ['new', 'open', 'unverified'].includes(f.status));
  if (active.some(f => f.severity === 'P0' || f.severity === 'P1')) return '수정 필요';
  if (active.length || r.checks.some(c => c.status === 'failed' || c.status === 'unavailable' || c.status === 'pending')) return '확인 권장';
  return '현재 검토 범위에서 지적 없음';
}
function flowDiagram(flow: Flow | null): string {
  if (!flow || !flow.nodes.length) return '해당 없음';
  const ids = new Set(flow.nodes.map(n => n.id));
  if (ids.size !== flow.nodes.length || flow.edges.some(e => !ids.has(e.from) || !ids.has(e.to))) return '확인 불가: 흐름도 참조가 유효하지 않습니다.';
  const label = (v: string) => v.replace(/[^\p{L}\p{N} _./:-]/gu, ' ').slice(0, 120);
  return ['```mermaid', 'flowchart LR', ...flow.nodes.map(n => `  ${n.id}["${label(n.label)}"]`), ...flow.edges.map(e => `  ${e.from} -->|"${label(e.label)}"| ${e.to}`), '```'].join('\n');
}
export function renderReport(r: Report): string {
  const findings = [...r.findings].sort((a, b) => a.severity.localeCompare(b.severity) || a.path.localeCompare(b.path) || a.line - b.line || a.id.localeCompare(b.id));
  const rows = findings.map(f => `| ${f.id} | ${f.severity} | ${f.category} | ${findingStatus[f.status]} | ${plain(f.title)} | ${ref(r.snapshot, f.path, f.line)} |`);
  const groups = r.changes.map(c => `| ${plain(c.name)} | ${c.files.map(f => ref(r.snapshot, f)).join(', ')} | ${plain(`${c.description} / ${c.impact}`)} |`);
  const checks = checkNames.map(name => {
    const items = r.checks.filter(c => c.name === name || (name === 'CI·정적 검사' && !checkNames.includes(c.name as typeof checkNames[number])));
    return `| ${name} | ${items.length ? items.map(c => checkStatus[c.status]).join(', ') : '미실행'} | ${items.length ? items.map(c => plain(`${c.name}: ${c.detail}`)).join('<br>') : '검사 결과 없음'} |`;
  });
  return [SUMMARY_MARKER, '## CodeReviewBot 리뷰', '', '| 항목 | 내용 |', '|---|---|',
    `| 검토 상태 | ${status[r.state]} |`, `| 검토 커밋 | ${r.snapshot.headSha} |`,
    `| 검토 방식 | ${r.mode === 'full' ? '전체' : '증분'} |`,
    `| 비교 기준 | base ${r.snapshot.baseSha} / 이전 ${r.snapshot.previousSha ?? '없음'} |`,
    `| 검토 결과 | ${verdict(r)} |`, '', '### 1. 변경 요약', '', plain(r.summary), '',
    '### 2. 발견 사항', '', '| ID | 심각도 | 분류 | 상태 | 내용 | 위치 |', '|---|---|---|---|---|---|',
    ...(rows.length ? rows : ['| — | — | — | — | 없음 | — |']), '',
    '<details><summary>상세 검토</summary>', '', '### 3. 변경 내역', '',
    '| 변경 묶음 | 관련 파일 | 변경 내용과 영향 |', '|---|---|---|', ...(groups.length ? groups : ['| — | — | 없음 |']), '',
    '흐름도:', '', flowDiagram(r.flow), '', '### 4. 검증 및 테스트', '',
    '| 검토 항목 | 상태 | 근거 또는 필요한 확인 |', '|---|---|---|', ...checks, '',
    '**추천 검증**', '', list(r.recommendedTests), '', '### 5. 이전 리뷰 대비', '',
    `- 새 지적: ${r.delta.added.join(', ') || '없음'}`, `- 유지: ${r.delta.retained.join(', ') || '없음'}`,
    `- 수정 확인: ${r.delta.fixed.join(', ') || '없음'}`, `- 기각: ${r.delta.dismissed.join(', ') || '없음'}`,
    `- 확인 불가: ${r.delta.unverified.join(', ') || '없음'}`, '', '### 6. 검토 범위와 한계', '',
    `- 검토 파일: ${r.reviewedFiles.map(plain).join(', ') || '없음'}`, `- 제외 파일: ${r.excludedFiles.map(plain).join(', ') || '없음'}`,
    `- 적용 규칙: ${r.rules.map(plain).join(', ') || '기본 검토 기준'}`, '', list(r.limitations), '',
    '테스트와 검사 도구의 실행 여부는 위 검증 표를 기준으로 확인하세요.', '', '</details>', '', '양식 버전: 1',
  ].join('\n');
}
export function renderFinding(f: Finding, s: Snapshot): string {
  let suggestion = '코드 제안 없음: 주변 변경이 필요한 경우 수정 방향을 참고하세요.';
  if (f.suggestion) {
    const max = Math.max(2, ...[...f.suggestion.replacement.matchAll(/`+/g)].map(m => m[0].length));
    const fence = '`'.repeat(max + 1);
    const range = s.platform === 'gitlab' ? `:-${f.line - f.suggestion.startLine}+${f.suggestion.endLine - f.line}` : '';
    suggestion = `${fence}suggestion${range}\n${f.suggestion.replacement}\n${fence}\n\n제안 코드는 로컬에서 실행하지 않았습니다.`;
  }
  return [`<!-- codereviewbot:finding:v1:${f.id} -->`, `### [${f.severity}][${f.category}] ${plain(f.title)} · ${f.id}`, '',
    '**문제**', plain(f.problem), '', '**발생 조건**', plain(f.condition), '', '**영향**', plain(f.impact), '',
    '**근거**', ...f.evidence.map(e => `- ${ref(s, e.path, e.line)}: ${plain(e.reason)}`), '',
    '**수정 방향**', plain(f.fix), '', '**추천 검증**', plain(f.test), '', '**코드 제안**', suggestion].join('\n');
}
export function renderAnswer(a: { answer: string; evidence: string[]; next: string }, marker: string): string {
  return [`<!-- codereviewbot:reply:${marker.replace(/[^\w-]/g, '')} -->`, '### 답변', '', plain(a.answer), '',
    '### 코드 근거', '', list(a.evidence), '', '### 후속 조치·한계', '', plain(a.next)].join('\n');
}
