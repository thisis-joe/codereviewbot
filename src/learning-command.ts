import { GradeSchema, QuestionBatchSchema, CsInterviewBatchSchema, MoreCsBatchSchema, CS_INTERVIEW_COUNT, MORECS_COUNT, QUESTION_BATCH_SIZE, hasChangeQuestions, type ChangeQuestion, type Grade, type Snapshot } from './contracts.js';
import { csInterviewPrompt, moreCsPrompt } from './csinterview.js';
import { whatElsePrompt } from './whatelse.js';
import { answerSecurity, boldRule, sourceTools } from './prompt-blocks.js';
import { questionId, sameRevision } from './learning.js';
import { hasQuestionSource, validateQuestions, type Model, type ReviewContext } from './review.js';
import { renderGrades, renderQuestionBatch, renderReveal, replyMarker, plain, COMMAND_HELP_HINT, type GradeItem } from './render.js';
import { threadQuestions } from './question-thread.js';
import { redact } from './redact.js';
import type { Command } from './commands.js';
import type { Store, Job, CommandResult } from './store.js';
import type { Platform, RemoteComment } from './platform.js';
import type { Workspaces } from './workspace.js';
import { commentKey, type Comment } from './webhooks.js';

const MAX_BATCHES = 5;
// Four teaching questions with source reads ran past 120 s on GMS (109 s, then three 120 s timeouts on a four-question anchor).
const MORECS_BUDGET_MS = 240000;
export function readable(q: Pick<ChangeQuestion, 'path' | 'line' | 'side'>, context: ReviewContext): boolean {
  const files = q.side === 'LEFT' ? context.baseFiles : context.files;
  return Boolean(files && Object.hasOwn(files, q.path) && q.line > 0 && q.line <= files[q.path]!.split('\n').length);
}
// Q and 심화 questions check understanding of this change; 면접 and 꼬리 questions check CS concepts and terms.
type GradeKind = 'change' | 'interview';
const gradeKind = (label: string): GradeKind => /^(?:면접|꼬리)\d+$/.test(label) ? 'interview' : 'change';
const feedbackRules: Record<GradeKind, string> = {
  change: `이 질문은 이 PR/MR 변경을 이해했는지 확인합니다.
1. 맞게 이해한 부분을 먼저 인정합니다.
2. 잘못 읽은 부분이 있으면 그것이 동작(코드가 실제로 하는 일), 이유(왜 바꿨는지), 영향(무엇에 영향을 주는지) 가운데 무엇인지 밝히고, 코드가 실제로 하는 일을 근거 위치와 함께 설명합니다.
3. 정답을 골랐지만 이유가 틀렸으면 "정답은 맞지만 이유가 다릅니다"라고 분명히 말하고 맞는 이유를 설명합니다.
CS 개념은 오해가 그 개념에서 나왔을 때만 한 구절로 덧붙입니다.`,
  interview: '이 질문은 CS 개념을 이해했는지 확인합니다. CS 용어의 정의와 적용 범위를 확인하고 유사 개념의 혼동을 짚으세요. 오답이나 부분 정답이면 놓치거나 혼동한 개념의 이름(한국어와 영어)과 그 핵심을 밝히고, 그 차이가 결론을 어떻게 바꾸는지 설명하세요. 일반 CS 원리와 이 코드에서 확인한 사실을 구분하세요.',
};
function gradePrompt(kind: GradeKind, sourceDir: string, payload: string): string {
  return `당신은 이 저장소의 시니어 엔지니어입니다. 동료가 질문에 고른 보기와 이유를 읽고, 무엇을 맞게 이해했고 무엇을 잘못 읽었는지 짚어 줍니다. ${sourceTools(sourceDir)} 답변의 주장을 코드와 대조하세요.

[판정]

- question.key가 있으면 정답은 key.answer로 이미 정해져 있습니다. 선택한 보기가 key.answer와 다르면 incorrect입니다. 같으면 이유가 코드와 맞을 때 correct, 이유에 오해가 있으면 partial입니다. 정답을 틀린 이유로 고른 경우도 partial입니다.
- key가 없는 이전 질문은 선택한 보기를 코드로 판정하고, 이유에 오해가 있으면 partial로 짚으세요.
- 코드나 외부 계약으로 결론을 확정할 수 없으면 정답·오답을 강제하지 말고 unverifiable로 판정하세요. 무엇을 확인할 수 없었는지 적습니다.
- 동의어나 한국어·영어 표현 차이, 모범 문장과 다른 표현만으로 감점하지 마세요. 설계·트레이드오프 문항은 타당한 대안을 인정하세요.

[피드백]

explanation 필드에 1~3문장으로 씁니다.
${feedbackRules[kind]}
정답 해설을 되풀이하지 마세요. key의 해설과 보기별 해설은 피드백 아래에 그대로 보여 줍니다. ${boldRule}

[해설 필드]

- question.key가 있으면 expectedAnswer=null, optionExplanations=[]로 반환하세요. 저장된 해설을 그대로 보여 주므로 새로 쓰지 않습니다.
- key가 없는 이전 질문이면 expectedAnswer(1~3문장)에 맞는 답과 그 이유를 쓰고, optionExplanations에는 모든 보기를 하나씩(각 1~3문장) 설명하세요. 보기가 없는 질문이면 optionExplanations=[]입니다.

[근거]

correct·partial·incorrect 판정에는 피드백의 주장을 뒷받침하는 path·line·side·reason을 evidence에 최소 하나 넣습니다. 직접 읽어 확인한 위치만 적습니다. 변경 후 코드는 RIGHT, 변경 전 코드는 LEFT입니다.

[예시]

아래 예시는 기준을 보여 주기 위한 것이며 이 저장소와 무관합니다.
${kind === 'change' ? `답변: "B. 재시도마다 새 키를 만들어서 중복을 막기 때문입니다."
- 나쁜 피드백: "멱등성은 같은 요청을 여러 번 보내도 결과가 같은 성질입니다. 정답은 B입니다." — 무엇을 잘못 읽었는지 말하지 않고 개념만 설명합니다.
- 좋은 피드백: "B는 맞지만 이유가 다릅니다. 변경 후 코드는 **새 키를 만들지 않고 첫 요청의 키를 저장해 재사용**하며, 그래서 외부 서비스가 재시도를 같은 요청으로 알아봅니다."` : `답변: "C. 트랜잭션이 원자적이니까 중복 결제가 안 생깁니다."
- 나쁜 피드백: "오답입니다. 정답은 B입니다." — 무엇을 혼동했는지 말하지 않습니다.
- 좋은 피드백: "원자성(atomicity)과 멱등성(idempotency)을 혼동했습니다. 원자성은 **한 트랜잭션의 변경이 전부 또는 전혀 반영됨**을 보장할 뿐, 같은 요청이 두 번 도착하는 것은 막지 못합니다."`}

[출력]

지정된 출력 스키마에 맞는 JSON만 반환하세요.

${answerSecurity}

채점 자료(JSON 데이터):
${payload}`;
}
function sourceLink(all: RemoteComment[], comment: Comment, s: Snapshot): string {
  const value = all.find(c => c.id === comment.id && c.surface === comment.surface)?.url;
  if (!value) return '';
  try { const u = new URL(value), pr = new URL(s.webUrl); if (u.origin === pr.origin && u.pathname === pr.pathname) return `\n\n[요청 댓글](${u.href})`; } catch { /* No untrusted links in replies. */ }
  return '';
}
// Each kind keeps its own revision-wide sequence; old batches without a kind remain 심화.
// morecs batches mix 꼬리 and 면접 questions, so they store their labels instead of a start number.
interface Numbers { byLabel: Map<string, ChangeQuestion>; batchLabels: string[][]; next: number; nextInterview: number; nextFollowUp: number }
function numbering(current: ChangeQuestion[], batches: CommandResult[]): Numbers {
  const byLabel = new Map<string, ChangeQuestion>(current.map((q, i) => [`Q${i + 1}`, q])), batchLabels: string[][] = [];
  const after = { 심화: 1, 면접: 1, 꼬리: 1 } as Record<string, number>;
  for (const b of batches) {
    const questions = b.questions ?? [], prefix = b.batchKind === 'csinterview' ? '면접' : '심화';
    const start = b.start ?? after[prefix]!;
    const labels = b.labels?.length === questions.length ? b.labels : questions.map((_, i) => `${prefix}${start + i}`);
    questions.forEach((q, i) => {
      if (!byLabel.has(labels[i]!)) byLabel.set(labels[i]!, q);
      const [, kind, n] = labels[i]!.match(/^(심화|면접|꼬리)(\d+)$/) ?? [];
      if (kind) after[kind] = Math.max(after[kind]!, Number(n) + 1);
    });
    batchLabels.push(labels);
  }
  return { byLabel, batchLabels, next: after['심화']!, nextInterview: after['면접']!, nextFollowUp: after['꼬리']! };
}
const interviewKinds: CommandResult['batchKind'][] = ['csinterview', 'morecs'];
/** Follow-ups must continue a question of the anchor batch, and every 면접 question there needs one unless the model explains why not. */
function followUps(questions: ChangeQuestion[], anchorLabels: string[], reason: string | null): { ordered: ChangeQuestion[]; uncovered: string[] } {
  if (questions.some(q => q.kind === 'followup' ? !anchorLabels.includes(q.anchor ?? '') : q.anchor !== null)) throw new Error('꼬리 질문은 직전 면접 묶음의 문항을 이어야 합니다.');
  const uncovered = anchorLabels.filter(l => l.startsWith('면접') && !questions.some(q => q.anchor === l));
  if (uncovered.length && !reason) throw new Error('직전 묶음의 면접 질문마다 꼬리 질문이 필요합니다.');
  // Follow-ups come first in anchor order, then the new interview question.
  const rank = (q: ChangeQuestion) => q.kind === 'interview' ? anchorLabels.length : anchorLabels.indexOf(q.anchor!);
  return { ordered: questions.map((q, i) => ({ q, i })).sort((a, b) => rank(a.q) - rank(b.q) || a.i - b.i).map(x => x.q), uncovered };
}
function labelOf(byLabel: Map<string, ChangeQuestion>, snap: Snapshot, q: ChangeQuestion): string | undefined {
  return [...byLabel].find(([, v]) => questionId(snap, v) === questionId(snap, q))?.[0];
}
function picked(answer: string, q: ChangeQuestion): string | undefined {
  const letter = answer.trim().match(/^\**([A-Za-z])(?![A-Za-z0-9])/)?.[1]?.toUpperCase();
  return (q.options ?? []).some(o => o.id === letter) ? letter : undefined;
}
type Chosen = { q: ChangeQuestion; label: string; text: string; picked?: string };
// A bare option letter ("B", "B입니다") needs no model when the answer key exists; reasoning goes to the model with the key.
function reasoned(p: Chosen): boolean {
  return p.text.trim().replace(/^\**[A-Za-z]\**/, '').replace(/^[\s.,:)\]~!]*(?:번|입니다|이요|요|예요|이에요)?[\s.,!~]*$/, '').length > 0;
}
// A wrong pick leads with the stored note on that option, which names the concept the developer confused.
function keyGrade(p: Chosen): Grade {
  const key = p.q.key!, note = key.options.find(o => o.id === p.picked)?.explanation;
  return { verdict: p.picked === key.answer ? 'correct' : 'incorrect', explanation: p.picked !== key.answer && note ? `선택한 ${p.picked}: ${note}` : '', expectedAnswer: key.explanation, optionExplanations: key.options,
    evidence: [{ path: p.q.path, line: p.q.line, side: p.q.side, reason: '질문이 가리키는 변경 위치' }] };
}
// The stored key decides right or wrong; the model can only judge whether the reasoning behind a right choice holds up.
function clamp(grade: Grade, p: Chosen): Grade {
  if (!p.q.key || !p.picked) return grade;
  if (p.picked !== p.q.key.answer) return { ...grade, verdict: 'incorrect' };
  return { ...grade, verdict: grade.verdict === 'partial' ? 'partial' : grade.verdict === 'incorrect' ? 'partial' : 'correct' };
}
async function gradeAll(picks: Chosen[], snap: Snapshot, job: Job, platform: Platform, workspaces: Workspaces, model: Model, lease: () => Promise<void>): Promise<{ items: GradeItem[]; truncated: boolean } | string> {
  const items: GradeItem[] = []; let truncated = false, prepared: Awaited<ReturnType<Workspaces['prepare']>> | undefined;
  for (const p of picks) {
    if (p.q.key && !reasoned(p)) { items.push({ ...p, grade: keyGrade(p) }); continue; }
    if (!prepared) prepared = await workspaces.prepare(platform, snap, job.id, null);
    const context = prepared.context;
    if (!readable(p.q, context)) {
      if (p.q.key) { items.push({ ...p, grade: keyGrade(p) }); continue; }
      return `${p.label} 질문의 코드 근거를 현재 검토 자료에서 읽을 수 없어 채점을 보류합니다. 최신 질문를 다시 요청하세요.`;
    }
    const payload = learningInput({ snapshot: snap, question: p.q, developerAnswer: redact(p.text), diff: patches(context), policy: prepared.policy });
    if (!payload) return `${p.label} 채점 입력이 한도를 초과해 판정을 보류합니다. 질문과 답변 범위를 나누어 주세요.`;
    truncated ||= payload.truncated;
    await lease();
    const output = GradeSchema.parse(await model.run('grade', gradePrompt(gradeKind(p.label), context.sourceDir, payload.json), job.id, 120000));
    // /hey showanswer prints the stored key, so a keyed grade shows exactly that explanation and those option notes.
    const key = p.q.key, grade: Grade = key ? { ...output, expectedAnswer: key.explanation, optionExplanations: key.options } : { ...output, expectedAnswer: output.expectedAnswer ?? '' };
    if (!key) {
      const ids = (p.q.options ?? []).map(o => o.id), actual = grade.optionExplanations.map(o => o.id);
      if (!grade.expectedAnswer || ids.length !== actual.length || new Set(actual).size !== actual.length || ids.some(id => !actual.includes(id))) throw new Error('모든 보기의 해설이 필요합니다.');
    }
    if ((grade.verdict !== 'unverifiable' && !grade.evidence.length) || grade.evidence.some(e => !readable(e, context))) throw new Error('채점 코드 근거가 유효하지 않습니다.');
    items.push({ ...p, grade: clamp(grade, p) });
  }
  return { items, truncated };
}
export function patches(context: ReviewContext): Record<string, { oldPath: string; patch: string }> {
  return Object.fromEntries(Object.entries(context.diff).map(([path, d]) => [path, { oldPath: d.oldPath, patch: d.patch }]));
}
export function learningInput(data: Record<string, unknown>): { json: string; truncated: boolean } | null {
  const full = JSON.stringify(data); if (full.length <= 470000) return { json: full, truncated: false };
  const excerpt = (value: unknown, budget: number) => {
    const raw = JSON.stringify(value ?? null); let text = raw.slice(0, budget);
    while (JSON.stringify(text).length > budget) text = text.slice(0, Math.floor(text.length * 0.8));
    return { text, truncated: text.length < raw.length };
  };
  // Keep all prior question text and the complete chosen question/answer; source tools retain full code.
  const compact = { ...data, policy: excerpt(data.policy, 40000), ...(data.diff ? { diff: excerpt(data.diff, 180000) } : {}), contextNote: '자료 일부가 축약되어 있습니다. 코드 근거는 review_source 도구로 직접 확인하세요.' };
  const json = JSON.stringify(compact); return json.length <= 470000 ? { json, truncated: true } : null;
}
export async function handleLearning(command: Command, job: Job, platform: Platform, store: Store, workspaces: Workspaces, model: Model, all: RemoteComment[], lease: () => Promise<void>, trusted: RemoteComment[]): Promise<void> {
  const comment = job.body.comment!, target = job.body.target;
  const snap = await platform.snapshot(target.number, true);
  snap.title = redact(snap.title); snap.description = redact(snap.description);
  const key = commentKey(comment), notice = (text: string) => `${replyMarker(key)}\n${text}`;
  let response: CommandResult | undefined = job.command_result ?? undefined;
  if (response && command.action === 'reveal' && response.revealThreadVersion !== 1) {
    await lease();
    await platform.reply(target.number, notice('해설 요청 방식이 변경됐습니다. 해설을 볼 질문 댓글의 답글로 /hey showanswer를 다시 남겨 주세요.'), comment.parentId, comment.discussionId);
    return;
  }
  if (response && !sameRevision(response.snapshot, snap)) {
    await lease(); await platform.reply(target.number, notice('질문 생성·채점 도중 코드 기준이 바뀌었습니다. 최신 질문의 질문 번호로 다시 요청하세요.') + sourceLink(all, comment, snap), comment.parentId, comment.discussionId); return;
  }
  if (!response) {
    const state = await store.getTarget(target), report = state?.report;
    if (report && sameRevision(report.snapshot, snap) && report.snapshot.commits) snap.commits = report.snapshot.commits;
    let body = '', questions: ChangeQuestion[] | undefined, questionThread: CommandResult['questionThread'], grades: CommandResult['grades'], start: number | undefined, labels: string[] | undefined;
    const batches = (await store.learningBatches(snap)).filter(b => sameRevision(b.snapshot, snap));
    const current = report && hasChangeQuestions(report) && sameRevision(report.snapshot, snap) ? report.questions : [];
    const numbers = numbering(current, batches);
    const prior = [...new Map([...current, ...await store.questionHistory(snap), ...batches.flatMap(b => b.questions ?? [])].map(q => [questionId(snap, q), q])).values()];
    const kind = command.action === 'csinterview' || command.action === 'morecs' ? command.action : undefined, interview = kind !== undefined;
    const name = kind === 'morecs' ? '꼬리' : interview ? 'CS 면접' : '심화';
    // morecs continues the latest interview-family batch on this revision, whichever command produced it.
    const anchorBatch = batches.map((b, i) => ({ questions: b.questions ?? [], labels: numbers.batchLabels[i]!, kind: b.batchKind })).filter(b => interviewKinds.includes(b.kind) && b.questions.length).at(-1);
    if (!prior.length && !interview) {
      body = notice(['현재 코드 기준의 학습 질문이 준비되지 않았습니다. 최신 질문 생성이 완료된 후 질문 번호로 답하세요.', '', COMMAND_HELP_HINT].join('\n'));
    } else if (command.action === 'questions' && batches.filter(b => !b.batchKind).length >= MAX_BATCHES) {
      body = notice('이 코드 버전의 심화 질문은 5회까지 생성할 수 있습니다. 이미 나온 질문에 답하거나 관련 코드를 더 탐색해 보세요.');
    } else if (kind && batches.filter(b => b.batchKind === kind).length >= MAX_BATCHES) {
      body = notice(`이 코드 버전의 ${name} 질문은 5회까지 생성할 수 있습니다. 이미 나온 질문에 답하거나 관련 코드를 더 탐색해 보세요.`);
    } else if (kind === 'morecs' && !anchorBatch) {
      body = notice(['이 코드 버전에는 아직 CS 면접 질문이 없습니다. 먼저 `/hey csinterview`로 면접 질문을 받은 뒤 꼬리 질문을 요청하세요.', '', COMMAND_HELP_HINT].join('\n'));
    } else if (command.action === 'reveal') {
      const scope = threadQuestions(comment, trusted, snap, prior);
      body = 'error' in scope ? notice([scope.error, '', COMMAND_HELP_HINT].join('\n')) : renderReveal(scope.items, snap, key);
    } else if (command.action === 'answer') {
      const problems: string[] = [], picks: Chosen[] = [];
      for (const a of [{ id: command.id, text: command.text }, ...(command.more ?? [])]) {
        const q = /^(?:Q|심화|면접|꼬리)\d+$/.test(a.id) ? numbers.byLabel.get(a.id) : prior.find(p => questionId(snap, p) === a.id);
        if (!q) { problems.push(`${a.id}: 현재 코드 버전에서 찾을 수 없습니다. 변경 이해 질문은 Q번호, 심화 질문은 심화번호, CS 면접 질문은 면접번호, 꼬리 질문은 꼬리번호를 사용하세요.`); continue; }
        const label = labelOf(numbers.byLabel, snap, q) ?? questionId(snap, q);
        if (picks.some(p => questionId(snap, p.q) === questionId(snap, q))) { problems.push(`${label}: 한 명령에서 같은 질문에 두 번 답했습니다.`); continue; }
        const choice = picked(a.text, q);
        if ((q.options ?? []).length && !choice) { problems.push(`${label}: 보기 ${q.options.map(o => o.id).join('·')} 중 하나로 답하세요.`); continue; }
        picks.push({ q, label, text: a.text, picked: choice });
      }
      if (problems.length) body = notice([...problems.map(p => `- ${p}`), '', COMMAND_HELP_HINT].join('\n'));
      else {
        const graded = await gradeAll(picks, snap, job, platform, workspaces, model, lease);
        if (typeof graded === 'string') body = notice(graded);
        else {
          grades = graded.items.map(i => ({ id: questionId(snap, i.q), verdict: i.grade.verdict }));
          body = renderGrades(graded.items, snap, key) + (graded.truncated ? '\n\n입력 한도로 일부 정책 자료를 축약했습니다.' : '');
        }
      }
    } else if (command.action === 'questions' || interview) {
      const prepared = await workspaces.prepare(platform, snap, job.id, null), context = prepared.context;
            if (!hasQuestionSource(context)) body = notice(`이번 변경의 읽을 수 있는 코드 근거가 없어 ${name} 질문을 생성하지 못했습니다.`);
            else {
              // Interview prompts reason about earlier questions by their visible labels.
              const priorQuestions = interview ? prior.map(q => ({ label: labelOf(numbers.byLabel, snap, q) ?? null, question: q.question })) : prior.map(q => q.question);
              const anchorInput = kind === 'morecs' ? { anchorBatch: anchorBatch!.questions.map((q, i) => ({ label: anchorBatch!.labels[i], kind: anchorBatch!.labels[i]!.startsWith('꼬리') ? 'followup' : 'interview',
                anchor: q.anchor ?? null, question: q.question, options: q.options, answer: q.key?.answer ?? null, explanation: q.key?.explanation ?? null })) } : {};
              const payload = learningInput({ snapshot: snap, ...anchorInput, priorQuestions, diff: patches(context), policy: prepared.policy });
              if (!payload) body = notice('질문 이력이 입력 한도를 초과해 추가 생성을 보류합니다. 이미 나온 질문에 답하거나 변경 범위를 나누어 주세요.');
              else {
                const prompt = kind === 'morecs' ? moreCsPrompt(context.sourceDir, payload.json) : kind === 'csinterview' ? csInterviewPrompt(context.sourceDir, payload.json) : whatElsePrompt(context.sourceDir, payload.json);
                const result: { questions: ChangeQuestion[]; unavailableReason: string | null } = kind === 'morecs' ? MoreCsBatchSchema.parse(await model.run('morecs', prompt, job.id, MORECS_BUDGET_MS))
                  : kind === 'csinterview' ? CsInterviewBatchSchema.parse(await model.run('csinterview', prompt, job.id, 120000))
                  : QuestionBatchSchema.parse(await model.run('questions', prompt, job.id, 120000));
                const unavailableReason = result.unavailableReason;
                if (!result.questions.length) body = notice(`${name} 질문을 생성하지 못했습니다. ${plain(redact(unavailableReason!))}`);
                else {
                  const shaped = kind === 'morecs' ? followUps(result.questions, anchorBatch!.labels, unavailableReason) : { ordered: result.questions, uncovered: [] };
                  questions = validateQuestions(shaped.ordered.map(q => ({ ...q, question: redact(q.question), options: q.options.map(o => ({ ...o, text: redact(o.text) })),
                    key: { ...q.key!, explanation: redact(q.key!.explanation), options: q.key!.options.map(o => ({ ...o, explanation: redact(o.explanation) })) } })), context, prior);
                  if (kind === 'morecs') {
                    let followUp = numbers.nextFollowUp;
                    labels = questions.map(q => q.kind === 'interview' ? `면접${numbers.nextInterview}` : `꼬리${followUp++}`);
                    body = renderQuestionBatch(questions, snap, key, 1, '면접', labels);
                  } else { start = interview ? numbers.nextInterview : numbers.next; body = renderQuestionBatch(questions, snap, key, start, interview ? '면접' : '심화'); }
                  const target = kind === 'morecs' ? MORECS_COUNT : kind === 'csinterview' ? CS_INTERVIEW_COUNT : QUESTION_BATCH_SIZE;
                  if (unavailableReason && questions.length < target) body += `\n\n${questions.length}문항만 출제했습니다. ${plain(redact(unavailableReason))}`;
                  else if (unavailableReason && shaped.uncovered.length) body += `\n\n${shaped.uncovered.join('·')}에는 꼬리 질문을 달지 않았습니다. ${plain(redact(unavailableReason))}`;
                  const q = questions[0]!;
                  const anchor = Object.entries(context.diff).find(([path, d]) => q.side === 'LEFT' ? d.oldPath === q.path : path === q.path);
                  if (!anchor) throw new Error('Question thread anchor is unavailable');
                  questionThread = { path: anchor[0], oldPath: anchor[1].oldPath, line: q.line, side: q.side, coordinates: anchor[1].positions?.[q.side]?.[q.line], suggestion: null };
                }
                if (payload.truncated) body += '\n\n입력 한도로 일부 정책·코드 자료를 축약했습니다.';
              }
            }
    }
    if (!body) throw new Error('Unsupported learning command');
    await lease(); const latest = await platform.snapshot(target.number, true);
    if (!sameRevision(snap, latest)) throw new Error('Learning snapshot changed; retry against latest code');
    response = { snapshot: snap, body: redact(body) + sourceLink(all, comment, snap), ...(questions ? { questions, ...(labels ? { labels } : { start }), questionThread, ...(kind ? { batchKind: kind } : {}) } : {}), ...(grades ? { grades } : {}), ...(command.action === 'reveal' ? { revealThreadVersion: 1 as const } : {}) };
    if (response.body.length > 60000) throw new Error('Learning response exceeds comment budget');
    await store.saveCommandResult(job.id, job.owner, response);
  }
  await lease(); const latest = await platform.snapshot(target.number, true);
  if (!sameRevision(response.snapshot, latest)) throw new Error('Learning snapshot changed before publication');
  if (response.questions?.length && !response.questionThread) {
    // Old durable jobs can resume without a new model call; source supplies publication coordinates.
    const { context } = await workspaces.prepare(platform, response.snapshot, job.id, null);
    const q = response.questions[0]!;
    const anchor = Object.entries(context.diff).find(([path, d]) => q.side === 'LEFT' ? d.oldPath === q.path : path === q.path);
    if (!anchor) throw new Error('Question thread anchor is unavailable');
    response = { ...response, questionThread: { path: anchor[0], oldPath: anchor[1].oldPath, line: q.line, side: q.side, coordinates: anchor[1].positions?.[q.side]?.[q.line], suggestion: null } };
  }
  await platform.reply(target.number, response.body, comment.parentId, comment.discussionId, response.questionThread ? { ...response.questionThread, snapshot: response.snapshot } : undefined);
}
