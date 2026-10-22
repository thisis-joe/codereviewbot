import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, renderProgress } from '../dist/render.js';
import { report, snapshot, finding } from './fixtures.mjs';

test('question comments contain questions and progress without review sections, verdicts or command tables', () => {
  for (const state of ['completed', 'partial', 'failed']) {
    const text = renderReport(report({ schemaVersion: '2', state, findings: [finding({ id: 'CRB-0001' })], checks: [{ name: 'CI: fail', status: 'failed', detail: '', url: null }], summary: 'old summary' }));
    assert.match(text, /^#### hey! 이건 알고 머지하는거지\? 😏$/m);
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

test('help balances columns using unbroken command names and short description lines supported by GitLab', async () => {
  const { renderCommandHelp } = await import('../dist/render.js');
  const body = renderCommandHelp('help-columns');
  assert.match(body, /<code>\/hey&nbsp;morequestion<\/code>/);
  assert.match(body, /질문&nbsp;재생성/);
  assert.match(body, /<br>/);
  assert.doesNotMatch(body, /style=|width=/);
  const rows = body.split('\n').filter(line => line.startsWith('| <code>'));
  assert.equal(rows.length, 6);
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1);
    assert.equal(cells.length, 4);
    assert.ok(cells[2].split('<br>').every(line => line.trim().length <= 64));
  }
});
