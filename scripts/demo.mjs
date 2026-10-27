import { mkdir, writeFile } from 'node:fs/promises';
import { InitialQuestionsSchema, QuestionBatchSchema, CsInterviewBatchSchema, MoreCsBatchSchema, GradeSchema } from '../dist/contracts.js';
import { renderReport, renderQuestionThread, renderQuestionBatch, renderGrade, renderGrades, renderReveal, renderCommandHelp, renderAnswer, plain } from '../dist/render.js';
import { questionId } from '../dist/learning.js';
import { report, choices, checked } from '../test/fixtures.mjs';

// Illustrative source contract: pay(key) calls charge(key), then saves the order.
// charge reuses the approval for the same key; its effects are outside the local DB transaction.
const question = (text, line, level, options, answer, explanation, notes) => ({
  question: text, path: 'src/pay.ts', line, side: 'RIGHT', level, options: choices(...options),
  key: { answer, explanation, options: notes.map((explanation, i) => ({ id: 'ABCD'[i], explanation })) },
});
// Change questions explain the change to a reviewer: behavior before vs after, why it matters, what goes wrong if misread.
const initial = InitialQuestionsSchema.parse({ questions: [
  question('pay가 재시도에 첫 요청의 멱등 키를 그대로 넘기도록 바뀐 뒤, charge 응답이 타임아웃되어 재시도하면 외부 승인은 어떻게 되나요?', 2, 'basic',
    ['재시도는 새 키로 다시 승인을 요청하므로 승인이 두 번 생길 수 있습니다.', 'charge가 같은 키를 알아보고 처음 승인을 돌려주므로 승인은 한 번만 생깁니다.', '타임아웃은 첫 승인이 실패했다는 뜻이므로 재시도가 첫 승인이 됩니다.', '같은 키를 쓰면 charge가 재시도를 거절하므로 주문 저장까지 실패합니다.'], 'B',
    '변경 전에는 재시도마다 새 키를 만들어 **타임아웃 뒤 재시도가 승인을 한 번 더 만들 수 있었고**, 이제는 첫 요청의 키를 넘겨 charge가 같은 요청으로 알아보고 처음 승인을 돌려줍니다. 이 보장은 키를 재사용하는 동안에만 성립하므로, 재시도 경로에서 키를 새로 만드는 호출부가 생기면 중복 승인이 다시 생깁니다.',
    ['변경 전 동작으로 읽었습니다. 이제 재시도는 **첫 요청의 키를 그대로** 넘기므로 charge가 새 승인을 만들지 않습니다.', 'pay가 재시도에 같은 키를 넘기고, charge는 같은 키의 기존 승인을 돌려줍니다.', '타임아웃을 실패로 읽었습니다. 타임아웃은 **결과를 모른다는 뜻**이라 첫 승인이 이미 생겼을 수 있고, 그래서 같은 키가 필요합니다.', '키 재사용의 효과를 반대로 읽었습니다. charge는 같은 키를 **거절하지 않고 기존 승인을 돌려주며**, 주문 저장은 그 뒤에 그대로 진행됩니다.']),
  question('pay는 charge 승인 뒤 같은 DB 트랜잭션 안에서 주문을 저장합니다. 주문 저장이 실패해 트랜잭션이 롤백되면 외부 승인은 어떤 상태인가요?', 2, 'basic',
    ['외부 승인은 DB 롤백 범위 밖이라 남아 있고, 같은 키로 재시도하면 그 승인을 다시 씁니다.', '트랜잭션이 롤백되므로 외부 승인도 함께 취소됩니다.', '롤백 전에 승인 기록이 커밋되므로 주문도 함께 복구됩니다.', '롤백되면 멱등 키도 지워져 재시도는 새 승인을 만듭니다.'], 'A',
    'charge의 승인은 로컬 DB 트랜잭션에 참여하지 않으므로, 주문 저장이 롤백돼도 **승인은 외부에 남습니다**. 이번 변경이 재시도에 같은 키를 넘기기 때문에 다시 시도하면 charge가 그 승인을 돌려주어 승인이 쌓이지 않습니다. 롤백이 승인까지 되돌린다고 믿으면 **보상 없이 재시도를 막는** 잘못된 판단을 하게 됩니다.',
    ['승인은 외부 부작용이라 롤백 뒤에도 남고, 같은 키의 재시도가 그 승인을 재사용합니다.', 'DB 원자성의 범위를 넓게 읽었습니다. 롤백은 **DB가 기록한 변경만** 되돌리며 charge의 승인은 취소하지 않습니다.', '저장 순서를 잘못 읽었습니다. 주문 저장과 롤백은 같은 트랜잭션이라 **주문은 남지 않습니다**.', '키의 위치를 잘못 읽었습니다. 키는 pay가 만들어 재시도에 넘기는 값이고, **같은 키의 승인은 charge가 기억**합니다.']),
] }).questions;
// /hey whatelse goes deeper into this change and returns fewer than five, with a reason, rather than padding.
const deeperBatch = QuestionBatchSchema.parse({ questions: [
  question('이번 변경은 같은 멱등 키로 재시도해 중복 승인을 막습니다. charge가 키별 승인을 24시간만 기억한다고 가정할 때, 이 보장이 끝나는 경우는 무엇인가요?', 2, 'advanced',
    ['24시간이 지난 뒤 같은 키로 도착한 재시도는 새 승인을 만들 수 있습니다.', '키를 재사용하므로 언제 재시도해도 승인은 한 번만 생깁니다.', '24시간이 지나면 charge가 같은 키를 거절하므로 재시도는 항상 실패합니다.', '보관 기간은 주문 저장에만 영향을 주고 승인 중복과는 관계없습니다.'], 'A',
    '같은 키가 중복을 막는 것은 **charge가 그 키를 기억하는 동안**뿐입니다. 이 가정에서는 24시간 뒤의 재시도가 새 요청으로 처리되어 승인이 하나 더 생기므로, 재시도 기간을 보관 기간 안으로 제한하거나 그 뒤에는 상태 조회로 바꿔야 합니다.',
    ['보관 기간이 끝나면 charge는 키를 새 요청으로 보고 승인을 새로 만듭니다.', '키 재사용을 무기한 보장으로 읽었습니다. 보장은 **보관 기간 안에서만** 성립합니다.', '보관 기간 뒤의 동작을 거절로 읽었습니다. 가정에서 charge는 키를 잊으므로 **거절이 아니라 새 승인**을 만듭니다.', '영향 범위를 잘못 읽었습니다. 보관 기간은 **승인 중복 여부를 직접 결정**합니다.']),
  question('pay 말고 다른 호출부도 charge를 부르게 되었습니다. 이 호출부가 재시도할 때마다 새 키를 만든다면 이번 변경의 보장은 어떻게 되나요?', 2, 'advanced',
    ['pay가 키를 재사용하므로 다른 호출부의 재시도도 중복 승인이 막힙니다.', '그 호출부의 재시도는 charge에 새 요청으로 보여 승인이 중복될 수 있습니다.', 'charge가 같은 금액의 요청을 하나로 합치므로 키와 관계없이 중복이 막힙니다.', '새 키를 만들면 charge가 요청을 거절하므로 승인이 아예 생기지 않습니다.'], 'B',
    '이번 변경의 보장은 **pay의 재시도 경로**에만 있습니다. charge는 키로만 같은 요청을 알아보므로, 키를 새로 만드는 호출부가 생기면 그 경로에서는 중복 승인이 다시 가능해집니다. 리뷰에서는 charge를 부르는 모든 재시도 경로가 같은 키를 넘기는지 확인해야 합니다.',
    ['보장의 범위를 넓게 읽었습니다. 키 재사용은 **pay 안에서만** 일어납니다.', 'charge는 키로만 중복을 판단하므로 새 키는 새 요청입니다.', 'charge의 동작을 지어냈습니다. charge는 **금액이 아니라 키로** 같은 요청을 알아봅니다.', '새 키의 효과를 거절로 읽었습니다. charge는 새 키를 **새 요청으로 받아 승인**합니다.']),
  question('타임아웃 뒤 재시도해도 승인이 한 번만 생긴다는 이번 변경의 보장을 테스트로 확인하려면 어떤 상황과 관찰이 필요한가요?', 2, 'advanced',
    ['첫 charge 호출이 승인을 만든 뒤 응답만 타임아웃되게 하고, 재시도가 같은 키를 넘겨 승인이 하나만 남는지 확인합니다.', 'charge가 첫 호출에서 오류를 돌려주게 하고, 재시도 뒤 승인이 하나인지 확인합니다.', '타임아웃 뒤 재시도가 새 키를 만드는지 확인해 키가 바뀌는 것을 검증합니다.', '재시도 뒤 주문이 하나 저장되는지만 확인합니다.'], 'A',
    '이 변경이 막는 위험은 **승인은 생겼는데 응답만 잃은** 경우의 중복 승인입니다. 그래서 첫 호출이 승인을 만든 뒤 타임아웃되게 하고, 재시도가 같은 키를 넘겨 외부 승인이 하나로 남는지 관찰해야 보장이 드러납니다.',
    ['승인 후 응답 유실을 만들고 같은 키와 최종 승인 수를 함께 관찰합니다.', '첫 호출이 승인 전에 실패하면 **중복이 생길 여지가 없어** 보장을 검증하지 못합니다.', '변경 전 동작을 기대했습니다. 이제 재시도는 **같은 키를 넘겨야** 합니다.', '관찰 대상을 잘못 골랐습니다. 주문 수는 하나여도 **승인은 둘일 수 있습니다**.']),
], unavailableReason: '나머지 후보는 키 보관 기간 계산이나 일반 재시도 정책처럼 이 변경 맥락 없이도 성립하는 질문이라 제외했습니다.' });
const deeper = deeperBatch.questions;
// Interview questions follow the csinterview bar: a definition alone cannot pick the answer, and wrong-option notes name the confused concept.
const interviewBatch = CsInterviewBatchSchema.parse({ questions: [
  checked(question('결제 함수가 외부 승인 API를 호출합니다. 승인 API는 같은 멱등 키(idempotency key)로 다시 들어온 요청에는 새 승인 없이 처음 결과를 돌려줍니다. 결제 함수는 재시도 루프에서 HTTP 요청을 보낼 때마다 새 UUID를 멱등 키로 만들어 붙입니다. 첫 요청이 승인된 뒤 응답 전에 타임아웃되었다면, 재시도 결과로 옳은 것은 무엇인가요?', 2, 'advanced',
    ['멱등 키를 붙였으므로 재시도해도 승인은 한 번만 일어납니다.', '타임아웃은 첫 요청이 실패했다는 뜻이므로 재시도가 첫 승인이 됩니다.', '재시도는 다른 키를 가지므로 서버가 새 요청으로 보고 승인이 두 번 일어날 수 있습니다.', '서버가 같은 금액과 카드 정보로 중복을 알아채므로 승인은 한 번만 일어납니다.'], 'C',
    '멱등성(idempotency)은 같은 연산을 여러 번 적용해도 결과가 한 번 적용한 것과 같은 성질이며, 멱등 키는 서버가 같은 논리적 연산을 알아보게 하는 식별자입니다. 서버는 키로만 중복을 판단하므로 재시도마다 새 키를 만들면 서로 다른 연산으로 보입니다. 타임아웃은 응답을 받지 못했다는 관찰일 뿐 처리 실패가 아니므로, 첫 승인이 이미 일어났다면 재시도가 두 번째 승인이 됩니다. 키를 결제 시도마다 한 번 만들어 저장하고 모든 재시도에 재사용하면 결론이 바뀝니다. 이 예시의 pay가 첫 요청의 키를 재시도에 그대로 전달하는 지점이 이 보장에 기댑니다.',
    ['멱등성의 정의만 적용하고 멱등 키의 범위를 놓쳤습니다. 서버는 **키가 같은 요청만 같은 연산으로 판단**하므로 요청마다 새 키를 붙이면 멱등성이 성립하지 않습니다.', '타임아웃과 실패를 혼동했습니다. 타임아웃은 **응답을 받지 못했다는 관찰**일 뿐이며, 서버는 처리를 끝냈을 수 있습니다.', '재시도마다 키가 달라 서버가 같은 결제임을 알 수 없고, 첫 승인이 이미 처리되었을 수 있으므로 승인이 두 번 일어날 수 있습니다.', '내용 기반 중복 제거를 가정했습니다. 이 서버는 **멱등 키로만 중복을 판단**하며, 같은 금액의 정당한 결제도 반복될 수 있습니다.'])),
  checked(question('결제 함수가 하나의 DB 트랜잭션 안에서 외부 승인 API를 호출한 뒤 주문 행을 삽입하고 커밋합니다. 삽입 후 커밋 직전에 DB 연결이 끊겨 트랜잭션이 롤백되었다고 가정합니다. 이때 시스템 상태로 옳은 것은 무엇인가요?', 2, 'basic',
    ['트랜잭션이 롤백되었으므로 외부 승인도 함께 취소됩니다.', '주문 행은 남지 않지만 외부 승인은 유지되어, 승인은 있고 주문은 없는 상태가 됩니다.', '주문 행은 삽입 시점에 디스크에 기록되었으므로 재시작 후 복구됩니다.', '외부 호출을 트랜잭션 안에 두었으므로 DB가 2단계 커밋으로 승인과 주문을 함께 커밋하거나 함께 취소합니다.'], 'B',
    '원자성(atomicity)은 한 트랜잭션 안의 DB 변경이 전부 반영되거나 전혀 반영되지 않는 성질입니다. DB는 자신이 관리하는 데이터의 변경만 기록하고 되돌리므로, 트랜잭션 안에서 호출한 외부 API의 부작용은 롤백 범위 밖에 있습니다. 따라서 커밋 직전에 롤백되면 주문 행은 사라지지만 외부 승인은 남아 승인과 주문이 어긋납니다. 외부 서비스가 같은 커밋 조정에 참여하거나 취소 같은 보상 동작을 따로 설계하면 결론이 바뀝니다. 이 예시에서 승인 뒤 주문 저장이 실패할 수 있는 지점이 이 경계에 기댑니다.',
    ['원자성의 범위를 과대평가했습니다. 롤백은 **DB가 기록한 변경만 되돌리며**, 외부 API가 이미 만든 부작용은 취소하지 않습니다.', 'DB 변경은 롤백되고 외부 승인은 롤백 범위 밖에 남으므로 승인과 주문이 어긋난 상태가 됩니다.', '내구성(durability)을 잘못 적용했습니다. 내구성은 **커밋된 변경만** 장애 뒤에도 보존하며, 커밋되지 않은 변경은 복구 대상이 아닙니다.', '분산 트랜잭션이 저절로 일어난다고 가정했습니다. 2단계 커밋(two-phase commit)은 **모든 참여자가 같은 프로토콜을 지원할 때만** 가능하며, 일반 HTTP 호출은 참여하지 않습니다.'])),
], unavailableReason: null });
const interview = interviewBatch.questions;
// /hey morecs continues 면접1·면접2: three follow-ups one layer below them, plus one uncovered core concept.
const followUp = (anchor, ...args) => checked({ ...question(...args), kind: anchor ? 'followup' : 'interview', anchor });
const moreBatch = MoreCsBatchSchema.parse({ questions: [
  followUp('면접1', '서버가 멱등 키별 첫 결과를 저장해 두고 같은 키 요청에 그 결과를 돌려준다고 가정합니다. 같은 키를 가진 두 요청이 동시에 도착하고, 서버는 각 요청을 \'키 조회 → 없으면 승인 → 결과 기록\' 순서로 처리합니다. 중복 승인을 막으려면 무엇이 필요한가요?', 2, 'advanced',
    ['조회를 한 번 더 반복해 키가 없는지 다시 확인한 뒤 승인합니다.', '키 기록을 유일 제약이나 원자적 삽입으로 먼저 확보해, 키를 차지한 요청 하나만 승인을 진행하게 합니다.', '두 요청 사이에 짧은 대기 시간을 두어 처리 순서가 겹치지 않게 합니다.', '트랜잭션 격리 수준을 커밋된 읽기(read committed)로 두면 두 요청이 서로의 미완료 기록을 보지 않으므로 충분합니다.'], 'B',
    '경쟁 조건(race condition)은 결과가 실행 순서의 우연에 따라 달라지는 상황이며, 확인 후 실행(check-then-act)은 확인과 실행 사이에 다른 요청이 끼어들 수 있어 대표적인 원인이 됩니다. 두 요청이 모두 \'키 없음\'을 확인한 뒤 각자 승인하면 멱등 키가 있어도 승인이 두 번 일어납니다. 키를 유일 제약이나 원자적 삽입으로 먼저 차지하게 하면 확인과 기록이 하나의 원자적 연산이 되어 한 요청만 진행합니다. 요청이 하나씩만 들어온다는 보장이 있으면 결론이 달라집니다. 이 예시에서 같은 키의 재시도가 겹쳐 도착할 수 있는 지점이 이 보장에 기댑니다.',
    ['확인을 반복해도 **확인과 기록 사이의 틈**은 그대로 남습니다.', '키 확보를 원자적으로 만들면 같은 키의 요청 중 하나만 승인으로 진행합니다.', '타이밍으로 해결하려 했습니다. 대기 시간은 **겹침의 확률을 줄일 뿐 배제하지 않습니다**.', '격리 수준과 원자성을 혼동했습니다. 커밋된 읽기는 **미완료 기록을 숨길 뿐**, 두 요청이 모두 키 없음을 보고 진행하는 것을 막지 않습니다.']),
  followUp('면접2', '승인 후 주문 저장이 실패하면 보상 동작(compensating action)으로 승인 취소를 요청합니다. 취소 요청도 타임아웃될 수 있다고 가정할 때, 보상 동작이 갖춰야 할 성질로 옳은 것은 무엇인가요?', 3, 'advanced',
    ['취소 요청은 한 번만 보내고, 타임아웃되면 취소된 것으로 간주합니다.', '같은 승인 ID에 대한 취소를 멱등하게 재시도할 수 있게 하고, 보상 진행 상태를 기록해 실패 시 이어서 처리합니다.', '주문 저장을 롤백했으므로 외부 승인도 이미 취소된 것으로 간주합니다.', '취소가 실패하면 새 승인을 만들어 이전 승인을 덮어씁니다.'], 'B',
    '보상 동작(compensating action)은 이미 일어난 외부 부작용을 되돌리는 별도의 연산이며, 그 자체도 실패와 재시도를 겪는 원격 호출입니다. 취소가 타임아웃되면 성공 여부를 알 수 없으므로, 같은 승인에 대해 여러 번 보내도 결과가 같도록 멱등해야 안전하게 재시도할 수 있습니다. 보상 진행 상태를 기록해 두면 프로세스가 중단되어도 남은 보상을 이어서 처리할 수 있습니다. 외부 서비스가 같은 커밋 조정에 참여한다면 보상이 필요 없어집니다. 이 예시에서 승인 뒤 주문 저장이 실패하는 경로가 이 설계에 기댑니다.',
    ['타임아웃과 실패·성공을 혼동했습니다. 타임아웃은 **결과를 모른다는 뜻**이므로 취소 여부를 확인하거나 재시도해야 합니다.', '취소의 멱등성과 진행 기록이 있어야 타임아웃 뒤에도 안전하게 보상을 마칠 수 있습니다.', '원자성의 범위를 과대평가했습니다. 로컬 롤백은 **DB 변경만 되돌립니다**.', '보상과 재실행을 혼동했습니다. 새 승인은 **기존 승인을 취소하지 않고 부작용을 하나 더 만듭니다**.']),
  followUp('면접2', '외부 승인 호출을 트랜잭션 밖으로 빼고, 같은 트랜잭션에서 주문 행과 \'승인 요청 예정\' 행을 함께 기록한 뒤 별도 작업자가 그 행을 읽어 승인 API를 호출한다고 가정합니다(아웃박스 패턴, outbox pattern). 이 설계가 얻는 것과 치르는 대가로 옳은 것은 무엇인가요?', 3, 'advanced',
    ['DB 변경과 외부 호출이 함께 커밋되므로 승인 API는 정확히 한 번 호출됩니다.', '외부 승인이 DB 트랜잭션에 참여하므로 주문이 롤백되면 승인도 함께 취소됩니다.', '주문과 전송 의도가 원자적으로 기록되지만, 작업자가 전송 후 기록 전에 멈추면 다시 보내므로 수신 측의 중복 제거가 필요합니다.', '별도 작업자가 전송하므로 승인 결과가 주문 저장보다 늦게 반영되는 일이 없어집니다.'], 'C',
    '아웃박스 패턴(outbox pattern)은 DB 변경과 \'보낼 메시지\'를 같은 로컬 트랜잭션에 기록해, 두 쓰기의 원자성을 DB 안에서 확보하는 방법입니다. 실제 전송은 별도 작업자가 하므로 전송 직후 완료 표시 전에 작업자가 멈추면 같은 메시지를 다시 보내게 되고, 전달은 최소 한 번(at-least-once)이 됩니다. 따라서 수신 측이 멱등 키 등으로 중복을 걸러야 합니다. 전송과 완료 표시를 원자적으로 할 수 있는 수신자라면 결론이 달라집니다. 이 예시에서 승인과 주문 저장 사이의 불일치를 줄이려는 지점이 이 트레이드오프에 기댑니다.',
    ['전달 보장을 과대평가했습니다. 아웃박스는 **최소 한 번 전달**을 주며 정확히 한 번은 수신 측 중복 제거가 있어야 성립합니다.', '분산 트랜잭션과 혼동했습니다. 외부 API는 **로컬 트랜잭션에 참여하지 않습니다**.', '원자적 기록으로 전송 의도를 잃지 않지만, 재전송 가능성 때문에 수신 측 중복 제거가 필요합니다.', '비동기 처리의 비용을 놓쳤습니다. 별도 작업자는 **반영 지연을 늘립니다**.']),
  followUp(null, '결제 서버가 일시적으로 느려져 많은 클라이언트가 동시에 타임아웃을 받았습니다. 모든 클라이언트가 고정된 1초 간격으로 최대 5번 재시도한다고 가정할 때, 서버 회복에 미치는 영향과 대응으로 옳은 것은 무엇인가요?', 2, 'basic',
    ['재시도 횟수를 늘리면 결국 성공하는 요청이 많아지므로 회복이 빨라집니다.', '재시도는 클라이언트 쪽 동작이므로 서버 부하에는 영향을 주지 않습니다.', '같은 간격의 재시도가 같은 시점에 몰려 부하를 키우므로, 지수 백오프와 무작위 지연(jitter)으로 재시도를 흩어야 합니다.', '타임아웃 값을 줄이면 실패를 빨리 감지하므로 재시도 간격과 무관하게 부하가 줄어듭니다.'], 'C',
    '재시도 폭주(retry storm)는 실패한 요청의 재시도가 원래 부하에 더해져 과부하를 키우는 현상입니다. 모두 같은 간격으로 재시도하면 요청이 같은 순간에 몰려(동기화된 재시도) 느려진 서버가 회복할 틈이 없습니다. 지수 백오프(exponential backoff)는 재시도 간격을 늘려 총 부하를 줄이고, 무작위 지연(jitter)은 재시도 시점을 흩어 동시 몰림을 막습니다. 서버가 요청량을 제한하거나 재시도 가능 시점을 알려 준다면 그 신호를 따르는 것이 우선입니다. 이 예시에서 타임아웃 뒤 재시도하는 결제 경로가 이 판단에 기댑니다.',
    ['재시도 횟수와 회복을 혼동했습니다. 재시도는 **원래 부하에 더해지는 추가 요청**입니다.', '재시도의 비용을 놓쳤습니다. 모든 재시도는 **서버가 처리해야 할 새 요청**입니다.', '동기화된 재시도를 흩어야 느려진 서버가 회복할 여유가 생깁니다.', '타임아웃과 부하를 혼동했습니다. 짧은 타임아웃은 **재시도를 더 일찍, 더 자주 일으켜** 부하를 키울 수 있습니다.']),
], unavailableReason: null });
const more = moreBatch.questions, moreLabels = ['꼬리1', '꼬리2', '꼬리3', '면접3'];
const keyed = (q, picked) => ({ verdict: picked === q.key.answer ? 'correct' : 'incorrect', explanation: picked === q.key.answer ? '' : `선택한 ${picked}: ${q.key.options.find(o => o.id === picked).explanation}`,
  expectedAnswer: q.key.explanation, optionExplanations: q.key.options, evidence: [{ path: q.path, line: q.line, side: q.side, reason: '질문이 가리키는 변경 위치' }] });
