import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, renderProgress } from '../dist/render.js';
import { report, snapshot, finding } from './fixtures.mjs';

test('question comments contain questions and progress without review sections, verdicts or command tables', () => {
  for (const state of ['completed', 'partial', 'failed']) {
    const text = renderReport(report({ schemaVersion: '2', state, findings: [finding({ id: 'CRB-0001' })], checks: [{ name: 'CI: fail', status: 'failed', detail: '', url: null }], summary: 'old summary' }));
    assert.match(text, /^#### hey! 이건 알고 머지한거지\? 😏$/m);
    assert.doesNotMatch(text, /### [1-4]\.|수정 필요|지적 없음|판단 보류|CRB-0001|old summary|CI: fail|\| 명령어/);
    assert.match(text, /명령어 안내: `\/hey help`/);
    if (state === 'failed') assert.doesNotMatch(text, /#### Q1\./);
    else assert.match(text, /답변 0\/3/);
  }
});

test('generation progress never republishes historical review content', () => {
  const text = renderProgress(snapshot(), { minutes: 2, measured: false }, { report: report({ findings: [finding({ id: 'CRB-0001' })] }), results: new Map() });
  assert.match(text, /질문 생성 중/); assert.doesNotMatch(text, /CRB-0001|리뷰 중|이전 리뷰 결과/);
});

test('command confirmations and code answers omit empty evidence and follow-up sections', async () => {
  const { renderAnswer } = await import('../dist/render.js');
  const confirmation = renderAnswer({ answer: '질문 재생성을 요청했습니다.', evidence: [], next: '명령어 안내: `/hey help`' }, 'request-1');
  assert.match(confirmation, /질문 재생성을 요청했습니다/);
  assert.doesNotMatch(confirmation, /#{1,6} |코드 근거|후속 조치|없음/);
  assert.equal(confirmation.match(/명령어 안내/g).length, 1);
  const answer = renderAnswer({ answer: '같은 키로 중복 요청을 구분합니다.', evidence: ['src/pay.ts:2 — 멱등 키'], next: '타임아웃 후 상태 조회를 확인하세요.' }, 'request-2');
  assert.match(answer, /#### 코드 근거\n/);
  assert.match(answer, /#### 참고\n/);
  assert.match(answer, /src\/pay/);
  assert.doesNotMatch(answer, /^### /m);
  for (const next of ['', '없음', '해당 없음.']) {
    const body = renderAnswer({ answer: '설명입니다.', evidence: [], next }, 'request-3');
    assert.doesNotMatch(body, /코드 근거|참고|없음/);
  }
});

test('help balances columns using unbroken command names and short description lines supported by GitLab', async () => {
  const { renderCommandHelp } = await import('../dist/render.js');
  const body = renderCommandHelp('help-columns');
  assert.match(body, /<code>\/hey&nbsp;whatelse<\/code>/);
  assert.match(body, /질문&nbsp;재생성/);
  assert.match(body, /<br>/);
  assert.doesNotMatch(body, /style=|width=/);
  const rows = body.split('\n').filter(line => line.startsWith('| <code>'));
  assert.equal(rows.length, 7);
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1);
    assert.equal(cells.length, 4);
    assert.ok(cells[2].split('<br>').every(line => line.trim().length <= 64));
  }
});
