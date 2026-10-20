import { checkNames, hasChangeQuestions, type Report, type Finding, type Snapshot, type ChangeQuestion, type Grade, type Verdict } from './contracts.js';
import { questionId } from './learning.js';

export const SUMMARY_MARKER = '<!-- codereviewbot:summary:v1 -->';
const status = { completed: '완료', partial: '부분 완료', failed: '실패' };
const findingStatus = { new: '새로 발견', open: '유지', fixed: '수정 확인', dismissed: '기각', unverified: '확인 불가' };
// Readers scan Korean words faster than P0~P3; the model and stored reports keep the P codes.
export const severityLabel = { P0: '치명', P1: '높음', P2: '보통', P3: '낮음' } as const;
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
function commitLink(s: Snapshot): string {
  const web = new URL(s.webUrl);
  const repo = s.platform === 'github' ? web.pathname.split('/pull/')[0]! : web.pathname.split('/-/merge_requests/')[0]!;
  return `${web.origin}${repo}/${s.platform === 'github' ? 'commit' : '-/commit'}/${s.headSha}`;
}
function clip(value: string, length: number): string { return value.length > length ? value.slice(0, length) + '…' : value; }
// A trailing backslash is a CommonMark hard break, so consecutive lines render apart on GitHub and GitLab alike.
function lines(values: string[]): string[] { return values.map((v, i) => i < values.length - 1 ? v + '\\' : v); }
// Four literal spaces would start a Markdown code block, so options are indented with non-breaking spaces.
const indent = '&nbsp;'.repeat(4);
const answerHelp = ['답변: `/reviewbot answer Q1 B` — 여러 개는 `/reviewbot answer Q1 B Q2 C`', '심화 질문: `/reviewbot morequestion` — 이미 나온 질문을 빼고 더 깊은 질문 5개'];
// Follow-up questions are labelled 심화N so they cannot be mistaken for the review's Q1, Q2.
const advancedHelp = ['답변: `/reviewbot answer 심화1 B` — 여러 개는 `/reviewbot answer 심화1 B 심화2 C`', answerHelp[1]!];
const verdictMark: Record<Verdict, string> = { correct: '✅ 정답', partial: '🟡 부분 정답', incorrect: '❌ 오답', unverifiable: '⏸ 판정 보류' };
/** Latest grade per question ID; null marks an answer graded before verdicts were recorded. */
export type AnswerResults = Map<string, Verdict | null>;
const commands: [command: string, meaning: string, detail: string, example: string][] = [
  ['/reviewbot answer', '답변', '리뷰 질문은 Q번호, 심화 질문은 심화번호와 보기(A~D)로 답하면 채점·해설, 여러 개를 한 번에 답할 수 있음', '/reviewbot answer Q1 B Q2 C'],
  ['/reviewbot morequestion', '심화 질문', '이미 나온 질문을 빼고 더 깊은 질문 5개, 심화1·심화2…로 번호를 붙임', '/reviewbot morequestion'],
  ['/reviewbot review', '다시 검토', '최신 변경만 다시 검토', '/reviewbot review'],
  ['/reviewbot full', '전체 검토', 'PR/MR 전체를 처음부터 다시 검토', '/reviewbot full'],
  ['/reviewbot pause', '일시정지', '푸시마다 하는 자동 리뷰를 멈춤', '/reviewbot pause'],
  ['/reviewbot resume', '재개', '멈춘 자동 리뷰를 다시 시작', '/reviewbot resume'],
  ['/reviewbot explain', '지적 설명', '지적 댓글에 답글로 쓰면 그 지적, 일반 댓글이면 남은 지적 전체를 코드로 다시 확인해 설명', '/reviewbot explain'],
  ['/reviewbot dismiss', '지적 기각', '지적 댓글에 답글로 사유를 남기면 이 PR/MR에서 제외, 일반 댓글은 ID 필요', '/reviewbot dismiss 의도된 동작'],
  ['@reviewbot', '코드 질문', '코드 근거를 확인해 답변', '@reviewbot 재시도는 왜 3회인가요?'],
  ['/reviewbot learn', '규칙 제안', '저장소 규칙 제안, 관리자 승인 후 적용', '/reviewbot learn 금액은 정수로 다룬다'],
  ['/reviewbot approve', '규칙 승인', '관리자가 규칙 제안을 승인', '/reviewbot approve 규칙ID'],
  ['/reviewbot reject', '규칙 거절', '관리자가 규칙 제안을 거절', '/reviewbot reject 규칙ID'],
];
const commandTable = ['| 명령어 | 뜻 | 설명 | 사용 예시 |', '|---|---|---|---|', ...commands.map(([c, m, d, e]) => `| \`${c}\` | ${m} | ${d} | \`${e}\` |`)];
function list(values: string[]): string { return values.length ? values.map(x => `- ${plain(x)}`).join('\n') : '없음'; }
function verdict(r: Report): string {
  if (r.state !== 'completed') return '판단 보류';
  const active = r.findings.filter(f => ['new', 'open', 'unverified'].includes(f.status));
  if (active.some(f => f.severity === 'P0' || f.severity === 'P1')) return '수정 필요';
  if (active.length || r.checks.some(c => c.status === 'failed' || c.status === 'unavailable' || c.status === 'pending')) return '확인 권장';
  return '현재 검토 범위에서 지적 없음';
}
export function renderReport(r: Report, results: AnswerResults = new Map()): string {
  const full = renderReportBody(r, false, results); if (full.length <= 60000) return full;
  const short = (value: string) => clip(value, 200);
  const sorted = [...r.findings].sort((a, b) => Number(['fixed', 'dismissed'].includes(a.status)) - Number(['fixed', 'dismissed'].includes(b.status)) || a.severity.localeCompare(b.severity) || a.id.localeCompare(b.id));
  for (const limit of [40, 20, 10, 5, 2, 1, 0]) {
    const tight = limit <= 2, excerpt = tight ? (value: string) => clip(value, 80) : short;
    const priority = (value: Report['checks'][number]) => ['failed', 'unavailable', 'pending', 'skipped', 'neutral', 'not_run', 'found', 'not_applicable', 'passed', 'clear'].indexOf(value.status);
    const compact: Report = { ...r, state: r.state === 'completed' ? 'partial' : r.state, summary: excerpt(r.summary),
      findings: sorted.slice(0, limit), checks: [...r.checks].sort((a, b) => priority(a) - priority(b)).slice(0, tight ? 5 : 30).map(c => ({ ...c, name: clip(c.name, 80), detail: clip(c.detail, tight ? 80 : 120) })), recommendedTests: r.recommendedTests.slice(0, tight ? 3 : 5).map(excerpt),
      questions: r.questions.slice(0, 3),
      limitations: [`댓글 길이 제한으로 내용·목록을 축약했습니다. 발견 사항 ${r.findings.length}건 중 ${Math.min(limit, r.findings.length)}건, 검사 ${r.checks.length}건 중 ${Math.min(tight ? 5 : 30, r.checks.length)}건을 표시합니다. 상세 내용은 인라인 댓글 또는 /reviewbot explain ID로 확인하세요.`, ...r.limitations.slice(0, tight ? 3 : 5).map(excerpt)] };
    const body = renderReportBody(compact, compact.checks.length < r.checks.length, results); if (body.length <= 60000) return body;
  }
  throw new Error('Report metadata exceeds comment budget');
}
function renderReportBody(r: Report, omittedChecks = false, results: AnswerResults = new Map()): string {
  const findings = [...r.findings].sort((a, b) => a.severity.localeCompare(b.severity) || a.path.localeCompare(b.path) || a.line - b.line || a.id.localeCompare(b.id));
  const rows = findings.map(f => `| ${f.id} | ${severityLabel[f.severity]} | ${findingStatus[f.status]} | ${plain(f.title)} | ${ref({ ...r.snapshot, headSha: f.observedHeadSha ?? r.snapshot.headSha, baseSha: f.observedBaseSha ?? r.snapshot.baseSha }, f.side === 'LEFT' ? f.oldPath ?? f.path : f.path, f.line, f.side)} |`);
  const ci = (name: string) => !checkNames.slice(0, 6).includes(name as typeof checkNames[number]);
  const checks = r.checks.filter(c => ci(c.name) || ['failed', 'unavailable', 'pending', 'not_run'].includes(c.status))
    .map(c => `- ${plain(c.name)}: ${checkStatus[c.status]}${c.detail.trim() ? ` — ${plain(clip(c.detail.trim(), 200))}` : ''}`);
  if (!r.checks.some(c => ci(c.name))) checks.push(omittedChecks ? '- CI: 검사 목록이 축약되었습니다.' : '- CI: 확인된 실행 결과 없음');
  const s = r.snapshot, commit = commitLink(s);
  const questions = hasChangeQuestions(r) ? renderQuestions(r.questions, s, 1, results)
    : [r.state === 'failed' || !r.questionsUnavailableReason ? '리뷰를 완료하지 못해 질문을 생성하지 못했습니다.' : plain(r.questionsUnavailableReason)];
  return [SUMMARY_MARKER, '<!-- codereviewbot:format:v3 -->', '### CodeReviewBot 리뷰', '',
    `**${verdict(r)}** · ${status[r.state]} · ${r.mode === 'full' ? '전체' : '증분'} · [${s.headSha.slice(0, 8)}](${commit})`, '',
    '### 1. 변경 요약', '', plain(r.summary), '', '### 2. 발견 사항', '',
    ...(rows.length ? ['| ID | 심각도 | 상태 | 내용 | 위치 |', '|---|---|---|---|---|', ...rows] : ['현재 검토 범위에서 발견 사항 없음.']), '',
    '### 3. 검증·주의사항', '', '- 로컬 테스트: 미실행', ...checks,
    ...(r.reviewedFiles.length || r.excludedFiles.length ? [`- 검토 파일 ${r.reviewedFiles.length}개${r.excludedFiles.length ? ` · 제외 ${r.excludedFiles.length}개` : ''}`] : []),
    ...r.limitations.map(l => `- ${plain(l)}`),
    ...(r.recommendedTests.length ? ['', '**권장 확인**', '', list(r.recommendedTests)] : []), '',
    '### 4. 변경 이해 질문', '', ...(hasChangeQuestions(r) ? [`보기 하나를 골라 \`/reviewbot answer Q1 B\`로 답하세요. 여러 개는 \`/reviewbot answer Q1 B Q2 C\` · 답변 ${r.questions.filter(q => results.has(questionId(s, q))).length}/${r.questions.length}`, ''] : []), ...questions,
    '', '#### 명령어', '', ...commandTable,
  ].join('\n');
}
export interface ReviewEstimate { minutes: number; measured: boolean }
/** Posted in place of the summary as soon as a review starts; the finished report overwrites it. */
export function renderProgress(s: Snapshot, mode: 'full' | 'incremental', estimate: ReviewEstimate, previous?: { report: Report; results: AnswerResults }): string {
  const head = [SUMMARY_MARKER, '<!-- codereviewbot:progress:v1 -->', '### CodeReviewBot 리뷰', '',
    `**리뷰 중** · ${mode === 'full' ? '전체' : '증분'} · [${s.headSha.slice(0, 8)}](${commitLink(s)})`, '',
    `리뷰를 시작했습니다. 예상 소요 시간은 약 ${estimate.minutes}분입니다${estimate.measured ? ' (최근 리뷰 기준)' : ''}. 리뷰가 끝나면 이 댓글이 결과로 바뀝니다.`].join('\n');
  if (!previous || previous.report.state === 'failed') return head;
  // The earlier report stays readable while the new one runs; its markers are dropped so only this comment owns the summary.
  let prior: string;
  try { prior = renderReport(previous.report, previous.results); } catch { return head; }
  prior = prior.split('\n').filter(line => !/^<!-- codereviewbot:/.test(line)).join('\n');
  const body = [head, '', `<details><summary>이전 리뷰 결과 (커밋 ${previous.report.snapshot.headSha.slice(0, 8)})</summary>`, '', prior, '', '</details>'].join('\n');
  return body.length <= 60000 ? body : head;
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
  return [`<!-- codereviewbot:finding:v1:${f.id} -->`, `### [${severityLabel[f.severity]}][${f.category}] ${plain(f.title)} · ${f.id}`, '',
    '**문제**', plain(f.problem), '', '**발생 조건**', plain(f.condition), '', '**영향**', plain(f.impact), '',
    '**근거**', ...f.evidence.map(e => `- ${ref(s, e.path, e.line, e.side)}: ${plain(e.reason)}`), '',
    '**수정 방향**', plain(f.fix), '', '**추천 검증**', plain(f.test), ...(f.suggestion ? ['', '**코드 제안**', suggestion] : []),
    '', '이 댓글에 답글로 `/reviewbot explain`을 쓰면 다시 설명하고, `/reviewbot dismiss 사유`를 쓰면 기각합니다.'].join('\n');
}
export function renderAnswer(a: { answer: string; evidence: string[]; next: string }, marker: string): string {
  return [`<!-- codereviewbot:reply:${marker.replace(/[^\w-]/g, '')} -->`, '### 답변', '', plain(a.answer), '',
    '### 코드 근거', '', list(a.evidence), '', '### 후속 조치·한계', '', plain(a.next)].join('\n');
}
// Q-IDs stay in hidden markers for threading and the merge gate; readers see revision-wide numbers.
function levelTag(q: ChangeQuestion, label: string): string {
  return q.level && !label.startsWith('심화') ? `[${q.level === 'basic' ? '기본' : '심화'}] ` : '';
}
function questionLines(q: ChangeQuestion, s: Snapshot, label: string, mark = '', linked = true): string[] {
  const level = levelTag(q, label);
  return [`<!-- codereviewbot:question:${questionId(s, q)} -->`,
    ...lines([`**${label}. ${level}${plain(q.question)}** — ${linked ? ref(s, q.path, q.line, q.side, 80) : `${plain(clip(q.path, 80))}:${q.line}`}${mark}`, ...(q.options ?? []).map(o => `${indent}**${o.id}.** ${plain(o.text)}`)])];
}
function renderQuestions(questions: ChangeQuestion[], s: Snapshot, start = 1, results: AnswerResults = new Map(), linked = true, prefix = 'Q'): string[] {
  return questions.flatMap((q, i) => {
    const id = questionId(s, q), verdict = results.get(id);
    return [...(i ? [''] : []), ...questionLines(q, s, `${prefix}${start + i}`, results.has(id) ? ` · ${verdict ? verdictMark[verdict] : '답변함'}` : '', linked)];
  });
}
/** One inline thread per question, so a bare option letter replied in the thread is graded. */
export function renderQuestionThread(q: ChangeQuestion, s: Snapshot, number: number): string {
  return [...questionLines(q, s, `Q${number}`), '', '이 스레드에 보기 문자(A~D)만 답글로 달아도 채점합니다. 이유를 덧붙여도 됩니다.'].join('\n');
}
export function replyMarker(id: string): string { return `<!-- codereviewbot:reply:${id.replace(/[^\w-]/g, '')} -->`; }
// A batch is always five questions, so oversized input drops code links before it would drop a question.
export function renderQuestionBatch(questions: ChangeQuestion[], s: Snapshot, commentId: string, start = 1): string {
  for (const linked of [true, false]) {
    const body = [replyMarker(commentId), '### 심화 질문', '', `기준 커밋: ${s.headSha.slice(0, 8)}`, '', ...renderQuestions(questions, s, start, new Map(), linked, '심화'), '',
      ...lines(advancedHelp), ...(linked ? [] : ['', '댓글 길이 제한으로 코드 링크를 경로 표기로 바꿨습니다.'])].join('\n');
    if (body.length <= 59000 || !linked) return body;
  }
  throw new Error('unreachable');
}
export interface GradeItem { q: ChangeQuestion; grade: Grade; label: string; picked?: string }
export function renderGrade(q: ChangeQuestion, s: Snapshot, grade: Grade, commentId: string, label = questionId(s, q), picked?: string): string {
  return renderGrades([{ q, grade, label, picked }], s, commentId);
}
// Leave room for the request link and input-compaction disclosure added by the caller.
export function renderGrades(items: GradeItem[], s: Snapshot, commentId: string): string {
  const shrink = (g: Grade, text: number, option: number, evidence: number, reason: number): Grade => ({ ...g, explanation: clip(g.explanation, text), expectedAnswer: clip(g.expectedAnswer, text),
    optionExplanations: g.optionExplanations.map(o => ({ ...o, explanation: clip(o.explanation, option) })), evidence: g.evidence.slice(0, evidence).map(e => ({ ...e, reason: clip(e.reason, reason) })) });
  const levels: [((g: Grade) => Grade), string][] = [[g => g, ''], [g => shrink(g, 700, 400, 3, 300), '댓글 길이 제한으로 해설과 근거를 축약했습니다.'], [g => shrink(g, 250, 120, 1, 120), '댓글 길이 제한으로 해설과 근거를 크게 축약했습니다.']];
  for (const [fit, note] of levels) {
    const body = [replyMarker(commentId), items.map(i => renderGradeSection({ ...i, grade: fit(i.grade) }, s)).join('\n\n---\n\n'), '',
      ...lines([`기준 커밋: ${s.headSha.slice(0, 8)}`, answerHelp[1]!]), ...(note ? ['', note] : [])].join('\n');
    if (body.length <= 59000) return body;
  }
  throw new Error('Grading response exceeds comment budget');
}
function renderGradeSection({ q, grade, label, picked }: GradeItem, s: Snapshot): string {
  const answer = q.key?.answer, level = levelTag(q, label);
  const choice = [...(picked ? [`내 답: **${picked}**`] : []), ...(answer ? [`정답: **${answer}**`] : [])].join(' · ');
  const tags = (id: string) => [...(id === picked ? ['내 답'] : []), ...(id === answer ? ['정답'] : [])];
  return [`<!-- codereviewbot:question:${questionId(s, q)} -->`, `### ${label} · ${verdictMark[grade.verdict]}`, '',
    `**${label}. ${level}${plain(q.question)}**`, ...(choice ? ['', choice] : []),
    ...(grade.explanation ? ['', '**답변 평가**', plain(grade.explanation)] : []), '', '**문제 해설**', plain(grade.expectedAnswer),
    ...((q.options ?? []).length ? ['', '**보기별 해설**', ...q.options.flatMap(o => ['', `**${o.id}.** ${plain(o.text)}${tags(o.id).length ? ` (${tags(o.id).join('·')})` : ''} — ${plain(grade.optionExplanations.find(e => e.id === o.id)?.explanation ?? '해설 없음')}`])] : []), '',
    '**코드 근거**', ...(grade.evidence.length ? grade.evidence.map(e => `- ${ref(s, e.path, e.line, e.side, 80)}: ${plain(clip(e.reason, 700))}`) : ['확인 가능한 코드 근거가 부족해 정답·오답을 확정하지 않았습니다.'])].join('\n');
}
