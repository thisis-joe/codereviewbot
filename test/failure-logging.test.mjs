import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { Controller } from '../dist/controller.js';

async function loggedFailure(error) {
  const target = { platform: 'github', instance: 'https://api.github.com', repository: 'joe/demo', number: 1 };
  const platform = { config: target, permission: async () => { throw error; } };
  const job = { id: 'diagnostic-job', owner: 'owner', kind: 'command', state: 'running', attempts: 1, body: { target, comment: { id: 'human', author: 'joe', body: '/hey pause', surface: 'issue' } } };
  const store = { fail: async () => {}, heartbeat: async () => {} }, logs = [], original = console.error;
  console.error = line => logs.push(JSON.parse(line));
  try { await new Controller(store, [platform], {}, {}).perform(job); }
  finally { console.error = original; }
  return logs.at(-1);
}

test('failure diagnostics include work kind, stage, attempt and bounded cause', async () => {
  assert.deepEqual(await loggedFailure(new Error('Platform credential unavailable')), {
    jobId: 'diagnostic-job', kind: 'command', stage: 'running', attempt: 1,
    error: 'execution_failed', cause: 'Error: Platform credential unavailable',
  });
});

test('schema diagnostics identify the field and issue code without quoting model output', async () => {
  const parsed = z.object({ questions: z.array(z.object({ key: z.object({ answer: z.string() }) })) }).safeParse({ questions: [{ secretText: 'private model output' }] });
  const log = await loggedFailure(parsed.error);
  assert.match(log.cause, /schema mismatch: questions\.0\.key invalid_type/);
  assert.doesNotMatch(JSON.stringify(log), /private model output|secretText/);
});

test('malformed JSON diagnostics do not echo the parser input', async () => {
  const log = await loggedFailure(new SyntaxError('private model JSON fragment'));
  assert.equal(log.cause, 'invalid JSON from runner');
  assert.doesNotMatch(JSON.stringify(log), /private model JSON fragment/);
});

test('generic failure diagnostics mask known credentials and cap output size', async () => {
  const credential = 'ghp_' + 'a'.repeat(24);
  const log = await loggedFailure(new Error(`${credential} ${'x'.repeat(600)}`));
  assert.match(log.cause, /REDACTED_CREDENTIAL/);
  assert.doesNotMatch(log.cause, new RegExp(credential));
  assert.equal(log.cause.length, 300);
});
