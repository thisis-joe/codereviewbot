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

const check = (id, answer, reason = '두 번째 줄의 승인 호출로 확인됩니다.') =>
  ({ id, answer, evidence: { path: 'src/pay.ts', side: 'RIGHT', line: 2, reason } });

test('blind solving sees no keys, replaces only the rejected question, and checks it again', async () => {
  const questions = initialQuestions(), calls = [];
  const replacement = { ...questions[1], question: '변경된 승인 흐름에서 호출자는 어떤 실패를 처리해야 하나요?' };
  const result = await generate({
    initialQuestions: async () => ({ output: { questions }, verify: true }),
    run: async (phase, prompt, _id, timeout) => {
      calls.push(phase);
      assert.ok(timeout > 0 && timeout <= 120000);
      if (phase === 'repair_initial_questions') {
        const data = JSON.parse(prompt.split('재출제 자료(JSON 데이터):\n')[1]);
        assert.deepEqual(data.rejected.map(q => q.id), [2]);
        assert.deepEqual(data.retained.map(q => q.question), [questions[0].question]);
        return { questions: [{ id: 2, ...replacement }] };
      }
      const data = JSON.parse(prompt.split('검증 자료(JSON 데이터):\n')[1]);
      const expected = calls.length === 1 ? questions : [replacement];
      assert.deepEqual(data.questions, expected.map((q, i) => ({
        id: calls.length === 1 ? i + 1 : 2, question: q.question, options: q.options, path: q.path, line: q.line, side: q.side,
      })));
      for (const q of expected) {
        assert.ok(!prompt.includes(q.key.explanation));
        for (const note of q.key.options) assert.ok(!prompt.includes(note.explanation));
      }
      return { checks: calls.length === 1 ? [check(2, 'A'), check(1, 'B')] : [check(2, 'B')] };
    },
  });
  assert.deepEqual(calls, ['verify_initial_questions', 'repair_initial_questions', 'verify_initial_questions']);
  assert.deepEqual(result.questions, [questions[0], replacement]);
});

test('blind solving rejects an ambiguous replacement without a second repair', async () => {
  const questions = initialQuestions(), calls = [];
  await assert.rejects(() => generate({
    initialQuestions: async () => ({ output: { questions }, verify: true }),
    run: async phase => {
      calls.push(phase);
      if (phase === 'repair_initial_questions') return { questions: [{ id: 1, ...questions[0] }] };
      return { checks: [check(1, null, '같은 조건에서 A와 B가 모두 성립합니다.'), ...(calls.length === 1 ? [check(2, 'B')] : [])] };
    },
  }), error => error.failure?.code === 'invalid_output');
  assert.deepEqual(calls, ['verify_initial_questions', 'repair_initial_questions', 'verify_initial_questions']);
});

test('an invalid draft anchor is repaired without sending it to the solver or replacing a valid neighbor', async () => {
  const questions = initialQuestions(), calls = [];
  const broken = { ...questions[0], line: 500 };
  const result = await generate({
    initialQuestions: async () => ({ output: { questions: [broken, questions[1]] }, verify: true }),
    run: async (phase, prompt) => {
      calls.push(phase);
      if (phase === 'repair_initial_questions') {
        const { rejected } = JSON.parse(prompt.split('재출제 자료(JSON 데이터):\n')[1]);
        assert.deepEqual(rejected.map(q => q.id), [1]);
        assert.match(rejected[0].reason, /코드 근거/);
        return { questions: [{ id: 1, ...questions[0] }] };
      }
      const data = JSON.parse(prompt.split('검증 자료(JSON 데이터):\n')[1]);
      assert.deepEqual(data.questions.map(q => q.id), [calls.length === 1 ? 2 : 1]);
      return { checks: [check(data.questions[0].id, 'B')] };
    },
  });
  assert.deepEqual(calls, ['verify_initial_questions', 'repair_initial_questions', 'verify_initial_questions']);
  assert.deepEqual(result.questions, questions);
});

test('missing, duplicate, or ungrounded verifier evidence cannot authorize publishing', async () => {
  for (const checks of [[check(1, 'B')], [check(1, 'B'), check(1, 'B')], [check(1, 'B'), { ...check(2, 'B'), evidence: { ...check(2, 'B').evidence, line: 1000 } }]]) {
    const calls = [];
    await assert.rejects(() => generate({
      initialQuestions: async () => ({ output: { questions: initialQuestions() }, verify: true }),
      run: async phase => { calls.push(phase); return { checks }; },
    }), error => error.failure?.code === 'invalid_output');
    assert.deepEqual(calls, ['verify_initial_questions']);
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
  assert.match(prompt, /오답에 없는 주장을 덧붙여 반박하지 마세요/);
  assert.equal(calls.length, 1);
});

test('prompts carry numbered excerpts around changed lines and around a graded anchor', async () => {
  const lines = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join('\n');
  const ctx = { ...context(), files: { 'src/pay.ts': lines }, baseFiles: { 'src/old.ts': lines },
    diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch: '', lines: new Set([10, 12, 90]) } } };
  const excerpts = engine.sourceExcerpts(ctx);
  assert.deepEqual(excerpts.map(e => [e.path, e.side, e.start, e.end]), [['src/pay.ts', 'RIGHT', 1, 32], ['src/pay.ts', 'RIGHT', 70, 110]]);
  assert.equal(excerpts[0].text.split('\n')[0], '1\tline 1');
  assert.equal(engine.sourceExcerpts(ctx, 200).length, 0);
  assert.deepEqual(engine.anchorExcerpts({ path: 'src/old.ts', line: 5, side: 'LEFT' }, ctx).map(e => [e.side, e.start, e.end]), [['LEFT', 1, 35]]);
  assert.deepEqual(engine.anchorExcerpts({ path: 'missing.ts', line: 5, side: 'RIGHT' }, ctx), []);
  const calls = [];
  await engine.generateQuestions({ run: async (...args) => { calls.push(args); return { questions: initialQuestions() }; } }, 'workspace', snapshot(), readPolicy(), context(), null, [], [], 'full');
  const data = JSON.parse(calls[0][1].split('출제 자료(JSON 데이터):\n')[1]);
  assert.equal(data.sourceExcerpts[0].text, '1\tfunction pay() {\n2\tcharge();\n3\t}');
  assert.match(calls[0][1], /sourceExcerpts\(줄 번호가 붙은 변경 주변 코드\)를 먼저 읽고/);
});
