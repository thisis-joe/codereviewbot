import test from 'node:test';
import assert from 'node:assert/strict';
import { AnalysisSchema, analysisJsonSchema } from '../dist/contracts.js';
import { renderReport, renderFinding, renderAnswer } from '../dist/render.js';
import { analysis, snapshot, finding, report } from './fixtures.mjs';

test('model cannot introduce renderer fields or invalid code locations', () => {
  assert.equal(AnalysisSchema.safeParse(analysis({ findings: [finding()] })).success, true);
  assert.equal(AnalysisSchema.safeParse({ ...analysis(), verdict: 'safe' }).success, false);
  assert.equal(AnalysisSchema.safeParse(analysis({ findings: [{ ...finding(), line: 0 }] })).success, false);
  assert.equal(analysisJsonSchema.additionalProperties, false);
});

test('all lifecycle outcomes retain six ordered report sections', () => {
  for (const state of ['running', 'completed', 'partial', 'failed', 'paused']) {
    const text = renderReport(report({ state }));
    assert.deepEqual([...text.matchAll(/^### (\d)\. (.+)$/gm)].map(m => m[2]),
      ['변경 요약', '발견 사항', '변경 내역', '검증 및 테스트', '이전 리뷰 대비', '검토 범위와 한계']);
    if (state !== 'completed') assert.match(text, /판단 보류/);
  }
});

test('rendering is deterministic, escapes structural injection and never notifies arbitrary handles', () => {
  const value = report({ summary: '# injected\n|bad|\n<script>@joe</script>' });
  const text = renderReport(value);
  assert.equal(text, renderReport(value));
  assert.doesNotMatch(text, /^# injected|<script>|@joe/m);
  assert.match(text, /미실행/);
  assert.match(text, /<!-- codereviewbot:summary:v1 -->/);
});

test('confirmed high priority findings require changes but incomplete analysis cannot clear the review', () => {
  assert.match(renderReport(report({ findings: [finding({ id: 'CRB-0001', severity: 'P1' })] })), /수정 필요/);
  assert.match(renderReport(report()), /현재 검토 범위에서 지적 없음/);
  assert.match(renderReport(report({ state: 'partial' })), /판단 보류/);
});

test('inline and answer templates preserve required labels and use safe suggestion blocks', () => {
  const text = renderFinding(finding({ id: 'CRB-0001', suggestion: { startLine: 4, endLine: 4, replacement: 'return `x`;\n```' } }), snapshot());
  for (const label of ['문제', '발생 조건', '영향', '근거', '수정 방향', '추천 검증', '코드 제안']) assert.match(text, new RegExp(`\\*\\*${label}\\*\\*`));
  assert.match(text, /````suggestion/);
  const answer = renderAnswer({ answer: '설명', evidence: ['src/pay.ts:4'], next: '검증 필요' }, 'reply-1');
  assert.match(answer, /### 답변[\s\S]*### 코드 근거[\s\S]*### 후속 조치·한계/);
});
