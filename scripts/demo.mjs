import { mkdir, writeFile } from 'node:fs/promises';
import { InitialQuestionsSchema, QuestionBatchSchema, CsInterviewBatchSchema, GradeSchema } from '../dist/contracts.js';
import { renderReport, renderQuestionThread, renderQuestionBatch, renderGrade, renderReveal, renderCommandHelp } from '../dist/render.js';
import { questionId } from '../dist/learning.js';
import { report, choices } from '../test/fixtures.mjs';

// Illustrative source contract: pay(key) calls charge(key), then saves the order.
// charge reuses the approval for the same key; its effects are outside the local DB transaction.
const question = (text, line, level, options, answer, explanation, notes) => ({
  question: text, path: 'src/pay.ts', line, side: 'RIGHT', level, options: choices(...options),
  key: { answer, explanation, options: notes.map((explanation, i) => ({ id: 'ABCD'[i], explanation })) },
});
const initial = InitialQuestionsSchema.parse({ questions: [
  question('pay의 재시도에 첫 요청의 멱등 키를 전달하는 이유는 무엇인가요?', 2, 'basic',
    ['재시도마다 새 승인을 만들기 위해', '외부 승인 서비스가 동일 요청을 식별하도록 하기 위해', '주문 저장을 생략하기 위해', '모든 오류의 재시도를 금지하기 위해'], 'B',
    '멱등성은 같은 요청을 반복해도 최종 효과가 같다는 성질입니다. 이 예시의 pay는 재시도에 같은 멱등 키를 전달해 charge가 기존 승인을 식별하도록 합니다.',
    ['새 승인을 만드는 것이 아니라 기존 요청을 식별해야 합니다.', '같은 키가 동일 요청과 기존 승인을 연결합니다.', '승인과 주문 저장은 별도 단계이며 주문 저장도 필요합니다.', '멱등 처리는 안전한 재시도를 돕습니다.']),
  question('DB 트랜잭션만으로 외부 승인을 되돌릴 수 없는 이유는 무엇인가요?', 2, 'basic',
    ['외부 서비스의 부작용이 로컬 DB 트랜잭션에 참여하지 않기 때문에', 'DB 트랜잭션은 읽기만 허용하기 때문에', '멱등 키가 DB 잠금을 해제하기 때문에', '주문 저장보다 승인이 항상 느리기 때문에'], 'A',
    '외부 승인은 로컬 DB 트랜잭션의 롤백 범위 밖에 있으므로 멱등 처리와 명시적인 복구 전략이 필요합니다.',
    ['외부 서비스는 이 예시의 로컬 DB 트랜잭션에 참여하지 않습니다.', 'DB 트랜잭션은 쓰기도 포함합니다.', '멱등 키는 요청 식별자이며 DB 잠금 해제 명령이 아닙니다.', '호출 속도가 아니라 트랜잭션의 참여 범위가 이유입니다.']),
] }).questions;
const deeper = QuestionBatchSchema.parse({ questions: [
  question('pay 멱등 키의 보관 기간을 정할 때 어떤 범위를 고려해야 하나요?', 2, 'advanced',
    ['허용하는 재시도·복구 기간과 외부 승인 서비스의 키 보장 기간', '응답을 받기까지 걸린 시간만', '주문 테이블의 열 개수만', '요청 본문의 문자열 길이만'], 'A',
    '같은 요청이 다시 도착할 수 있는 기간과 외부 서비스의 보장 기간이 어긋나면 중복 승인을 막지 못할 수 있습니다.',
    ['재시도와 외부 보장의 범위를 함께 확인해야 합니다.', '응답 후에도 재시도가 도착할 수 있습니다.', '열 개수는 키 보장 기간을 결정하지 않습니다.', '문자열 길이는 복구 기간의 근거가 아닙니다.']),
  question('동시에 들어온 pay 요청이 같은 키를 사용할 때 로컬 처리 기록의 중복 생성을 막는 방법은 무엇인가요?', 3, 'advanced',
    ['조회한 뒤 별도 검증 없이 삽입한다', '로그에 같은 키를 출력한다', '키의 유일 제약과 원자적인 생성·충돌 처리를 사용한다', '호출마다 새 키를 발급한다'], 'C',
    '키의 유일성을 원자적으로 확보하고 충돌 시 기존 처리 상태를 사용해야 조회와 삽입 사이의 경쟁을 막을 수 있습니다.',
    ['조회 후 삽입 사이에 경쟁 조건이 남습니다.', '로그는 중복 생성을 차단하지 않습니다.', '유일 제약과 원자적 처리가 같은 키의 경쟁을 제어합니다.', '새 키는 같은 요청을 서로 다른 요청으로 보이게 합니다.']),
  question('charge 응답이 타임아웃되어 승인 성공 여부가 불확실할 때 pay는 어떤 복구 원칙을 따라야 하나요?', 2, 'advanced',
    ['항상 새 키로 승인한다', '성공으로 단정하고 주문 저장을 생략한다', '주문을 무조건 성공 처리한다', '같은 키로 상태를 조회하거나 멱등 재시도한다'], 'D',
    '타임아웃은 승인 실패를 증명하지 않습니다. 같은 키로 결과를 확인하거나 멱등 재시도해 불확실성을 해소합니다.',
    ['새 키는 이미 성공한 승인과 별도 승인을 만들 수 있습니다.', '성공을 확인하지 않았으며 주문 저장도 필요합니다.', '불확실한 상태를 성공으로 단정할 수 없습니다.', '동일 요청의 식별을 유지하면서 결과를 확인합니다.']),
  question('pay에서 외부 승인 후 주문 저장을 끝내 복구하지 못할 때 보상 동작은 어떤 성질이 필요하나요?', 3, 'advanced',
    ['로컬 롤백만으로 외부 취소가 끝났다고 가정한다', '외부 취소 결과를 기록하고 중복 요청에도 안전하게 재시도한다', '취소를 시작하자마자 모든 기록을 삭제한다', '매번 다른 승인 ID를 취소한다'], 'B',
    '보상 동작도 외부 호출이므로 실패·재시도·중복을 고려해 결과를 기록하고 같은 승인에 안전하게 적용해야 합니다.',
    ['외부 취소는 로컬 롤백으로 수행되지 않습니다.', '결과 기록과 안전한 재시도가 보상의 복구를 돕습니다.', '기록을 지우면 실패한 보상을 추적할 수 없습니다.', '보상은 원래 승인에 연결되어야 합니다.']),
  question('pay의 승인 성공·주문 저장 실패·재시도 경로를 검증할 때 어떤 관찰이 핵심인가요?', 3, 'advanced',
    ['재시도에 같은 키가 전달되고 최종 주문과 실제 승인이 중복되지 않는다', '로그 줄 수만 이전과 같다', '두 번째 호출이 첫 호출보다 빠르다', '각 재시도에 새 승인 ID가 만들어진다'], 'A',
    '실패를 주입한 뒤 키 재사용과 최종 부작용을 확인해야 중복 없는 복구 동작을 검증할 수 있습니다.',
    ['키와 최종 부작용은 요구한 동작을 직접 관찰합니다.', '로그 줄 수만으로 승인과 저장을 검증할 수 없습니다.', '속도만으로 멱등성을 검증할 수 없습니다.', '새 승인 ID는 중복 승인 가능성을 뜻합니다.']),
] }).questions;
const interviewBatch = CsInterviewBatchSchema.parse({ questions: [
  question('동일한 결제 요청이 재전송되어 두 번 도착했지만 최종 결제 효과는 한 번 요청했을 때와 같다면, 이를 설명하는 성질은 무엇인가요?', 2, 'basic',
    ['원자성(atomicity): 연산들을 전부 반영하거나 전부 반영하지 않는 성질입니다.', '멱등성(idempotency): 동일 요청을 반복해도 최종 효과가 같은 성질입니다.', '격리성(isolation): 동시에 실행하는 트랜잭션의 상호 간섭을 제어하는 성질입니다.', '내구성(durability): 커밋된 변경을 장애 후에도 보존하는 성질입니다.'], 'B',
    '멱등성(idempotency)은 동일 요청을 반복해도 최종 효과가 한 번 실행했을 때와 같다는 성질입니다. 이 예시에서는 같은 키로 기존 승인을 식별하여 중복 결제를 막습니다.',
    ['원자성은 연산 묶음의 전체 반영 여부를 다루며 요청 반복에 따른 중복 효과를 막는다는 뜻은 아닙니다.', '동일 요청의 반복에도 결제 효과가 같다는 조건이 멱등성에 해당합니다.', '격리성은 동시 실행의 간섭에 관한 성질이며 순차적으로 재전송된 요청의 중복 효과까지 보장하지 않습니다.', '내구성은 커밋된 변경의 보존을 다루며 같은 요청의 중복 처리를 막는 성질은 아닙니다.']),
  question('외부 서비스에 보낸 요청이 타임아웃(timeout)됐을 때, 서버의 처리 결과에 대한 설명으로 옳은 것은 무엇인가요?', 2, 'basic',
    ['서버가 요청을 받지 못했으므로 재전송해도 중복 처리는 발생하지 않습니다.', '서버가 요청을 받았더라도 클라이언트의 대기가 끝나면 서버의 처리는 취소됩니다.', '응답을 받지 못했어도 서버는 처리를 완료했을 수 있으므로 재시도 시 중복 처리를 고려해야 합니다.', '서버가 처리를 완료했다면 응답도 도착하므로 타임아웃은 처리 미완료를 뜻합니다.'], 'C',
    '타임아웃(timeout)은 정해진 시간 안에 응답을 받지 못했다는 관찰이며 서버의 처리 실패를 확정하지 않습니다. 이 예시의 외부 승인은 완료됐어도 응답 전달이 실패할 수 있으므로 같은 요청을 식별하는 복구 전략이 필요합니다.',
    ['응답을 받지 못했다는 사실만으로 요청이 서버에 도착하지 않았다고 판단할 수 없습니다.', '클라이언트의 대기 종료만으로 서버 작업의 취소가 보장되지는 않습니다.', '서버 처리와 응답 전달은 구분해야 하므로 중복 부작용을 고려한 재시도가 필요합니다.', '서버가 처리를 완료한 뒤에도 응답이 유실되거나 늦게 도착할 수 있습니다.']),
], unavailableReason: '이 고정 예시에서는 두 가지 학습 목표만 보여 줍니다.' });
const interview = interviewBatch.questions;
const value = report({ schemaVersion: '2', questions: initial, findings: [], checks: [], recommendedTests: [], limitations: [] });
const grade = GradeSchema.parse({ verdict: 'correct', explanation: '같은 키로 기존 요청을 식별한다는 답이 맞습니다.', expectedAnswer: initial[0].key.explanation,
  optionExplanations: initial[0].key.options, evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '같은 멱등 키를 charge에 전달하는 예시 흐름' }] });
