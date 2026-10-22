import { INITIAL_QUESTION_COUNT, isQuestionReport, hasChangeQuestions, type Report, type Finding, type Snapshot, type ChangeQuestion, type Grade, type Verdict } from './contracts.js';
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
export const COMMAND_HELP_HINT = '명령어 안내: `/hey help`';
const answerHelp = ['답변 달기: `/hey answer Q1 B` — 여러 개는 `/hey answer Q1 B Q2 C`', '정답·해설 한 번에 보기: `/hey showanswer` — 답하지 않고 모든 질문의 정답과 보기별 해설 확인'];
const verdictMark: Record<Verdict, string> = { correct: '✅ 정답', partial: '🟡 부분 정답', incorrect: '❌ 오답', unverifiable: '⏸ 판정 보류' };
/** Latest grade per question ID; null marks an answer graded before verdicts were recorded. */
export type AnswerResults = Map<string, Verdict | null>;
const commands: [command: string, meaning: string, detail: string, example: string][] = [
  ['/hey answer', '답변', '질문 번호와 보기(A~D)로 답하고 채점·해설 받기<br>여러 답변: Q1 B Q2 C · 심화 질문: 심화1 B', '/hey answer Q1 B'],
  ['/hey showanswer', '정답 보기', '전체 정답·해설 보기. 번호를 붙이면 해당 질문만 표시<br>예: Q1 심화2 · 답변 수와 머지 조건에는 반영하지 않음', '/hey showanswer'],
  ['/hey morequestion', '심화 질문', '기존 질문과 겹치지 않는 심화 질문 5개 추가<br>심화1·심화2…로 번호 부여', '/hey morequestion'],
  ['/hey tryagain', '질문 재생성', '최신 변경 범위의 질문을 다시 생성', '/hey tryagain'],
  ['@hey', '코드 질문', '관련 코드를 확인해 질문에 답변', '@hey 키를 재사용하는 이유는?'],
  ['/hey help', '명령어 안내', '사용 가능한 명령과 예시 확인', '/hey help'],
];
// GitLab strips width/style attributes. Unbroken names and bounded description lines
// keep short columns readable without relying on renderer-specific CSS.
const commandCode = (value: string) => `<code>${value.replace(/^\/hey /, '/hey&nbsp;')}</code>`;
const commandTable = ['| 명령어 | 뜻 | 설명 | 사용 예시 |', '|---|---|---|---|', ...commands.map(([c, m, d, e]) => `| ${commandCode(c)} | ${m.replaceAll(' ', '&nbsp;')} | ${d} | ${commandCode(e)} |`)];
export function renderCommandHelp(commentId: string): string { return [replyMarker(commentId), '### 명령어 안내', '', ...commandTable].join('\n'); }
function list(values: string[]): string { return values.length ? values.map(x => `- ${plain(x)}`).join('\n') : '없음'; }
export function renderReport(r: Report, results: AnswerResults = new Map()): string {
  const full = renderReportBody(r, results); if (full.length <= 60000) return full;
  // Preserve complete questions, including the trailing advanced one; the gate uses exactly the visible IDs.
  const compact: Report = { ...r, questions: r.questions.slice(0, INITIAL_QUESTION_COUNT), limitations: [`댓글 길이 제한으로 질문 ${INITIAL_QUESTION_COUNT}개만 표시합니다.`] };
  const body = renderReportBody(compact, results);
  if (body.length > 60000) throw new Error('Question report exceeds comment budget');
  return body;
}
function renderReportBody(r: Report, results: AnswerResults): string {
  const available = hasChangeQuestions(r), s = r.snapshot;
  const questions = available ? renderQuestions(r.questions, s, 1, results)
    : [plain(r.state === 'failed' && r.failure ? failureMessage(r.failure) : r.questionsUnavailableReason ?? (r.state === 'failed' ? '질문 생성에 실패했습니다. /hey tryagain 명령으로 다시 요청하거나 봇 운영자에게 알려주세요.' : '출제할 수 있는 코드 근거가 없어 질문을 생성하지 못했습니다.'))];
  // A completed run needs no status word; partial and failed runs keep theirs beside the revision.
  const meta = [...(r.state === 'completed' ? [] : [status[r.state]]), `기준 커밋 [${s.headSha.slice(0, 8)}](${commitLink(s)})`,
    ...(available ? [`답변 ${r.questions.filter(q => results.has(questionId(s, q))).length}/${r.questions.length}`] : [])].join(' · ');
  return [SUMMARY_MARKER, summaryMarker(s), '<!-- codereviewbot:format:v5 -->', '#### hey! 이건 알고 머지하는거지? 😏', '', ...(available ? [...lines(answerHelp), ''] : []),
    ...questions, ...(r.limitations.length && available ? ['', ...r.limitations.slice(0, 3).map(l => `- ${plain(clip(l, 200))}`)] : []), '', ...lines([meta, COMMAND_HELP_HINT])].join('\n');
}
export interface ReviewEstimate { minutes: number; measured: boolean }
/** Posted in place of the summary as soon as a review starts; the finished report overwrites it. */
export function renderProgress(s: Snapshot, estimate: ReviewEstimate, previous?: { report: Report; results: AnswerResults }): string {
  const head = [SUMMARY_MARKER, summaryMarker(s), '<!-- codereviewbot:progress:v1 -->', '#### hey! 이건 알고 머지하는거지? 😏', '',
    `**질문 생성 중** · 기준 커밋 [${s.headSha.slice(0, 8)}](${commitLink(s)})`, '',
    `질문 생성을 시작했습니다. 예상 소요 시간은 약 ${estimate.minutes}분입니다${estimate.measured ? ' (최근 질문 생성 기준)' : ''}. 생성이 끝나면 이 댓글이 결과로 바뀝니다.`].join('\n');
  if (!previous || !isQuestionReport(previous.report) || previous.report.state === 'failed') return head;
  // The earlier report stays readable while the new one runs; its markers are dropped so only this comment owns the summary.
  let prior: string;
  try { prior = renderReport(previous.report, previous.results); } catch { return head; }
  prior = prior.split('\n').filter(line => !/^<!-- codereviewbot:/.test(line)).join('\n');
  const body = [head, '', `<details><summary>이전 질문 (커밋 ${previous.report.snapshot.headSha.slice(0, 8)})</summary>`, '', prior, '', '</details>'].join('\n');
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
export function renderAnswer(a: { answer: string; evidence: string[]; next: string }, marker: string): string {
  const next = a.next.trim();
  const followUp = next && next !== COMMAND_HELP_HINT && !/^(?:없음|해당 없음)[.!。]?$/.test(next);
  return [replyMarker(marker), plain(a.answer),
    ...(a.evidence.length ? ['', '#### 코드 근거', '', list(a.evidence)] : []),
    ...(followUp ? ['', '#### 참고', '', plain(next)] : []), '', COMMAND_HELP_HINT].join('\n');
}
// Q-IDs stay in hidden markers for threading and the merge gate; readers see revision-wide numbers.
// Basic is the default, so only advanced review questions carry a tag; 심화N labels already say so.
function levelTag(q: ChangeQuestion, label: string): string {
  return q.level === 'advanced' && !label.startsWith('심화') ? '[심화] ' : '';
}
// The question is a heading of its own, so options start right below it; code locations appear only in solutions.
function questionLines(q: ChangeQuestion, s: Snapshot, label: string, mark = ''): string[] {
  return [`<!-- codereviewbot:question:${questionId(s, q)} -->`, `#### ${label}. ${levelTag(q, label)}${plain(q.question)}${mark}`, ...lines((q.options ?? []).map(o => `${indent}**${o.id}.** ${plain(o.text)}`))];
}
function renderQuestions(questions: ChangeQuestion[], s: Snapshot, start = 1, results: AnswerResults = new Map(), prefix = 'Q'): string[] {
  return questions.flatMap((q, i) => {
    const id = questionId(s, q), verdict = results.get(id);
    return [...(i ? [''] : []), ...questionLines(q, s, `${prefix}${start + i}`, results.has(id) ? ` · ${verdict ? verdictMark[verdict] : '답변함'}` : '')];
  });
}
/** One inline thread per question, so a bare option letter replied in the thread is graded. */
export function renderQuestionThread(q: ChangeQuestion, s: Snapshot, number: number): string {
  return [...questionLines(q, s, `Q${number}`), '', ...lines(['이 스레드에 보기 문자(A~D)만 답글로 달아도 채점합니다. 이유를 덧붙여도 됩니다.', `정답·해설 보기: \`/hey showanswer Q${number}\``])].join('\n');
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
// Follow-ups are never revealed by a bare showanswer, so the batch names its own labels for one-step reveal.
export function renderQuestionBatch(questions: ChangeQuestion[], s: Snapshot, commentId: string, start = 1): string {
  const labels = questions.map((_, i) => `심화${start + i}`);
  const help = [`답변 달기: \`/hey answer ${labels[0]} B\` — 여러 개는 \`/hey answer ${labels[0]} B ${labels[1] ?? labels[0]} C\``,
    `정답·해설 한 번에 보기: \`/hey showanswer ${labels.join(' ')}\``];
  return [replyMarker(commentId), '### 심화 질문', '', ...lines(help), '', ...renderQuestions(questions, s, start, new Map(), '심화'), '',
    ...lines([`기준 커밋 [${s.headSha.slice(0, 8)}](${commitLink(s)})`, COMMAND_HELP_HINT])].join('\n');
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
      ...lines([`기준 커밋: ${s.headSha.slice(0, 8)}`, COMMAND_HELP_HINT]), ...(note ? ['', note] : [])].join('\n');
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
export interface RevealItem { q: ChangeQuestion; label: string }
/** Answer sheet for /hey showanswer: the stored key only, so no model runs and nothing is graded. */
export function renderReveal(items: RevealItem[], s: Snapshot, commentId: string): string {
  const levels: [number, number, string][] = [[1500, 500, ''], [600, 200, '댓글 길이 제한으로 해설을 축약했습니다.'], [200, 80, '댓글 길이 제한으로 해설을 크게 축약했습니다.']];
  for (const [text, option, note] of levels) {
    const body = [replyMarker(commentId), '### 정답·해설', '', items.map(i => renderRevealSection(i, s, text, option)).join('\n\n---\n\n'), '',
      ...lines([`기준 커밋: ${s.headSha.slice(0, 8)}`, COMMAND_HELP_HINT]), ...(note ? ['', note] : [])].join('\n');
    if (body.length <= 59000) return body;
  }
  throw new Error('Answer sheet exceeds comment budget');
}
function renderRevealSection({ q, label }: RevealItem, s: Snapshot, text: number, option: number): string {
  const key = q.key, head = `#### ${label}. ${levelTag(q, label)}${plain(q.question)}`;
  if (!key) return [head, '', '저장된 정답이 없는 이전 질문입니다. `/hey answer`로 답하면 채점과 해설을 받을 수 있습니다.'].join('\n');
  return [head, '', `정답: **${key.answer}** · 코드 위치: ${ref(s, q.path, q.line, q.side, 80)}`, '', '**문제 해설**', plain(clip(key.explanation, text)),
    ...((q.options ?? []).length ? ['', '**보기별 해설**', ...q.options.flatMap(o => ['', `**${o.id}.** ${plain(o.text)}${o.id === key.answer ? ' (정답)' : ''} — ${plain(clip(key.options.find(e => e.id === o.id)?.explanation ?? '해설 없음', option))}`])] : [])].join('\n');
}
