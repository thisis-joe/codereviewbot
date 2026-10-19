export const snapshot = (o = {}) => ({ platform: 'github', instance: 'https://api.github.com', repository: 'joe/demo', number: 1, baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), startSha: 'a'.repeat(40), previousSha: null, policyVersion: 'default', title: '결제', description: '결제 변경', webUrl: 'https://github.com/joe/demo/pull/1', ...o });
export const finding = (o = {}) => ({ id: 'C-1', existingId: null, severity: 'P1', category: '정확성', path: 'src/pay.ts', line: 4, side: 'RIGHT', symbol: 'pay', title: '중복 결제 가능', problem: '동일 요청이 반복 처리됩니다.', condition: '승인 후 저장 실패와 재시도', impact: '중복 청구', evidence: [{ path: 'src/pay.ts', line: 4, side: 'RIGHT', reason: '식별자 재사용 없음' }], fix: '멱등 키 사용', test: '재요청 시 승인 한 번', ruleId: null, suggestion: null, status: 'new', ...o });
export const analysis = (o = {}) => {
  const value = { summary: '결제 재시도 처리 변경', changes: [{ name: '결제', files: ['src/pay.ts'], description: '재시도 처리', impact: '결제 승인' }], findings: [], checks: [], recommendedTests: ['재시도 검사'], limitations: [], flow: null, resolutions: [], ...o };
  value.findings = value.findings.map(({ status, fingerprint, ...candidate }) => candidate);
  return value;
};
export const report = (o = {}) => ({ schemaVersion: '1', snapshot: snapshot(), state: 'completed', mode: 'full', summary: '결제 처리 변경', changes: [], findings: [], checks: [], recommendedTests: [], limitations: [], flow: null, reviewedFiles: ['src/pay.ts'], excludedFiles: [], rules: [], delta: { added: [], retained: [], fixed: [], dismissed: [], unverified: [] }, ...o });
