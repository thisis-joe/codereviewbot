import { InitialQuestionsSchema, emptyReport, type Finding, type Report, type Snapshot, type ChangeQuestion } from './contracts.js';
import type { Policy } from './policy.js';
import { changeExplanation, grounding, hunkRule, questionSecurity, renameRule, sourceTools, stemRule } from './prompt-blocks.js';

export interface DiffPosition { oldLine?: number; newLine?: number }
export interface DiffMetadata { oldPath: string; positions?: Record<'LEFT' | 'RIGHT', Record<number, DiffPosition>> }
export interface DiffFile extends DiffMetadata { patch: string; lines: Set<number>; oldLines?: Set<number> }
export interface ReviewContext { files: Record<string, string>; baseFiles?: Record<string, string>; diff: Record<string, DiffFile>; excluded: string[]; limited: boolean; sourceDir: string; changesSincePrevious?: { fromHeadSha: string; files: Record<string, { oldPath: string; patch: string }> } }
export type ModelPhase = 'answer' | 'initial_questions' | 'questions' | 'csinterview' | 'morecs' | 'grade';
export interface Model { run(phase: ModelPhase, prompt: string, workspaceId: string, timeoutMs?: number): Promise<unknown> }
export function parsePatch(patch: string, side: 'LEFT' | 'RIGHT' = 'RIGHT'): Set<number> {
  const result = new Set<number>(); let line = 0, active = false;
  for (const text of patch.split('\n')) {
    const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { line = Number(hunk[side === 'LEFT' ? 1 : 2]); active = true; }
    else if (active && (text.startsWith(side === 'LEFT' ? '-' : '+') || text.startsWith(' '))) { result.add(line++); }
    else if (text.startsWith('diff --git')) active = false;
  }
  return result;
}
export function parsePositions(patch: string): NonNullable<DiffMetadata['positions']> {
  const positions: NonNullable<DiffMetadata['positions']> = { LEFT: {}, RIGHT: {} };
  let oldLine = 0, newLine = 0, active = false;
  for (const text of patch.split('\n')) {
    const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { oldLine = Number(hunk[1]); newLine = Number(hunk[2]); active = true; }
    else if (text.startsWith('diff --git')) active = false;
    else if (active && text.startsWith(' ')) { const point = { oldLine, newLine }; positions.LEFT[oldLine++] = point; positions.RIGHT[newLine++] = point; }
    else if (active && text.startsWith('-')) positions.LEFT[oldLine] = { oldLine: oldLine++ };
    else if (active && text.startsWith('+')) positions.RIGHT[newLine] = { newLine: newLine++ };
  }
  return positions;
}
function questionSourcePath(q: Pick<ChangeQuestion, 'path' | 'line' | 'side'>, context: ReviewContext): string | null {
  const diff = context.diff[q.path], path = q.side === 'LEFT' ? diff?.oldPath : q.path;
  const source = q.side === 'LEFT' ? context.baseFiles : context.files;
  const lines = q.side === 'LEFT' ? diff?.oldLines : diff?.lines;
  // A pure rename has readable source and an explicit path change but no text hunk.
  return diff && path && source && Object.hasOwn(source, path) && q.line > 0 && q.line <= source[path]!.split('\n').length && (lines?.has(q.line) || (diff.oldPath !== q.path && !diff.patch.trim())) ? path : null;
}
export function hasQuestionSource(context: ReviewContext): boolean {
  return Object.entries(context.diff).some(([path, diff]) => (['LEFT', 'RIGHT'] as const).some(side =>
    questionSourcePath({ path, side, line: (side === 'LEFT' ? diff.oldLines : diff.lines)?.values().next().value ?? 1 }, context)));
}
export function validateQuestions(questions: ChangeQuestion[], context: ReviewContext, prior: ChangeQuestion[] = []): ChangeQuestion[] {
  const keyOf = (q: ChangeQuestion) => q.question.normalize('NFKC').replace(/\s+/g, '').replace(/[?？.!]/g, '').toLowerCase();
  const seen = new Set(prior.map(keyOf));
  return questions.map(q => {
    const key = keyOf(q);
    if (seen.has(key)) throw new Error('중복 질문은 허용하지 않습니다.'); seen.add(key);
    const path = questionSourcePath(q, context);
    if (!path) throw new Error('질문의 코드 근거는 이번 변경의 유효한 위치여야 합니다.');
    return { ...q, path };
  });
}
export function buildQuestionPrompt(s: Snapshot, policy: Policy, context: ReviewContext, guidelines: string[], issues: string[], previous: Report | null = null): string {
  const data = JSON.stringify({ snapshot: s, policy, guidelines, linkedIssues: issues,
    changesSincePrevious: context.changesSincePrevious ?? null, previousQuestions: previous?.questions.map(q => q.question) ?? [],
    diff: Object.fromEntries(Object.entries(context.diff).map(([path, d]) => [path, { oldPath: d.oldPath, patch: d.patch }])), excluded: context.excluded });
  return `당신은 이 저장소의 시니어 엔지니어입니다. 동료가 이 PR/MR을 승인하기 전에 변경을 제대로 이해했는지 확인하는 4지선다 질문 2개를 냅니다. 이 질문은 머지 전 관문입니다. 답하지 못하는 리뷰어라면 아직 승인하면 안 되는 내용을 물으세요. 문항은 평가이자 학습 자료이므로, 틀린 사람도 해설을 읽고 이 변경을 이해할 수 있어야 합니다.

[임무]

두 질문 모두 level=basic입니다. Q1과 Q2는 서로 다른 이해를 확인합니다. 같은 사실을 효과와 원리로 두 번 묻지 마세요.
- Q1은 변경의 핵심 효과를 묻습니다. 리뷰어가 승인 전에 반드시 알아야 할 효과 하나를 고르세요. 이 변경이 머지되면 무엇이 달라지는지(동작, 새로 얻는 보장, 새로 생기는 위험, 영향받는 호출부·데이터·운영) 가운데 승인 판단을 가장 크게 바꾸는 것입니다.
- Q2는 이 변경의 정확성이 가장 크게 기대는 원리 하나를 이번 변경의 상황에서 묻습니다. 그 원리가 성립하지 않으면 이 변경이 틀리게 되어야 합니다. 원리의 이름이나 정의를 묻지 말고, 이번 변경의 구체적인 상황에 그 원리를 적용한 결론을 고르게 하세요. 원리는 멱등성·원자성·동시성 같은 CS 원리일 수도, 데이터 계약·하위 호환·권한 경계·실패 격리 같은 설계 원리일 수도 있습니다. 변경이 실제로 기대지 않는 원리를 끼워 넣지 마세요.

[기본 수준]

기본 수준은 효과나 원리 하나를 이번 변경의 짧고 구체적인 상황에 적용하는 수준입니다. 여러 장애가 겹치는 복구 시나리오, 성능 계산, 여러 설계 대안 비교는 /hey whatelse의 심화 질문으로 남기세요. 반환값·설정값·파일명·호출 횟수·예외 이름을 기억하는 문제로 난이도를 낮추지도 마세요.

[출제하지 않는 문항]

- 특정 입력의 출력값이나 파일명을 코드대로 계산하면 끝나는 문항, 문서의 한 문장이나 설정값을 찾아 고르는 문항
- 선택지의 차이가 예외 처리 경로나 내부 규칙의 결과뿐인 문항. "이유"나 "책임 경계"라는 말을 붙여도 같습니다.
- 함수 이름이나 예외 이름만 서로 바꾼 보기, 변경 맥락 없이도 성립하는 일반 CS 상식 문항
- 이름 바꾸기 시험을 통과하지 못하는 문항: 질문과 보기의 함수명·필드명·상수를 역할을 나타내는 말로 바꿨을 때 조건 → 원리 → 보장 또는 위험의 관계가 남지 않으면 그 주제를 버리세요.

[예시]

아래 예시는 기준을 보여 주기 위한 것이며 이 저장소와 무관합니다.
- 나쁜 Q1: "이번 변경에서 결제 재시도는 최대 몇 번 일어나나요?" — 상수를 찾아 읽으면 끝나고, 승인 판단에 필요한 이해를 확인하지 않습니다.
- 좋은 Q1: "결제 재시도가 첫 요청의 멱등 키를 재사용하도록 바뀐 뒤, 타임아웃 후 재시도가 일어나면 외부 승인은 어떻게 되나요?" — 머지 후 달라지는 동작(중복 승인 방지)을 이해해야 답할 수 있습니다.

[질문과 보기]

- 질문은 필요한 맥락을 담은 짧은 존댓말 의문형 한 문장입니다. 80자 안팎을 권장하지만, 정답을 하나로 정하는 데 필요한 조건은 줄이지 마세요. 함수명은 특정 구현을 구별할 때만 쓰고, "응답 크기를 누적 검사하도록 바뀐 뒤"처럼 무엇이 바뀌었는지 자연스러운 말로 쓰세요. 원리의 이름을 질문에 드러내 답을 암시하지 마세요.
- 보기는 A·B·C·D 순서의 {id,text}이며 정답은 정확히 하나입니다. 각 보기는 한 가지 주장을 담은 완결된 문장입니다. 오답은 이 변경의 동작·이유·영향 가운데 하나를 실제로 잘못 읽었을 때 고를 법한 내용이어야 합니다. 정답만 유난히 길거나 자세하지 않게 하고 정답 위치를 섞으세요. 질문과 보기에 정답 표시나 해설을 넣지 마세요.
- 조건을 바꾼 상황을 묻는다면 바뀐 조건을 명시하고, 고정된 코드와 확인된 원리에서 결론이 나오는 범위로 제한하세요.
- ${stemRule}

${changeExplanation}

[근거와 출제 범위]

- ${sourceTools(context.sourceDir)} 관련 흐름을 확인한 뒤 출제하세요. 파일명이나 키워드만 보고 판단하지 마세요.
- 각 질문의 path·line·side에는 그 효과나 원리가 드러나는 변경 위치를 적습니다. ${hunkRule} 질문의 주제를 그 한 줄의 동작으로 제한하지는 마세요. ${renameRule} 텍스트 hunk가 없는 순수 이름 변경은 이동한 파일의 관련 줄을 적습니다.
- changesSincePrevious가 있으면 이번 증분의 실제 변경만 출제 대상으로 삼으세요. previousQuestions는 중복을 피하기 위한 자료입니다. changesSincePrevious의 변경 전 코드는 직전 출제 커밋이고, read_base_file과 diff의 LEFT는 MR/PR 기준 커밋이므로 구분하세요. 게시할 코드 위치는 diff의 좌표를 사용하세요.
- ${grounding}

[자기 검토]

다음을 하나라도 통과하지 못하면 주제부터 다시 고르세요.
- 이 질문에 답하지 못하는 리뷰어가 승인하면 위험한가?
- 정답을 고르려면 변경의 효과나 원리를 이해해야 하고, 값 조회나 실행 순서 추적만으로는 풀리지 않는가?
- 질문의 조건과 코드로 정답이 정확히 하나인가? 질문 문장만으로는 정답을 고를 수 없는가?
- 오답 셋이 각각 이 변경을 실제로 잘못 읽은 결과이고, 질문의 전제와 맞는가?
- 해설만 읽은 동료가 변경 전후의 차이와 그 이유를 이해할 수 있는가?

[출력]

지정된 출력 스키마에 맞는 JSON만 반환하세요. questions에는 정확히 2개 문항을 넣고, 각 문항에는 question, path, line, side, level, options, key를 작성합니다. level은 모두 basic입니다. 질문에 난이도 태그를 붙이지 말고, 후보 목록·검토 과정·평가표는 출력하지 마세요.

${questionSecurity}

출제 자료(JSON 데이터):
${data}`;
}
/** Keep historical reports readable without re-evaluating their findings. */
export function archivedFindings(previous: Report | null): Finding[] {
  return (previous?.findings ?? []).map(f => ['new', 'open'].includes(f.status) ? { ...f, status: 'unverified' } : { ...f });
}
export async function generateQuestions(model: Model, workspaceId: string, s: Snapshot, policy: Policy, context: ReviewContext, previous: Report | null, guidelines: string[], issues: string[], mode: Report['mode'], budgetMs = 120000): Promise<Report> {
  const base = { ...emptyReport(s, 'completed', ''), mode, findings: archivedFindings(previous), reviewedFiles: Object.keys(context.diff), excludedFiles: context.excluded };
  if (!hasQuestionSource(context)) {
    const reason = '출제 가능한 텍스트 변경 근거가 없어 질문을 생성하지 못했습니다.';
    return { ...base, state: 'partial', questionsUnavailableReason: reason, limitations: [reason] };
  }
  const result = InitialQuestionsSchema.parse(await model.run('initial_questions', buildQuestionPrompt(s, policy, context, guidelines, issues, previous), workspaceId, budgetMs));
  // Keep the model's priority order; difficulty quotas no longer apply.
  return { ...base, state: context.limited ? 'partial' : 'completed',
    questions: validateQuestions(result.questions, context),
    limitations: context.limited ? ['자료 크기 제한으로 일부 변경을 출제 범위에서 제외했습니다.'] : [] };
}
