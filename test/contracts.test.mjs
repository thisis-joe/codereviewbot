import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { AnalysisSchema } from '../dist/contracts.js';
import { renderReport, renderFinding, renderAnswer } from '../dist/render.js';
import { analysis, snapshot, finding, report } from './fixtures.mjs';

test('model cannot introduce renderer fields or invalid code locations', () => {
  assert.equal(AnalysisSchema.safeParse(analysis({ findings: [finding()] })).success, true);
  assert.equal(AnalysisSchema.safeParse({ ...analysis(), verdict: 'safe' }).success, false);
  assert.equal(AnalysisSchema.safeParse(analysis({ findings: [{ ...finding(), line: 0 }] })).success, false);
  assert.equal(z.toJSONSchema(AnalysisSchema, { unrepresentable: 'any' }).additionalProperties, false);
});

test('all lifecycle outcomes retain four concise report sections', () => {
  for (const state of ['completed', 'partial', 'failed']) {
    const text = renderReport(report({ state }));
    assert.deepEqual([...text.matchAll(/^### (\d)\. (.+)$/gm)].map(m => m[2]),
      ['변경 요약', '발견 사항', '검증·주의사항', '변경 이해 질문']);
    if (state !== 'completed') assert.match(text, /판단 보류/);
  }
});

test('rendering is deterministic, escapes structural injection and never notifies arbitrary handles', () => {
  const value = report({ summary: '# injected\n|bad|\n<script>@joe</script>', questions: analysis().questions.map((q, i) => i ? q : { ...q, question: '# injected\n<script>@joe</script>' }) });
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
  assert.doesNotMatch(renderFinding(finding({ id: 'CRB-0001', suggestion: null }), snapshot()), /코드 제안 없음|\*\*코드 제안\*\*/);
  const answer = renderAnswer({ answer: '설명', evidence: ['src/pay.ts:4'], next: '검증 필요' }, 'reply-1');
  assert.match(answer, /### 답변[\s\S]*### 코드 근거[\s\S]*### 후속 조치·한계/);
});

test('question schema requires 3–10 code-linked questions and rejects malformed anchors', () => {
  const questions = Array.from({ length: 10 }, (_, i) => ({ question: `이번 pay 변경의 재시도 조건 ${i}은 무엇인가요?`, path: 'src/pay.ts', line: 2, side: 'RIGHT' }));
  for (const count of [3, 10]) assert.equal(AnalysisSchema.safeParse(analysis({ questions: questions.slice(0, count) })).success, true);
  for (const count of [0, 2, 11]) assert.equal(AnalysisSchema.safeParse(analysis({ questions: Array.from({ length: count }, () => questions[0]) })).success, false);
  for (const change of [{ path: '../secret' }, { line: 0 }, { question: '' }]) assert.equal(AnalysisSchema.safeParse(analysis({ questions: questions.slice(0, 3).map(q => ({ ...q, ...change })) })).success, false);
});

test('report presents learning questions with snapshot links and actionable checks without empty boilerplate', () => {
  const text = renderReport(report({ checks: [{ name: 'CI: unit', status: 'failed', detail: '재시도 테스트 실패', url: null }] }));
  assert.match(text, /CI: unit.*실패/);
  assert.match(text, /### 4\. 변경 이해 질문[\s\S]*1\. .*pay[\s\S]*2\. [\s\S]*3\. /);
  assert.match(text, /\/blob\/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\/src\/pay.ts#L2/);
  assert.doesNotMatch(text, /흐름도:|해당 없음|새 지적: 없음|제외 파일: 없음|적용 규칙:|\| 검토 항목 \||양식 버전:/);
});

test('failed reports cannot manufacture or reuse learning questions', () => {
  const failed = renderReport(report({ state: 'failed' }));
  assert.match(failed, /질문.*생성하지 못|생성하지 못.*질문/);
  assert.doesNotMatch(failed, /^\d+\. /m);
});

test('escaping expansion cannot overflow the comment budget or remove required questions', () => {
  for (const path of [Array(5).fill('&'.repeat(99)).join('/'), Array(6).fill('漢'.repeat(82)).join('/')]) {
    const questions = Array.from({ length: 3 }, (_, i) => ({ question: '&'.repeat(480) + `Q${i}?`, path, line: 1, side: 'RIGHT' }));
    const checks = Array.from({ length: 30 }, (_, i) => ({ name: `CI: ${i}` + '&'.repeat(95), status: 'failed', detail: '&'.repeat(6000), url: null }));
    const value = { questions, checks, summary: '&'.repeat(6000), limitations: Array(5).fill('&'.repeat(6000)), recommendedTests: Array(5).fill('&'.repeat(6000)) };
    assert.equal(AnalysisSchema.safeParse(analysis(value)).success, true);
    const body = renderReport(report(value));
    assert.ok(body.length <= 60000); assert.equal([...body.matchAll(/^\d+\. /gm)].length, 3);
    assert.ok(body.includes('&amp;'.repeat(480) + 'Q0?'));
    assert.ok(body.includes('/' + (path.includes('漢') ? '%E6%BC%A2'.repeat(82) : '%26'.repeat(99)) + '/'));
  }
});

test('CI skip and neutral outcomes stay distinct from passed checks and retain useful context', () => {
  const body = renderReport(report({ checks: [
    { name: 'CI: unit', status: 'skipped', detail: 'unit: skipped', url: null },
    { name: 'CI: optional', status: 'neutral', detail: 'optional review', url: null },
    { name: 'CI: legacy', status: 'passed', detail: 'legacy: skipped', url: null },
  ] }));
  assert.match(body, /CI: unit: 건너뜀/); assert.match(body, /CI: optional: 중립/);
  assert.match(body, /legacy: skipped/);
});
