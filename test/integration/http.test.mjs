import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { Store } from '../../dist/store.js';
import { application } from '../../dist/application.js';
import { Controller } from '../../dist/controller.js';
import { analysis, finding, snapshot, changeQuestions, initialQuestions } from '../fixtures.mjs';
import { parsePatch } from '../../dist/review.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
test('signed HTTP admission, database work, single-pass questions and replay-safe publication work end to end', async t => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate(); await pool.query('TRUNCATE deliveries,jobs,targets CASCADE');
  const comments = [], inline = [], statuses = [];
  const config = { platform: 'github', instance: 'https://api.github.com', repository: 'joe/demo', botLogin: 'bot', webhookSecretEnv: 'HOOK_SECRET', webhookAuth: 'hmac', tokenEnv: 'TOKEN', enabled: true };
  const platform = { config, target: n => ({ ...snapshot(), number: n }), snapshot: async () => snapshot(), checks: async () => [], linkedIssues: async () => [], permission: async () => 'write',
    comments: async () => comments, inlineComments: async () => inline, owned: c => c.author === 'bot',
    comment: async (n, body, id) => { const existing = comments.find(c => c.id === id); if (existing) existing.body = body; else comments.push({ id: '1', body, author: 'bot' }); },
    inline: async (s, value) => { inline.push({ id: '2', body: value.body, author: 'bot' }); },
    gateStatus: async () => statuses.at(-1) ?? null, setGateStatus: async (s, gate) => { statuses.push(gate); },
  };
  const patch = '@@ -1,2 +1,2 @@\n function pay() {\n+charge();\n';
  const workspaces = { prepare: async () => ({ policy: { version: 1, pathInstructions: [], exclude: [], maxInlineComments: 5, requireAnswers: true }, guidelines: [], mode: 'full', context: { files: { 'src/pay.ts': 'function pay() {\ncharge();\n}' }, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch, lines: parsePatch(patch) } }, excluded: [], limited: false, sourceDir: '/snapshots/source' } }), cleanup: async () => {} };
  const calls = [];
  const model = { run: async phase => { calls.push(phase); return { questions: initialQuestions() }; } };
  const controller = new Controller(store, [platform], workspaces, model);
  const server = application(controller, [config], { INTERNAL_TOKEN: 'internal-test-secret', HOOK_SECRET: 'hook-test-secret' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({ action: 'synchronize', repository: { full_name: 'joe/demo' }, pull_request: { number: 1, head: { sha: 'b'.repeat(40) } } });
  const headers = { 'content-type': 'application/json', 'x-github-event': 'pull_request', 'x-github-delivery': 'http-1', 'x-hub-signature-256': 'sha256=' + createHmac('sha256','hook-test-secret').update(body).digest('hex') };
  assert.equal((await fetch(base+'/internal/tick', { method:'POST' })).status, 401);
  assert.equal((await fetch(base+'/webhooks/github', { method:'POST', headers: { ...headers, 'x-hub-signature-256':'invalid' }, body })).status, 401);
  for (let i=0;i<2;i++) assert.equal((await fetch(base+'/webhooks/github', { method:'POST', headers, body })).status, 202);
  const tick = async () => { const response = await fetch(base+'/internal/tick', { method:'POST', headers:{ authorization:'Bearer internal-test-secret' } }); assert.equal(response.status,202); await controller.active; };
  await tick(); await tick(); await tick();
  assert.equal(comments.length,1); assert.equal(inline.length,0);
  assert.match(comments[0].body,/핵심 CS 질문 2개/); assert.doesNotMatch(comments[0].body,/CRB-|수정 필요/); assert.deepEqual(calls,['initial_questions']);
  assert.equal((await store.health()).queued,0);
  assert.equal((await store.getTarget(snapshot())).report.questions.length, 2);
  assert.match(comments[0].body, /^### 핵심 CS 질문 2개$/m);
  // The base-branch policy reaches the published merge gate.
  assert.equal((await store.getTarget(snapshot())).report.requireAnswers, true);
  assert.deepEqual(statuses.map(s => s.state), ['pending']); assert.match(statuses[0].description, /0\/2/);
  platform.openNumbers = async () => [1];
  // Ordinary CI refreshes keep questions without inference; failed full runs clear old questions.
  model.run = async () => { throw new Error('inference unavailable'); };
  await store.enqueue({ kind: 'ci', target: snapshot(), deliveryId: 'ci-only', headSha: snapshot().headSha });
  await tick(); await tick();
  assert.equal((await store.getTarget(snapshot())).report.questions.length, 2);
  const prepare = workspaces.prepare;
  workspaces.prepare = async (...args) => { const prepared = await prepare(...args); return { ...prepared, context: { ...prepared.context, files: {}, diff: {} } }; };
  await store.enqueue({ kind: 'review', target: snapshot(), deliveryId: 'no-source', headSha: snapshot().headSha }, true);
  await tick(); await tick();
  const unavailable = (await store.getTarget(snapshot())).report;
  assert.equal(unavailable.state, 'partial'); assert.deepEqual(unavailable.questions, []);
  assert.ok(unavailable.questionsUnavailableReason);
  await controller.recover();
  assert.equal((await pool.query("SELECT kind FROM jobs WHERE state='queued'")).rows.length, 0);
  await tick(); await tick();
  assert.equal((await store.getTarget(snapshot())).report.questionsUnavailableReason, unavailable.questionsUnavailableReason);
  workspaces.prepare = prepare;
  const failed = await store.enqueue({ kind: 'review', target: snapshot(), deliveryId: 'failed-full', headSha: snapshot().headSha }, true);
  await pool.query('UPDATE jobs SET attempts=2 WHERE id=$1', [failed]);
  await tick(); await tick();
  const failedReport = (await store.getTarget(snapshot())).report;
  assert.equal(failedReport.state, 'failed'); assert.deepEqual(failedReport.questions, []);
  assert.doesNotMatch(comments[0].body, /^\d+\. /m);
});
