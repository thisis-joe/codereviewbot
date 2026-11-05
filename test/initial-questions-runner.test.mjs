import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import * as contracts from '../dist/contracts.js';
import { Codex, HttpModel } from '../dist/codex.js';
import { ClaudeCode } from '../dist/claude.js';
import { generateQuestions } from '../dist/review.js';
import { readPolicy } from '../dist/policy.js';
import { changeQuestions, checked, snapshot } from './fixtures.mjs';

const questions = count => Array.from({ length: count }, (_, i) => ({
  ...changeQuestions()[i % 3], question: `변경된 처리 조건 ${i + 1}은 무엇인가요?`,
}));

test('initial question contract accepts exactly two basic questions and rejects review output', () => {
  assert.ok(contracts.InitialQuestionsSchema, 'initial question contract must be exported');
  assert.equal(contracts.InitialQuestionsSchema.safeParse({ questions: questions(2) }).success, true);
  assert.equal(contracts.InitialQuestionsSchema.safeParse({ questions: questions(2).reverse() }).success, true, 'both priority orders are accepted');
  for (const count of [0, 1, 3, 4, 5, 10]) {
    assert.equal(contracts.InitialQuestionsSchema.safeParse({ questions: questions(count) }).success, false);
  }
  for (const levels of [['basic', 'basic'], ['advanced', 'advanced']]) {
    assert.equal(contracts.InitialQuestionsSchema.safeParse({ questions: questions(2).map((q, i) => ({ ...q, level: levels[i] })) }).success, levels.every(level => level === 'basic'), levels.join());
  }
  for (const field of ['summary', 'findings', 'checks', 'recommendedTests', 'limitations', 'resolutions']) {
    assert.equal(contracts.InitialQuestionsSchema.safeParse({ questions: questions(2), [field]: [] }).success, false, field);
  }
});

// The subprocess reads the actual CLI schema, then returns output through the provider's real boundary.
// This catches mapping mistakes that a Model mock cannot exercise.
for (const [provider, Model] of [['Codex', Codex], ['Claude', ClaudeCode]]) {
  test(`${provider} initial question CLI receives only the two-question schema`, { timeout: 30000 }, async t => {
    const root = await mkdtemp(join(tmpdir(), 'crb-initial-questions-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const id = '77777777-7777-4777-8777-777777777777';
    await mkdir(join(root, 'jobs', id, 'source'), { recursive: true });
    const binary = join(root, `fake-${provider.toLowerCase()}`);
    const model = new Model(root, join(root, 'auth'), binary);
    const reply = value => `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2), at = flag => args[args.indexOf(flag) + 1];
const codex = args.includes('--output-schema');
const schema = codex ? JSON.parse(fs.readFileSync(at('--output-schema'), 'utf8')) : JSON.parse(at('--json-schema'));
if (schema.additionalProperties !== false || Object.keys(schema.properties).join() !== 'questions' || schema.required.join() !== 'questions' || schema.properties.questions.minItems !== 2 || schema.properties.questions.maxItems !== 2) process.exit(42);
if (schema.properties.questions.items.properties.level.const !== 'basic') process.exit(44);
if (!codex && !/question and learning assistant/i.test(at('--system-prompt'))) process.exit(43);
const value = ${JSON.stringify(value)};
if (codex) fs.writeFileSync(at('-o'), JSON.stringify(value));
else process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: value }));
`;
    const value = { questions: questions(2) };
    await writeFile(binary, reply(value), { mode: 0o755 });
    assert.deepEqual(await model.run('initial_questions', 'Ask about the pinned code change.', id, 5000), value);
    for (const value of [{ questions: questions(3) }, { questions: questions(5) }, { questions: questions(2), findings: [] }]) {
      await writeFile(binary, reply(value), { mode: 0o755 });
      await assert.rejects(() => model.run('initial_questions', 'Ask about the pinned code change.', id, 5000));
    }
  });
}

for (const phase of ['initial_questions', 'csinterview', 'morecs']) test(`isolated runner HTTP accepts the ${phase} phase`, { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'crb-initial-http-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = '88888888-8888-4888-8888-888888888888';
  await mkdir(join(root, 'jobs', id, 'source'), { recursive: true });
  const outputs = { initial_questions: { questions: questions(2) }, csinterview: { questions: questions(2).map(checked), unavailableReason: null },
    morecs: { questions: questions(2).map(q => checked({ ...q, kind: 'followup', anchor: '면접1' })), unavailableReason: '면접1만 더 파고들 근거가 있습니다.' } };
  const binary = join(root, 'fake-codex'), value = outputs[phase];
  await writeFile(binary, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.writeFileSync(args[args.indexOf('-o') + 1], ${JSON.stringify(JSON.stringify(value))});
`, { mode: 0o755 });
  const { url, token } = await startRunner(t, { MODEL_PROVIDER: 'codex', DATA_ROOT: root, CODEX_HOME: join(root, 'auth'), CODEX_BINARY: binary });
  const response = await fetch(`${url}/run`, {
    method: 'POST', signal: AbortSignal.timeout(5000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ phase, prompt: 'Ask about the pinned code change.', workspaceId: id, timeoutMs: 5000 }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), value);
});

async function startRunner(t, env) {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  const token = 'initial-questions-runner-test-token';
  const child = spawn(process.execPath, [new URL('../dist/runner-server.js', import.meta.url).pathname], {
    env: { PATH: process.env.PATH, PORT: String(port), RUNNER_TOKEN: token, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close'); child.kill('SIGKILL'); await closed;
    }
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Runner did not become ready')), 5000);
    let output = '';
    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (output.includes('"ready":true')) { clearTimeout(timer); resolve(); }
    });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Runner exited before readiness (${code})`)); });
  });
  return { url: `http://127.0.0.1:${port}`, token };
}

