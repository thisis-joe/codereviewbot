import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, renderProgress } from '../dist/render.js';
import { report, snapshot, finding } from './fixtures.mjs';

test('question comments contain questions and progress without review sections, verdicts or command tables', () => {
  for (const state of ['completed', 'partial', 'failed']) {
    const text = renderReport(report({ schemaVersion: '2', state, findings: [finding({ id: 'CRB-0001' })], checks: [{ name: 'CI: fail', status: 'failed', detail: '', url: null }], summary: 'old summary' }));
    assert.match(text, /### CodeReviewBot 변경 이해 질문/);
    assert.doesNotMatch(text, /### [1-4]\.|수정 필요|지적 없음|판단 보류|CRB-0001|old summary|CI: fail|\| 명령어/);
    assert.match(text, /명령어 안내: `\/reviewbot help`/);
    if (state === 'failed') assert.doesNotMatch(text, /\*\*Q1\./);
    else assert.match(text, /답변 0\/3/);
  }
});

test('generation progress never republishes historical review content', () => {
  const text = renderProgress(snapshot(), 'full', { minutes: 2, measured: false }, { report: report({ findings: [finding({ id: 'CRB-0001' })] }), results: new Map() });
  assert.match(text, /질문 생성 중/); assert.doesNotMatch(text, /CRB-0001|리뷰 중|이전 리뷰 결과/);
});
