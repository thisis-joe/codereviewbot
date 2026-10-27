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

test('code answers omit empty sections and keep one help entry point', async () => {
  const { renderAnswer } = await import('../dist/render.js');
  const bare = renderAnswer({ premise: null, answer: '같은 키로 중복 요청을 구분합니다.', why: null, evidence: [], unverified: null }, snapshot(), 'request-1');
  assert.doesNotMatch(bare, /#{1,6} |전제와 다른 점|코드 근거|없음/);
  assert.equal(bare.match(/명령어 안내/g).length, 1);
  const full = renderAnswer({ premise: '새 키를 만들지 않습니다.', answer: '같은 키를 재사용합니다.', why: '재시도를 같은 요청으로 식별합니다.', evidence: [{ path: 'src/pay.ts', line: 2, side: 'LEFT', reason: '변경 전 키 생성' }], unverified: '외부 보관 기간은 확인하지 못했습니다.' }, snapshot(), 'request-2');
  assert.ok(full.indexOf('전제와 다른 점') < full.indexOf('같은 키를 재사용합니다') && full.indexOf('같은 키를 재사용합니다') < full.indexOf('##### 이유'));
  assert.match(full, /- \[src\/pay\\\.ts:2\]\(https:\/\/github\.com\/joe\/demo\/blob\/a{40}\/src\/pay\.ts#L2\): 변경 전 키 생성/);
  assert.ok(full.indexOf('##### 코드 근거') < full.indexOf('##### 확인하지 못한 것'));
});

test('help balances columns using unbroken command names and short description lines supported by GitLab', async () => {
  const { renderCommandHelp } = await import('../dist/render.js');
  const body = renderCommandHelp('help-columns');
  assert.match(body, /<code>\/hey&nbsp;whatelse<\/code>/);
  assert.match(body, /질문&nbsp;재생성/);
  assert.match(body, /<br>/);
  assert.doesNotMatch(body, /style=|width=/);
  const rows = body.split('\n').filter(line => line.startsWith('| <code>'));
  assert.equal(rows.length, 8);
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1);
    assert.equal(cells.length, 4);
    assert.ok(cells[2].split('<br>').every(line => line.trim().length <= 64));
  }
});