test('controller-to-runner HTTP uses the blind gate for Luna and leaves Sol on one stage', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'crb-blind-http-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = '88888888-8888-4888-8888-888888888888', sourceDir = join(root, 'jobs', id, 'source');
  const path = 'src/pay.ts', source = 'function pay() {\n  charge();\n}', calls = [];
  await mkdir(join(sourceDir, 'src'), { recursive: true });
  await writeFile(join(sourceDir, path), source);
  const drafts = questions(2), replacement = { ...drafts[0], question: '재출제된 처리 조건은 무엇인가요?' };
  const solution = (id, answer) => ({ id, answer, evidence: { path, line: 2, side: 'RIGHT', reason: '승인 호출' } });
  const gateway = createHttpServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw), phase = body.text.format.name;
    calls.push({ model: body.model, phase, input: body.input });
    const n = calls.length;
    const result = phase === 'initial_questions' ? { questions: drafts }
      : phase === 'repair_initial_questions' ? { questions: [{ id: 1, ...replacement }] }
      : { checks: n === 2 ? [solution(1, 'A'), solution(2, 'B')] : [solution(1, 'B')] };
    res.end(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }));
  });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => gateway.close());
  const ctx = { files: { [path]: source }, diff: { [path]: { oldPath: path, patch: '@@ -2 +2 @@\n+  charge();', lines: new Set([2]) } }, excluded: [], limited: false, sourceDir };
  for (const name of ['gpt-6-luna', 'gpt-6.1-sol']) {
    const { url, token } = await startRunner(t, { MODEL_PROVIDER: 'gms', DATA_ROOT: root, GMS_MODEL: name, GMS_KEY: 'fixture-only', GMS_RESPONSES_URL: `http://127.0.0.1:${gateway.address().port}/responses` });
    const result = await generateQuestions(new HttpModel(url, token), id, snapshot(), readPolicy(), ctx, null, [], [], 'full', 5000);
    assert.deepEqual(result.questions, name === 'gpt-6-luna' ? [replacement, drafts[1]] : drafts);
  }
  assert.deepEqual(calls.map(c => [c.model, c.phase]), [
    ['gpt-6-luna', 'initial_questions'], ['gpt-6-luna', 'verify_initial_questions'],
    ['gpt-6-luna', 'repair_initial_questions'], ['gpt-6-luna', 'verify_initial_questions'], ['gpt-6.1-sol', 'initial_questions'],
  ]);
  for (const { input } of [calls[1], calls[3]]) {
    assert.equal(input.length, 1, 'solver starts without writer history');
    assert.doesNotMatch(input[0].content, /정답은 B입니다|보기 해설/);
  }
});