const value = report({ schemaVersion: '2', questions: initial, findings: [], checks: [], recommendedTests: [], limitations: [] });
// A right option with a wrong reason: the grader writes only the feedback; the explanation and option notes come from the key.
const graded = GradeSchema.parse({ verdict: 'partial', explanation: 'B는 맞지만 이유가 다릅니다. 변경 후 pay는 **새 키를 만들지 않고 첫 요청의 키를 재시도에 넘기며**, 그래서 charge가 같은 요청으로 알아보고 처음 승인을 돌려줍니다.', expectedAnswer: null,
  optionExplanations: [], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '재시도에 첫 요청의 키를 넘기는 예시 흐름' }] });
const grade = { ...graded, expectedAnswer: initial[0].key.explanation, optionExplanations: initial[0].key.options };
const hey = { premise: '이 변경은 새 키를 만들지 않습니다. 재시도에도 첫 요청의 키를 그대로 넘깁니다.', answer: '그래서 charge 응답이 타임아웃된 뒤 재시도해도 charge가 같은 요청으로 알아보고 처음 승인을 돌려주어, 승인은 한 번만 생깁니다.',
  why: '타임아웃은 승인이 실패했다는 뜻이 아니라 결과를 모른다는 뜻입니다. 변경 전처럼 새 키로 재시도하면 이미 생긴 승인과 별개로 승인이 하나 더 생길 수 있었습니다.',
  evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '재시도에 첫 요청의 키를 넘기는 예시 흐름' }], unverified: 'charge가 같은 키의 승인을 얼마나 오래 기억하는지는 이 저장소 코드로 확인할 수 없습니다.' };
