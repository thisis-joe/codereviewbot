export const snapshot = (o = {}) => ({ commits: [{ sha: o.headSha ?? 'b'.repeat(40), title: '결제 재시도 처리 개선' }], platform: 'github', instance: 'https://api.github.com', repository: 'joe/demo', number: 1, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), startSha: 'a'.repeat(40), policyVersion: 'default', title: '결제', description: '결제 변경', webUrl: 'https://github.com/joe/demo/pull/1', ...o });
export const finding = (o = {}) => ({ id: 'C-1', existingId: null, severity: 'P1', category: '정확성', path: 'src/pay.ts', line: 4, side: 'RIGHT', symbol: 'pay', title: '중복 결제 가능', problem: '동일 요청이 반복 처리됩니다.', condition: '승인 후 저장 실패와 재시도', impact: '중복 청구', evidence: [{ path: 'src/pay.ts', line: 4, side: 'RIGHT', reason: '식별자 재사용 없음' }], fix: '멱등 키 사용', test: '재요청 시 승인 한 번', suggestion: null, status: 'new', ...o });
export const choices = (...texts) => ['A', 'B', 'C', 'D'].map((id, i) => ({ id, text: texts[i] ?? `보기 ${id}` }));
export const answerKey = (answer = 'B') => ({ answer, explanation: `정답은 ${answer}입니다.`, options: ['A', 'B', 'C', 'D'].map(id => ({ id, explanation: `${id} 보기 해설` })) });
export const changeQuestions = () => [
  { question: '이번 pay 재시도 변경에서 중복 승인을 막으려면 어떤 조건을 유지해야 하나요?', path: 'src/pay.ts', line: 2, side: 'RIGHT', level: 'basic', options: choices(), key: answerKey() },
  { question: 'charge 호출이 성공하고 주문 저장이 실패하면 재시도 결과는 어떻게 달라지나요?', path: 'src/pay.ts', line: 2, side: 'RIGHT', level: 'basic', options: choices(), key: answerKey() },
  { question: '이 결제 흐름에서 멱등 키와 트랜잭션은 각각 어떤 실패를 다루나요?', path: 'src/pay.ts', line: 2, side: 'RIGHT', level: 'advanced', options: choices(), key: answerKey() },
];
// Initial generation focuses on two distinct CS principles: idempotency and transaction boundaries.
export const initialQuestions = () => [changeQuestions()[0], changeQuestions()[2]].map(q => ({ ...q, level: 'basic' }));
export const verification = (o = {}) => ({ decisions: [], resolutions: [], questions: changeQuestions(), ...o });
export const analysis = (o = {}) => {
  const value = { summary: '결제 재시도 처리 변경', findings: [], checks: [], recommendedTests: ['재시도 검사'], limitations: [], resolutions: [], questions: changeQuestions(), ...o };
  value.findings = value.findings.map(({ status, fingerprint, ...candidate }) => candidate);
  return value;
};
export const report = (o = {}) => ({ schemaVersion: '2', snapshot: snapshot(), state: 'completed', mode: 'full', summary: '결제 처리 변경', findings: [], checks: [], recommendedTests: [], limitations: [], questions: changeQuestions(), reviewedFiles: ['src/pay.ts'], excludedFiles: [], ...o });
// Interview outputs carry the model's giveaway check; a definition-only pick different from the key and a quote from the stem pass.
export const checked = q => ({ ...q, check: { definitionOnlyPick: (q.key?.answer ?? 'B') === 'A' ? 'B' : 'A', definitionOnlyReason: '정의만 떠올리면 이 보기가 그럴듯해 보입니다.', stemQuote: q.question, giveaway: false } });