const disclaimer = '# 댓글 학습 흐름 예시\n\nFixture 예시이며 실제 모델 평가가 아닙니다. pay가 같은 키로 charge를 호출한 뒤 주문을 저장하고, charge가 같은 키의 승인을 재사용한다고 가정합니다.\n\n';
// Examples show public content; reconciliation markers belong only to live comments.
const visible = text => text.split('\n').filter(line => !/^<!-- codereviewbot:/.test(line)).join('\n');
await mkdir('.local', { recursive: true });
await writeFile('.local/demo-report.md', visible(renderReport(value, new Map([[questionId(value.snapshot, initial[0]), 'correct']]))) + '\n');
await writeFile('.local/demo-inline.md', visible(renderQuestionThread(initial[0], value.snapshot, 1)) + '\n');
await writeFile('.local/demo-help.md', visible(renderCommandHelp('issue-demo-help')) + '\n');
await writeFile('.local/demo-learning.md', disclaimer + visible(renderQuestionBatch(deeper, value.snapshot, 'issue-demo-more')) + '\n\n---\n\n' + visible(renderGrade(initial[0], value.snapshot, grade, 'issue-demo-answer', 'Q1', 'B')) + '\n');
await writeFile('.local/demo-csinterview.md', disclaimer + visible(renderQuestionBatch(interview, value.snapshot, 'issue-demo-interview', 1, '면접')) + `\n\n${interview.length}문항만 출제했습니다. ${interviewBatch.unavailableReason}` + '\n\n---\n\n' + visible(renderReveal(interview.map((q, i) => ({ q, label: `면접${i + 1}` })), value.snapshot, 'issue-demo-reveal')) + '\n');
console.log('Created .local/demo-report.md, .local/demo-inline.md, .local/demo-learning.md, .local/demo-csinterview.md and .local/demo-help.md (fixtures, no model calls).');
