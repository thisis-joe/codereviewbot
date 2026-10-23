import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../dist/review.js';
import { report, snapshot, changeQuestions, initialQuestions, finding } from './fixtures.mjs';
import { readPolicy } from '../dist/policy.js';

const context = () => ({ files: { 'src/pay.ts': 'function pay() {\ncharge();\n}' }, baseFiles: {}, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch: '@@ -1,3 +1,3 @@\n function pay() {\n+charge();\n }', lines: new Set([1, 2, 3]) } }, excluded: [], limited: false, sourceDir: '/snapshot/source' });
const generate = (model, ctx = context(), previous = null) => engine.generateQuestions(model, 'workspace', snapshot(), readPolicy(), ctx, previous, [], [], 'full');

test('initial generation makes one bounded question-only call and archives prior findings', async () => {
  const calls = [], old = finding({ id: 'CRB-0001', status: 'open' });
  const result = await generate({ run: async (...args) => { calls.push(args); return { questions: initialQuestions() }; } }, context(), report({ findings: [old] }));
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'initial_questions'); assert.equal(calls[0][3], 120000);
  assert.match(calls[0][1], /질문|출제/); assert.match(calls[0][1], /read_file/);
  assert.doesNotMatch(calls[0][1], /previousFindings|recommendedTests|resolutions|CRB-0001/);
  assert.equal(result.schemaVersion, '2'); assert.equal(result.state, 'completed'); assert.equal(result.questions.length, 2);
  assert.equal(result.findings[0].status, 'unverified'); assert.equal(old.status, 'open');
  assert.deepEqual(result.checks, []); assert.deepEqual(result.recommendedTests, []);
});

test('generation validates duplicate and invalid source questions before returning results', async () => {
  for (const questions of [initialQuestions().map(q => ({ ...q, line: 500 })), initialQuestions().map((q, i, all) => i ? q : { ...q, question: all[1].question })]) {
    await assert.rejects(() => generate({ run: async () => ({ questions }) }), /코드 근거|중복 질문/);
  }
});

test('unreadable changes return explicit unavailable results without inference', async () => {
  const result = await generate({ run: async () => { throw Error('must not call'); } }, { ...context(), files: {}, diff: {} });
  assert.equal(result.schemaVersion, '2'); assert.equal(result.state, 'partial'); assert.deepEqual(result.questions, []);
  assert.match(result.questionsUnavailableReason, /변경 근거/);
});

test('incremental generation preserves the exact delta and grounds purpose without confusing base revisions', async () => {
  const ctx = { ...context(), changesSincePrevious: { fromHeadSha: 'c'.repeat(40), files: {
    'src/pay.ts': { oldPath: 'src/pay.ts', patch: '@@ -2 +2 @@\n-oldCharge();\n+charge();' },
  } } };
  const calls = [];
  const previous = report();
  await engine.generateQuestions({ run: async (...args) => { calls.push(args); return { questions: initialQuestions() }; } },
    'workspace', snapshot(), readPolicy(), ctx, previous, [], [], 'incremental');
  const prompt = calls[0][1], data = JSON.parse(prompt.split('출제 자료(JSON 데이터):\n')[1]);
  assert.deepEqual(data.changesSincePrevious, ctx.changesSincePrevious);
  assert.deepEqual(data.previousQuestions, previous.questions.map(q => q.question));
  assert.match(prompt, /Q1은 변경의 핵심 효과/);
  assert.match(prompt, /작성자의.*추측/);
  assert.match(prompt, /이번 증분의 실제 변경만 출제/);
  assert.match(prompt, /변경 전 코드는 직전 출제 커밋/);
  assert.match(prompt, /diff의 LEFT는 MR\/PR 기준 커밋/);
  assert.match(prompt, /내부에서 생성하는 예외와 외부에서 전파되는 예외를 구분/);
  assert.match(prompt, /오답에 없는 주장을 추가하거나 확인되지 않은 일반 법칙/);
  assert.equal(calls.length, 1);
});
