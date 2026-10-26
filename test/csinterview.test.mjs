import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CsInterviewBatchSchema } from '../dist/contracts.js';
import { Codex } from '../dist/codex.js';
import { ClaudeCode } from '../dist/claude.js';
import { Gms } from '../dist/gms.js';
import { initialQuestions } from './fixtures.mjs';

test('interview output requires a shortfall reason, at most five questions and complete four-choice keys', () => {
  for (const count of [0, 1, 4, 5, 6]) {
    const questions = Array.from({ length: count }, () => initialQuestions()[0]);
    assert.equal(CsInterviewBatchSchema.safeParse({ questions, unavailableReason: '근거 제한' }).success, count < 5);
    assert.equal(CsInterviewBatchSchema.safeParse({ questions, unavailableReason: null }).success, count === 5);
    assert.equal(CsInterviewBatchSchema.safeParse({ questions }).success, false);
  }
  const q = initialQuestions()[0];
  for (const bad of [{ ...q, options: q.options.slice(0, 3) }, { ...q, key: undefined }, { ...q, key: { ...q.key, answer: 'E' } }]) {
    assert.equal(CsInterviewBatchSchema.safeParse({ questions: [bad], unavailableReason: '제한' }).success, false);
  }
  assert.equal(CsInterviewBatchSchema.safeParse({ questions: [], unavailableReason: ' ' }).success, false);
});

for (const [name, Model] of [['Codex', Codex], ['Claude', ClaudeCode]]) {
  test(`${name} receives the interview schema and validates its structured output`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'hey-interview-cli-')); t.after(() => rm(root, { recursive: true, force: true }));
    const id = '77777777-7777-4777-8777-777777777777'; await mkdir(join(root, 'jobs', id, 'source'), { recursive: true });
    const binary = join(root, 'fake-model'), model = new Model(root, join(root, 'auth'), binary);
    const output = { questions: initialQuestions(), unavailableReason: '두 주제를 확인했습니다.' };
    const script = value => `#!/usr/bin/env node
import fs from 'node:fs';
const args = process.argv.slice(2), at = flag => args[args.indexOf(flag) + 1];
const codex = args.includes('--output-schema');
const schema = codex ? JSON.parse(fs.readFileSync(at('--output-schema'), 'utf8')) : JSON.parse(at('--json-schema'));
if (schema.properties.questions.maxItems !== 5 || !schema.properties.unavailableReason || schema.additionalProperties !== false) process.exit(42);
const value = ${JSON.stringify(value)};
if (codex) fs.writeFileSync(at('-o'), JSON.stringify(value));
else process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: value }));
`;
    await writeFile(binary, script(output), { mode: 0o755 });
    assert.deepEqual(await model.run('csinterview', '면접 질문 출제', id, 5000), output);
    await writeFile(binary, script({ ...output, unavailableReason: null }), { mode: 0o755 });
    await assert.rejects(() => model.run('csinterview', '면접 질문 출제', id, 5000));
  });
}

test('GMS interview calls use the new output schema and retain stored terminology in the result', async t => {
  const root = await mkdtemp(join(tmpdir(), 'hey-interview-gms-')); t.after(() => rm(root, { recursive: true, force: true }));
  const id = '77777777-7777-4777-8777-777777777777'; await mkdir(join(root, 'jobs', id, 'source'), { recursive: true });
  const output = { questions: initialQuestions(), unavailableReason: '확인한 주제만 출제했습니다.' };
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    assert.equal(body.text.format.name, 'csinterview');
    assert.equal(body.text.format.schema.properties.questions.maxItems, 5);
    assert.ok(body.text.format.schema.properties.unavailableReason);
    res.end(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const model = new Gms(root, `http://127.0.0.1:${server.address().port}`, 'test-key', 'test-model');
  assert.deepEqual(await model.run('csinterview', 'CS 용어를 정확하게 사용하세요.', id, 5000), output);
});
