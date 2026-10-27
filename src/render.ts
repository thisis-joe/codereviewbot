import { isQuestionReport, hasChangeQuestions, type Report, type Finding, type Snapshot, type ChangeQuestion, type Grade, type Verdict } from './contracts.js';
import { createHash } from 'node:crypto';
import { questionId } from './learning.js';
import { failureMessage } from './model-failure.js';

// Persisted markers retain their namespace so old comments reconcile after the rename.
export const SUMMARY_MARKER = '<!-- codereviewbot:summary:v1 -->';
/** One summary per exact diff revision; the common marker remains readable by older tooling. */
export function summaryMarker(s: Snapshot): string {
  const revision = createHash('sha256').update(JSON.stringify([s.headSha, s.baseSha, s.startSha])).digest('hex');
  return `<!-- codereviewbot:revision:${revision} -->`;
}
export function questionRevisionMarker(s: Snapshot): string { return summaryMarker(s).replace('codereviewbot:revision:', 'codereviewbot:question-revision:'); }
const status = { completed: '완료', partial: '부분 완료', failed: '실패' };
// Readers scan Korean words faster than P0~P3; the model and stored reports keep the P codes.
export const severityLabel = { P0: '치명', P1: '높음', P2: '보통', P3: '낮음' } as const;
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
function commitLink(s: Snapshot, sha = s.headSha): string {
  const web = new URL(s.webUrl);
  const repo = s.platform === 'github' ? web.pathname.split('/pull/')[0]! : web.pathname.split('/-/merge_requests/')[0]!;
  return `${web.origin}${repo}/${s.platform === 'github' ? 'commit' : '-/commit'}/${sha}`;
}
function clip(value: string, length: number): string { return value.length > length ? value.slice(0, length) + '…' : value; }
/**
 * Explanations may bold up to two short phrases as **…**. Each segment is escaped before the tags are added,
 * so only these tags render; unmatched, extra and clipped markers are dropped. <b> avoids CommonMark's
 * flanking rule, which leaves **멱등성(idempotency)**은 unbolded.
 */
