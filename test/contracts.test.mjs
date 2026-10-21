import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { AnalysisSchema, InitialQuestionsSchema } from '../dist/contracts.js';
import { renderReport, renderFinding, renderAnswer, renderProgress, SUMMARY_MARKER } from '../dist/render.js';
import { estimateMinutes } from '../dist/store.js';
import { analysis, snapshot, finding, report, choices, answerKey } from './fixtures.mjs';

test('legacy analysis contracts remain readable and initial questions reject review fields', () => {
  assert.equal(AnalysisSchema.safeParse(analysis({ findings: [finding()] })).success, true);
  assert.equal(InitialQuestionsSchema.safeParse({ questions: report().questions }).success, true);
  assert.equal(InitialQuestionsSchema.safeParse(analysis()).success, false);
  assert.equal(z.toJSONSchema(InitialQuestionsSchema, { unrepresentable: 'any' }).additionalProperties, false);
});

test('all lifecycle outcomes have question-only comments and no review verdict', () => {
  for (const state of ['completed', 'partial', 'failed']) {
    const text = renderReport(report({ state }));
    assert.match(text, /^### CodeReviewBot 변경 이해 질문$/m);
    assert.doesNotMatch(text, /^### \d\.|수정 필요|지적 없음|판단 보류|검증·주의사항/m);
  }
});

test('rendering is deterministic, escapes structural injection and never notifies arbitrary handles', () => {
  const value = report({ questions: analysis().questions.map((q, i) => i ? q : { ...q, question: '# injected\n<script>@joe</script>' }) });
  const text = renderReport(value);
  assert.equal(text, renderReport(value));
  assert.doesNotMatch(text, /^# injected|<script>|@joe/m);
  assert.match(text, /<!-- codereviewbot:summary:v1 -->/);
});

test('archived findings do not affect question output or produce quality verdicts', () => {
  const plain = renderReport(report());
  assert.equal(renderReport(report({ findings: [finding({ id: 'CRB-0001', severity: 'P1' })] })), plain);
  assert.match(renderReport(report({ state: 'partial' })), /부분 완료/);
});

test('legacy inline and answer templates retain safe suggestion blocks and evidence', () => {
  const text = renderFinding(finding({ id: 'CRB-0001', suggestion: { startLine: 4, endLine: 4, replacement: 'return `x`;\n```' } }), snapshot());
  for (const label of ['문제', '발생 조건', '영향', '근거', '수정 방향', '추천 검증', '코드 제안']) assert.match(text, new RegExp(`\\*\\*${label}\\*\\*`));
  assert.match(text, /````suggestion/);
  assert.match(renderAnswer({ answer: '설명', evidence: ['src/pay.ts:4'], next: '검증 필요' }, 'reply-1'), /### 답변[\s\S]*### 코드 근거[\s\S]*### 후속 조치·한계/);
});

test('question-only report keeps snapshot links and omits all legacy CI and summary content', () => {
  const text = renderReport(report({ summary: 'legacy summary', checks: [{ name: 'CI: unit', status: 'failed', detail: '실패', url: null }] }));
  assert.match(text, /^#### Q1\. .*pay[\s\S]*^#### Q2\. [\s\S]*^#### Q3\. /m);
  assert.match(text, /\/commit\/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\)/); assert.doesNotMatch(text, /\/blob\//);
  assert.doesNotMatch(text, /CI: unit|legacy summary|로컬 테스트|권장 확인/);
});

test('failed reports cannot manufacture or reuse learning questions', () => {
  const failed = renderReport(report({ state: 'failed' }));
  assert.match(failed, /질문 생성에 실패/);
  assert.doesNotMatch(failed, /#### Q1\.|\/reviewbot answer|\/reviewbot showanswer/);
});

test('oversized escaped questions retain three complete questions and visible compaction', () => {
  for (const path of [Array(5).fill('&'.repeat(99)).join('/'), Array(6).fill('漢'.repeat(82)).join('/')]) {
    const questions = Array.from({ length: 10 }, (_, i) => ({ question: '&'.repeat(480) + `Q${i}?`, path, line: 1, side: 'RIGHT', level: 'basic', options: choices(...'ABCD'.split('').map(id => '&'.repeat(299) + id)), key: answerKey() }));
    assert.equal(InitialQuestionsSchema.safeParse({ questions }).success, true);
    const body = renderReport(report({ questions }));
    assert.ok(body.length <= 60000); assert.equal([...body.matchAll(/^#### Q\d+\. /gm)].length, 3);
    assert.match(body, /축약|3개만 표시/);
    assert.ok(body.includes('&amp;'.repeat(480) + 'Q0?'));
  }
});

test('generation progress keeps only current question results collapsed and never includes old findings', () => {
  const s = snapshot({ headSha: 'c'.repeat(40) });
  const first = renderProgress(s, { minutes: 2, measured: false });
  assert.ok(first.startsWith(SUMMARY_MARKER)); assert.match(first, /\*\*질문 생성 중\*\* · 기준 커밋 \[cccccccc\]/);
  assert.match(first, /약 2분/); assert.doesNotMatch(first, /최근 질문 생성 기준|<details>/);
  const next = renderProgress(s, { minutes: 1, measured: true }, { report: report({ findings: [finding({ id: 'CRB-0001' })] }), results: new Map() });
  assert.match(next, /약 1분입니다 \(최근 질문 생성 기준\)[\s\S]*이전 질문/);
  assert.doesNotMatch(next, /CRB-0001/); assert.equal(next.split(SUMMARY_MARKER).length, 2);
  assert.equal(renderProgress(s, { minutes: 2, measured: false }, { report: report({ schemaVersion: '1' }), results: new Map() }), first);
});

test('question estimates round up and use the two-minute initial call budget as an unmeasured guess', () => {
  assert.deepEqual(estimateMinutes(null), { minutes: 2, measured: false });
  assert.deepEqual(estimateMinutes(61), { minutes: 2, measured: true });
  assert.deepEqual(estimateMinutes(12), { minutes: 1, measured: true });
});
