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
// Interview questions follow the csinterview bar: a definition alone cannot pick the answer, and wrong-option notes name the confused concept.
const interviewBatch = CsInterviewBatchSchema.parse({ questions: [
  question('결제 함수가 외부 승인 API를 호출합니다. 승인 API는 같은 멱등 키(idempotency key)로 다시 들어온 요청에는 새 승인 없이 처음 결과를 돌려줍니다. 결제 함수는 재시도 루프에서 HTTP 요청을 보낼 때마다 새 UUID를 멱등 키로 만들어 붙입니다. 첫 요청이 승인된 뒤 응답 전에 타임아웃되었다면, 재시도 결과로 옳은 것은 무엇인가요?', 2, 'advanced',
    ['멱등 키를 붙였으므로 재시도해도 승인은 한 번만 일어납니다.', '타임아웃은 첫 요청이 실패했다는 뜻이므로 재시도가 첫 승인이 됩니다.', '재시도는 다른 키를 가지므로 서버가 새 요청으로 보고 승인이 두 번 일어날 수 있습니다.', '서버가 같은 금액과 카드 정보로 중복을 알아채므로 승인은 한 번만 일어납니다.'], 'C',
    '멱등성(idempotency)은 같은 연산을 여러 번 적용해도 결과가 한 번 적용한 것과 같은 성질이며, 멱등 키는 서버가 같은 논리적 연산을 알아보게 하는 식별자입니다. 서버는 키로만 중복을 판단하므로 재시도마다 새 키를 만들면 서로 다른 연산으로 보입니다. 타임아웃은 응답을 받지 못했다는 관찰일 뿐 처리 실패가 아니므로, 첫 승인이 이미 일어났다면 재시도가 두 번째 승인이 됩니다. 키를 결제 시도마다 한 번 만들어 저장하고 모든 재시도에 재사용하면 결론이 바뀝니다. 이 예시의 pay가 첫 요청의 키를 재시도에 그대로 전달하는 지점이 이 보장에 기댑니다.',
    ['멱등성의 정의만 적용하고 멱등 키의 범위를 놓쳤습니다. 서버는 **키가 같은 요청만 같은 연산으로 판단**하므로 요청마다 새 키를 붙이면 멱등성이 성립하지 않습니다.', '타임아웃과 실패를 혼동했습니다. 타임아웃은 **응답을 받지 못했다는 관찰**일 뿐이며, 서버는 처리를 끝냈을 수 있습니다.', '재시도마다 키가 달라 서버가 같은 결제임을 알 수 없고, 첫 승인이 이미 처리되었을 수 있으므로 승인이 두 번 일어날 수 있습니다.', '내용 기반 중복 제거를 가정했습니다. 이 서버는 **멱등 키로만 중복을 판단**하며, 같은 금액의 정당한 결제도 반복될 수 있습니다.']),
  question('결제 함수가 하나의 DB 트랜잭션 안에서 외부 승인 API를 호출한 뒤 주문 행을 삽입하고 커밋합니다. 삽입 후 커밋 직전에 DB 연결이 끊겨 트랜잭션이 롤백되었다고 가정합니다. 이때 시스템 상태로 옳은 것은 무엇인가요?', 2, 'basic',
    ['트랜잭션이 롤백되었으므로 외부 승인도 함께 취소됩니다.', '주문 행은 남지 않지만 외부 승인은 유지되어, 승인은 있고 주문은 없는 상태가 됩니다.', '주문 행은 삽입 시점에 디스크에 기록되었으므로 재시작 후 복구됩니다.', '외부 호출을 트랜잭션 안에 두었으므로 DB가 2단계 커밋으로 승인과 주문을 함께 커밋하거나 함께 취소합니다.'], 'B',
    '원자성(atomicity)은 한 트랜잭션 안의 DB 변경이 전부 반영되거나 전혀 반영되지 않는 성질입니다. DB는 자신이 관리하는 데이터의 변경만 기록하고 되돌리므로, 트랜잭션 안에서 호출한 외부 API의 부작용은 롤백 범위 밖에 있습니다. 따라서 커밋 직전에 롤백되면 주문 행은 사라지지만 외부 승인은 남아 승인과 주문이 어긋납니다. 외부 서비스가 같은 커밋 조정에 참여하거나 취소 같은 보상 동작을 따로 설계하면 결론이 바뀝니다. 이 예시에서 승인 뒤 주문 저장이 실패할 수 있는 지점이 이 경계에 기댑니다.',
    ['원자성의 범위를 과대평가했습니다. 롤백은 **DB가 기록한 변경만 되돌리며**, 외부 API가 이미 만든 부작용은 취소하지 않습니다.', 'DB 변경은 롤백되고 외부 승인은 롤백 범위 밖에 남으므로 승인과 주문이 어긋난 상태가 됩니다.', '내구성(durability)을 잘못 적용했습니다. 내구성은 **커밋된 변경만** 장애 뒤에도 보존하며, 커밋되지 않은 변경은 복구 대상이 아닙니다.', '분산 트랜잭션이 저절로 일어난다고 가정했습니다. 2단계 커밋(two-phase commit)은 **모든 참여자가 같은 프로토콜을 지원할 때만** 가능하며, 일반 HTTP 호출은 참여하지 않습니다.']),
], unavailableReason: null });
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
await writeFile('.local/demo-csinterview.md', disclaimer + visible(renderQuestionBatch(interview, value.snapshot, 'issue-demo-interview', 1, '면접')) + '\n\n---\n\n' + visible(renderReveal(interview.map((q, i) => ({ q, label: `면접${i + 1}` })), value.snapshot, 'issue-demo-reveal')) + '\n');
console.log('Created .local/demo-report.md, .local/demo-inline.md, .local/demo-learning.md, .local/demo-csinterview.md and .local/demo-help.md (fixtures, no model calls).');