export function emphasized(value: string): string {
  const parts = value.replace(/(?<!\*)\*(?=…$)/, '').split('**');
  let spans = 0;
  return parts.map((part, i) => {
    const bold = i % 2 === 1 && i < parts.length - 1 && part.trim() !== '' && spans < 2;
    if (bold) spans++;
    return bold ? `<b>${plain(part)}</b>` : plain(part);
  }).join('');
}
// Separate paragraphs instead of exposing hard-break escapes or HTML spacing entities.
function lines(values: string[]): string[] { return values.flatMap((v, i) => i ? ['', v] : [v]); }
function commitLines(s: Snapshot): string[] {
  return ['##### 기준 커밋', '', ...(s.commits?.length ? s.commits.map(c => `- [${plain(c.title)}](${commitLink(s, c.sha)})`) : ['- 커밋 제목 정보가 아직 없습니다.'])];
}
export const COMMAND_HELP_HINT = '명령어 안내: `/hey help`';
const answerHelp = ['답변 달기: `/hey answer Q1 B Q2 C`', '정답·해설 보기: 질문 스레드에 답글로 `/hey showanswer`', '더 풀어보기: `/hey whatelse`'];
const verdictMark: Record<Verdict, string> = { correct: '✅ 정답', partial: '🟡 부분 정답', incorrect: '❌ 오답', unverifiable: '⏸ 판정 보류' };
/** Latest grade per question ID; null marks an answer graded before verdicts were recorded. */
export type AnswerResults = Map<string, Verdict | null>;
const commands: [command: string, meaning: string, detail: string, example: string][] = [
  ['/hey answer', '답변', '질문 번호와 보기(A~D)로 답하고 채점·해설 받기<br>여러 답변: Q1 B Q2 C · 심화1 B · 면접1 B · 꼬리1 B', '/hey answer Q1 B'],
  ['/hey showanswer', '정답 보기', '질문 댓글에 답글로 남기면 그 댓글의 질문만 정답·해설 공개<br>번호 지정 없이 사용 · 답변 완료로 처리하지 않음', '/hey showanswer'],
  ['/hey whatelse', '심화 질문', '이 변경의 트레이드오프·실패 경계·영향·확인 방법을 더 깊게 묻는 질문 최대 5개<br>심화1·심화2…로 번호 부여 · CS 개념 심화는 morecs', '/hey whatelse'],
  ['/hey csinterview', 'CS 면접', '변경이 기대는 핵심 CS 개념 면접 질문 2개<br>면접1·면접2…로 번호 부여', '/hey csinterview'],
  ['/hey morecs', '꼬리 질문', '최근 면접 묶음을 더 파고드는 질문 최대 4개<br>꼬리1·꼬리2…, 새 면접 질문은 면접 번호를 이음', '/hey morecs'],
  ['/hey tryagain', '질문 재생성', '최신 변경 범위의 질문을 다시 생성', '/hey tryagain'],
  ['@hey', '코드 질문', '관련 코드를 확인해 질문에 답변', '@hey 키를 재사용하는 이유는?'],
  ['/hey help', '명령어 안내', '사용 가능한 명령과 예시 확인', '/hey help'],
];
// GitLab strips width/style attributes. Unbroken names and bounded description lines
// keep short columns readable without relying on renderer-specific CSS.
const commandCode = (value: string) => `<code>${value.replace(/^\/hey /, '/hey&nbsp;')}</code>`;
const commandTable = ['| 명령어 | 뜻 | 설명 | 사용 예시 |', '|---|---|---|---|', ...commands.map(([c, m, d, e]) => `| ${commandCode(c)} | ${m.replaceAll(' ', '&nbsp;')} | ${d} | ${commandCode(e)} |`)];
export function renderCommandHelp(commentId: string): string { return [replyMarker(commentId), '### 명령어 안내', '', ...commandTable].join('\n'); }
export function renderReport(r: Report, results: AnswerResults = new Map()): string {
  const full = renderReportBody(r, results); if (full.length <= 60000) return full;
  // Preserve the historical four-question compaction limit for oversized legacy reports.
  const compact: Report = { ...r, questions: r.questions.slice(0, 4), limitations: ['댓글 길이 제한으로 질문 4개만 표시합니다.'] };
  const body = renderReportBody(compact, results);
  if (body.length > 60000) throw new Error('Question report exceeds comment budget');
  return body;
}
function renderReportBody(r: Report, results: AnswerResults): string {
  const available = hasChangeQuestions(r), s = r.snapshot;
  const questions = available ? renderQuestions(r.questions, s, r.questions.map((_, i) => `Q${i + 1}`), results)
    : [plain(r.state === 'failed' && r.failure ? failureMessage(r.failure) : r.questionsUnavailableReason ?? (r.state === 'failed' ? '질문 생성에 실패했습니다. /hey tryagain 명령으로 다시 요청하거나 봇 운영자에게 알려주세요.' : '출제할 수 있는 코드 근거가 없어 질문을 생성하지 못했습니다.'))];
  // A completed run needs no status word; partial and failed runs keep theirs beside the revision.
  const meta = [...(r.state === 'completed' ? [] : [status[r.state]]),
    ...(available ? [`답변 ${r.questions.filter(q => results.has(questionId(s, q))).length}/${r.questions.length}`] : [])].join(' · ');
  return [SUMMARY_MARKER, summaryMarker(s), '<!-- codereviewbot:format:v7 -->', '#### hey! 이건 알고 머지한거지? 😏', '',
    ...questions, ...(available ? ['', '---', '', ...lines(answerHelp)] : []), ...(r.limitations.length && available ? ['', ...r.limitations.slice(0, 3).map(l => `- ${plain(clip(l, 200))}`)] : []), '', ...(meta ? [meta, ''] : []), ...commitLines(s), '', COMMAND_HELP_HINT].join('\n');
}
export interface ReviewEstimate { minutes: number; measured: boolean }
/** Posted in place of the summary as soon as a review starts; the finished report overwrites it. */
export function renderProgress(s: Snapshot, estimate: ReviewEstimate, previous?: { report: Report; results: AnswerResults }): string {
  const head = [SUMMARY_MARKER, summaryMarker(s), '<!-- codereviewbot:progress:v1 -->', '#### hey! 이건 알고 머지한거지? 😏', '',
    '**질문 생성 중**', '', ...commitLines(s), '',
    `질문 생성을 시작했습니다. 예상 소요 시간은 약 ${estimate.minutes}분입니다${estimate.measured ? ' (최근 질문 생성 기준)' : ''}. 생성이 끝나면 이 댓글이 결과로 바뀝니다.`].join('\n');
  if (!previous || !isQuestionReport(previous.report) || previous.report.state === 'failed') return head;
  // The earlier report stays readable while the new one runs; its markers are dropped so only this comment owns the summary.
  let prior: string;
  try { prior = renderReport(previous.report, previous.results); } catch { return head; }
  prior = prior.split('\n').filter(line => !/^<!-- codereviewbot:/.test(line)).join('\n');
  const body = [head, '', '<details><summary>이전 질문</summary>', '', prior, '', '</details>'].join('\n');
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
    '', COMMAND_HELP_HINT].join('\n');
}
export interface AnswerView { premise: string | null; answer: string; why: string | null; evidence: { path: string; line: number; side: 'LEFT' | 'RIGHT'; reason: string }[]; unverified: string | null; dropped?: number }
/** @hey reply: a premise correction leads, then the answer, its reason, linked code evidence and what stayed unverified. */
export function renderAnswer(a: AnswerView, s: Snapshot, marker: string): string {
  const levels: [number, number, number, string][] = [[6000, 700, 12, ''], [1500, 300, 12, '댓글 길이 제한으로 답변을 축약했습니다.'], [500, 120, 4, '댓글 길이 제한으로 답변과 근거를 크게 축약했습니다.']];
  for (const [text, reason, cited, note] of levels) {
    const fit = (v: string | null) => v === null ? null : clip(v, text), premise = fit(a.premise), why = fit(a.why), unverified = fit(a.unverified);
    const evidence = [...a.evidence.slice(0, cited).map(e => `- ${ref(s, e.path, e.line, e.side, 80)}: ${plain(clip(e.reason, reason))}`), ...(a.dropped ? [`- 확인할 수 없는 근거 위치 ${a.dropped}곳은 제외했습니다.`] : [])];
    const body = [replyMarker(marker), ...(premise ? [`**전제와 다른 점**: ${plain(premise)}`, ''] : []), plain(clip(a.answer, text)),
      ...(why ? ['', '##### 이유', '', plain(why)] : []), ...(evidence.length ? ['', '##### 코드 근거', '', ...evidence] : []),
      ...(unverified ? ['', '##### 확인하지 못한 것', '', plain(unverified)] : []), '', COMMAND_HELP_HINT, ...(note ? ['', note] : [])].join('\n');
    if (body.length <= 60000) return body;
  }
  throw new Error('Answer exceeds comment budget');
}
// Q-IDs stay in hidden markers for threading and the merge gate; readers see revision-wide numbers.
// Questions are H4 headings with a blank line before native Markdown list choices.
// A follow-up shows the label it continues right under its heading wherever it appears.
function anchorLine(q: ChangeQuestion): string[] { return q.anchor ? ['', `↳ ${plain(q.anchor)}에서 이어짐`] : []; }
function questionLines(q: ChangeQuestion, s: Snapshot, label: string, mark = ''): string[] {
  return [`<!-- codereviewbot:question:${questionId(s, q)} -->`, `#### ${label}. ${plain(q.question)}${mark}`, ...anchorLine(q), '', ...(q.options ?? []).map(o => `- **${o.id}.** ${plain(o.text)}`)];
}
function renderQuestions(questions: ChangeQuestion[], s: Snapshot, labels: string[], results: AnswerResults = new Map()): string[] {
  return questions.flatMap((q, i) => {
    const id = questionId(s, q), verdict = results.get(id);
    return [...(i ? ['', '---', ''] : []), ...questionLines(q, s, labels[i]!, results.has(id) ? ` · ${verdict ? verdictMark[verdict] : '답변함'}` : '')];
  });
}
/** One inline thread per question, so a bare option letter replied in the thread is graded. */
export function renderQuestionThread(q: ChangeQuestion, s: Snapshot, number: number): string {
  return [questionRevisionMarker(s), ...questionLines(q, s, `Q${number}`), '', ...lines(['이 스레드에 보기 문자(A~D)만 답글로 달아도 채점합니다. 이유를 덧붙여도 됩니다.', '정답·해설 보기: 이 스레드에 답글로 `/hey showanswer`'])].join('\n');
}
export function replyMarker(id: string): string { return `<!-- codereviewbot:reply:${id.replace(/[^\w-]/g, '')} -->`; }
export function ackMarker(id: string): string { return `<!-- codereviewbot:ack:${id.replace(/[^\w-]/g, '')} -->`; }
export type AckState = 'received' | 'failed' | 'closed';
const ackText: Record<AckState, string> = {
  received: '⏳ 요청을 접수했습니다. 처리하면 결과를 답글로 남기고 이 안내는 지웁니다.',
  failed: '⚠️ 요청을 처리하지 못했습니다. 잠시 후 다시 요청하세요.',
  closed: '🔒 이미 닫혔거나 머지된 PR/MR이라 요청을 처리하지 않았습니다. 열린 PR/MR에서 다시 요청하세요.',
};
/** Posted when a command arrives; deleted once the command finishes, or turned into a failure or closed notice. */
export function renderAck(id: string, state: AckState = 'received'): string { return [ackMarker(id), ackText[state]].join('\n'); }
// Each follow-up batch is published as a separate replyable question thread.
// Interview batches (면접 or a mixed 꼬리/면접 morecs batch) point to both ways of continuing.
export function renderQuestionBatch(questions: ChangeQuestion[], s: Snapshot, commentId: string, start = 1, prefix: '심화' | '면접' = '심화', labels = questions.map((_, i) => `${prefix}${start + i}`)): string {
  const help = [`답변 달기: \`/hey answer ${labels[0]} B${labels[1] ? ` ${labels[1]} C` : ''}\``,
    '정답·해설 보기: 이 스레드에 답글로 `/hey showanswer`', prefix === '면접' ? '더 풀어보기: `/hey morecs` 꼬리 질문 · `/hey csinterview` 새 면접 질문' : '더 풀어보기: `/hey whatelse`'];
  return [replyMarker(commentId), questionRevisionMarker(s), ...renderQuestions(questions, s, labels), '', '---', '',
    ...lines(help), '', ...commitLines(s), '', COMMAND_HELP_HINT].join('\n');
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
      ...commitLines(s), '', COMMAND_HELP_HINT, ...(note ? ['', note] : [])].join('\n');
    if (body.length <= 59000) return body;
  }
  throw new Error('Grading response exceeds comment budget');
}
function renderGradeSection({ q, grade, label }: GradeItem, s: Snapshot): string {
  const answer = q.options?.find(o => o.id === q.key?.answer)?.text;
  return [`<!-- codereviewbot:question:${questionId(s, q)} -->`, `### ${label} · ${verdictMark[grade.verdict]}`, '',
    `#### ${label}. ${plain(q.question)}`, ...anchorLine(q), ...(answer ? ['', plain(answer)] : []),
    ...(grade.explanation ? ['', '##### 답변 평가', '', emphasized(grade.explanation)] : []), '', '##### 해설', '', emphasized(grade.expectedAnswer),
    ...((q.options ?? []).length ? ['', '##### 보기별 해설', ...optionExplanationLines(q, id => grade.optionExplanations.find(e => e.id === id)?.explanation ?? '해설 없음')] : []), '',
    '##### 코드 근거', '', ...(grade.evidence.length ? grade.evidence.map(e => `- ${ref(s, e.path, e.line, e.side, 80)}: ${plain(clip(e.reason, 700))}`) : ['확인 가능한 코드 근거가 부족해 정답·오답을 확정하지 않았습니다.'])].join('\n');
}
export interface RevealItem { q: ChangeQuestion; label: string }
/** Answer sheet for /hey showanswer: the stored key only, so no model runs and nothing is graded. */
export function renderReveal(items: RevealItem[], s: Snapshot, commentId: string): string {
  const levels: [number, number, string][] = [[2000, 500, ''], [600, 200, '댓글 길이 제한으로 해설을 축약했습니다.'], [200, 80, '댓글 길이 제한으로 해설을 크게 축약했습니다.']];
  for (const [text, option, note] of levels) {
    const body = [replyMarker(commentId), '### 정답·해설', '', items.map(i => renderRevealSection(i, s, text, option)).join('\n\n---\n\n'), '',
      ...commitLines(s), '', COMMAND_HELP_HINT, ...(note ? ['', note] : [])].join('\n');
    if (body.length <= 59000) return body;
  }
  throw new Error('Answer sheet exceeds comment budget');
}
function optionExplanationLines(q: ChangeQuestion, explain: (id: string) => string): string[] {
  return (q.options ?? []).flatMap(o => ['', `- **${o.id}.** ${plain(o.text)}`, '', `  > ${emphasized(explain(o.id))}`]);
}
function renderRevealSection({ q, label }: RevealItem, s: Snapshot, text: number, option: number): string {
  const key = q.key, head = [`#### ${label}. ${plain(q.question)}`, ...anchorLine(q)].join('\n');
  if (!key) return [head, '', '저장된 정답이 없는 이전 질문입니다. `/hey answer`로 답하면 채점과 해설을 받을 수 있습니다.'].join('\n');
  const answer = q.options?.find(o => o.id === key.answer)?.text;
  return [head, ...(answer ? ['', plain(answer)] : []), '', '##### 해설', '', emphasized(clip(key.explanation, text)),
    ...((q.options ?? []).length ? ['', '##### 보기별 해설', ...optionExplanationLines(q, id => clip(key.options.find(e => e.id === id)?.explanation ?? '해설 없음', option))] : []), '', '##### 코드 근거', '', `- ${ref(s, q.path, q.line, q.side, 80)}`].join('\n');
}
