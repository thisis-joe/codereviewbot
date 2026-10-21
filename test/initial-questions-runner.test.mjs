import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import * as contracts from '../dist/contracts.js';
import { Codex } from '../dist/codex.js';
import { ClaudeCode } from '../dist/claude.js';
import { changeQuestions } from './fixtures.mjs';

const questions = count => Array.from({ length: count }, (_, i) => ({
  ...changeQuestions()[i % 3], question: `변경된 처리 조건 ${i + 1}은 무엇인가요?`,
}));

test('initial question contract accepts exactly three basic and one advanced question and rejects review output', () => {
  assert.ok(contracts.InitialQuestionsSchema, 'initial question contract must be exported');
  assert.equal(contracts.InitialQuestionsSchema.safeParse({ questions: questions(4) }).success, true);
  assert.equal(contracts.InitialQuestionsSchema.safeParse({ questions: questions(4).reverse() }).success, true, 'order is normalized after parsing');
  for (const count of [3, 5, 10]) {
    assert.equal(contracts.InitialQuestionsSchema.safeParse({ questions: questions(count) }).success, false);
  }
  for (const levels of [['basic', 'basic', 'basic', 'basic'], ['basic', 'basic', 'advanced', 'advanced']]) {
    assert.equal(contracts.InitialQuestionsSchema.safeParse({ questions: questions(4).map((q, i) => ({ ...q, level: levels[i] })) }).success, false, levels.join());
  }
  for (const field of ['summary', 'findings', 'checks', 'recommendedTests', 'limitations', 'resolutions']) {
    assert.equal(contracts.InitialQuestionsSchema.safeParse({ questions: questions(4), [field]: [] }).success, false, field);
  }
});

// The subprocess reads the actual CLI schema, then returns output through the provider's real boundary.
// This catches mapping mistakes that a Model mock cannot exercise.
for (const [provider, Model] of [['Codex', Codex], ['Claude', ClaudeCode]]) {
  test(`${provider} initial question CLI receives only the four-question schema`, { timeout: 30000 }, async t => {
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
if (schema.additionalProperties !== false || Object.keys(schema.properties).join() !== 'questions' || schema.required.join() !== 'questions' || schema.properties.questions.minItems !== 4 || schema.properties.questions.maxItems !== 4) process.exit(42);
if (!codex && !/question and learning assistant/i.test(at('--system-prompt'))) process.exit(43);
const value = ${JSON.stringify(value)};
if (codex) fs.writeFileSync(at('-o'), JSON.stringify(value));
else process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: value }));
`;
    const value = { questions: questions(4) };
    await writeFile(binary, reply(value), { mode: 0o755 });
    assert.deepEqual(await model.run('initial_questions', 'Ask about the pinned code change.', id, 5000), value);
    for (const value of [{ questions: questions(3) }, { questions: questions(5) }, { questions: questions(4).map(q => ({ ...q, level: 'basic' })) }, { questions: questions(4), findings: [] }]) {
      await writeFile(binary, reply(value), { mode: 0o755 });
      await assert.rejects(() => model.run('initial_questions', 'Ask about the pinned code change.', id, 5000));
    }
  });
}

test('isolated runner HTTP accepts the initial question phase', { timeout: 15000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'crb-initial-http-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const id = '88888888-8888-4888-8888-888888888888';
  await mkdir(join(root, 'jobs', id, 'source'), { recursive: true });
  const binary = join(root, 'fake-codex'), value = { questions: questions(4) };
  await writeFile(binary, `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2);
fs.writeFileSync(args[args.indexOf('-o') + 1], ${JSON.stringify(JSON.stringify(value))});
`, { mode: 0o755 });
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  const token = 'initial-questions-runner-test-token';
  const child = spawn(process.execPath, [new URL('../dist/runner-server.js', import.meta.url).pathname], {
    env: { PATH: process.env.PATH, PORT: String(port), RUNNER_TOKEN: token, MODEL_PROVIDER: 'codex', DATA_ROOT: root, CODEX_HOME: join(root, 'auth'), CODEX_BINARY: binary },
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
  const response = await fetch(`http://127.0.0.1:${port}/run`, {
    method: 'POST', signal: AbortSignal.timeout(5000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ phase: 'initial_questions', prompt: 'Ask about the pinned code change.', workspaceId: id, timeoutMs: 5000 }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), value);
});