const disclaimer = '# 댓글 학습 흐름 예시\n\nFixture 예시이며 실제 모델 평가가 아닙니다. pay가 같은 키로 charge를 호출한 뒤 주문을 저장하고, charge가 같은 키의 승인을 재사용한다고 가정합니다.\n\n';
// Examples show public content; reconciliation markers belong only to live comments.
const visible = text => text.split('\n').filter(line => !/^<!-- codereviewbot:/.test(line)).join('\n');
await mkdir('.local', { recursive: true });
await writeFile('.local/demo-report.md', visible(renderReport(value, new Map([[questionId(value.snapshot, initial[0]), 'correct']]))) + '\n');
await writeFile('.local/demo-inline.md', visible(renderQuestionThread(initial[0], value.snapshot, 1)) + '\n');
await writeFile('.local/demo-help.md', visible(renderCommandHelp('issue-demo-help')) + '\n');
await writeFile('.local/demo-learning.md', disclaimer + visible(renderQuestionBatch(deeper, value.snapshot, 'issue-demo-more')) + `\n\n${deeper.length}문항만 출제했습니다. ${plain(deeperBatch.unavailableReason)}\n\n---\n\n\`/hey answer Q1 B 재시도마다 새 키를 만들어서 중복을 막습니다\`\n\n` + visible(renderGrade(initial[0], value.snapshot, grade, 'issue-demo-answer', 'Q1', 'B')) + '\n\n---\n\n' + visible(renderReveal([{ q: initial[0], label: 'Q1' }], value.snapshot, 'issue-demo-reveal-q1')) + '\n');
await writeFile('.local/demo-hey.md', disclaimer + '`@hey 재시도할 때마다 새 키를 만드는 이유가 뭔가요?`\n\n' + visible(renderAnswer(hey, value.snapshot, 'issue-demo-hey')) + '\n');
await writeFile('.local/demo-csinterview.md', disclaimer + visible(renderQuestionBatch(interview, value.snapshot, 'issue-demo-interview', 1, '면접')) + '\n\n---\n\n' + visible(renderReveal(interview.map((q, i) => ({ q, label: `면접${i + 1}` })), value.snapshot, 'issue-demo-reveal')) + '\n');
await writeFile('.local/demo-morecs.md', disclaimer + '`/hey morecs`가 면접1·면접2를 앵커로 이어서 낸 묶음입니다.\n\n' + visible(renderQuestionBatch(more, value.snapshot, 'issue-demo-morecs', 1, '면접', moreLabels)) + '\n\n---\n\n`/hey answer 꼬리2 B 면접3 A`\n\n' + visible(renderGrades([{ q: more[1], grade: keyed(more[1], 'B'), label: '꼬리2', picked: 'B' }, { q: more[3], grade: keyed(more[3], 'A'), label: '면접3', picked: 'A' }], value.snapshot, 'issue-demo-morecs-answer')) + '\n\n---\n\n' + visible(renderReveal(more.map((q, i) => ({ q, label: moreLabels[i] })), value.snapshot, 'issue-demo-morecs-reveal')) + '\n');
console.log('Created .local/demo-report.md, .local/demo-inline.md, .local/demo-learning.md, .local/demo-hey.md, .local/demo-csinterview.md, .local/demo-morecs.md and .local/demo-help.md (fixtures, no model calls).');
