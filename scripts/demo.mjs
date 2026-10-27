import { mkdir, writeFile } from 'node:fs/promises';
import { InitialQuestionsSchema, QuestionBatchSchema, CsInterviewBatchSchema, MoreCsBatchSchema, GradeSchema } from '../dist/contracts.js';
import { renderReport, renderQuestionThread, renderQuestionBatch, renderGrade, renderGrades, renderReveal, renderCommandHelp } from '../dist/render.js';
import { questionId } from '../dist/learning.js';
import { report, choices, checked } from '../test/fixtures.mjs';

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
await writeFile('.local/demo-morecs.md', disclaimer + '`/hey morecs`가 면접1·면접2를 앵커로 이어서 낸 묶음입니다.\n\n' + visible(renderQuestionBatch(more, value.snapshot, 'issue-demo-morecs', 1, '면접', moreLabels)) + '\n\n---\n\n`/hey answer 꼬리2 B 면접3 A`\n\n' + visible(renderGrades([{ q: more[1], grade: keyed(more[1], 'B'), label: '꼬리2', picked: 'B' }, { q: more[3], grade: keyed(more[3], 'A'), label: '면접3', picked: 'A' }], value.snapshot, 'issue-demo-morecs-answer')) + '\n\n---\n\n' + visible(renderReveal(more.map((q, i) => ({ q, label: moreLabels[i] })), value.snapshot, 'issue-demo-morecs-reveal')) + '\n');
console.log('Created .local/demo-report.md, .local/demo-inline.md, .local/demo-learning.md, .local/demo-csinterview.md, .local/demo-morecs.md and .local/demo-help.md (fixtures, no model calls).');
