import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { Store } from '../../dist/store.js';
import { Controller } from '../../dist/controller.js';
import { application } from '../../dist/application.js';
import { parsePatch } from '../../dist/review.js';
import { snapshot, initialQuestions } from '../fixtures.mjs';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
async function fixture(t) {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  t.after(() => pool.end());
  const store = new Store(pool); await store.migrate(); await pool.query('TRUNCATE deliveries,jobs,targets CASCADE');
  const root = await mkdtemp(join(tmpdir(), 'hey-flow-')); t.after(() => rm(root, { recursive: true, force: true }));
  const snap = snapshot(), comments = [], calls = [], config = { ...snap, botLogin: 'bot' };
  let release, blocked; t.after(() => release?.());
  const platform = { config, snapshot: async () => ({ ...snap }), linkedIssues: async () => [], comments: async () => comments, inlineComments: async () => [], owned: c => c.author === 'bot',
    comment: async (_n, body, id) => { const old = comments.find(c => c.id === id); if (old) old.body = body; else comments.push({ id: String(comments.length + 1), body, author: 'bot' }); },
    permission: async () => 'write', reply: async (_n, body) => { comments.push({ id: String(comments.length + 1), body, author: 'bot' }); },
    openNumbers: async () => [],
  };
  const patch = '@@ -1,2 +1,2 @@\n function pay() {\n+charge();\n';
  const workspaces = { root, prepare: async () => ({ policy: { version: 1, pathInstructions: [], exclude: [], maxInlineComments: 5, requireAnswers: false }, guidelines: [], mode: 'full', context: { files: { 'src/pay.ts': 'function pay() {\ncharge();\n}' }, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch, lines: parsePatch(patch) } }, excluded: [], limited: false, sourceDir: join(root, 'source') } }), cleanup: async () => {} };
  const model = { run: async phase => { calls.push(phase); if (blocked) await blocked; return { questions: initialQuestions() }; } };
  let controller = new Controller(store, [platform], workspaces, model);
  let server = application(controller, [], { INTERNAL_TOKEN: 'flow-test-secret' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  let base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body = {}) => {
    const r = await fetch(base + '/internal/flow' + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer flow-test-secret' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const status = async flow => (await request(`/jobs/${flow.jobId}/status`, { owner: flow.owner })).body;
  const step = async (flow, name) => {
    const r = await request(`/jobs/${flow.jobId}/step`, { owner: flow.owner, step: name }); assert.equal(r.status, 202, JSON.stringify(r.body));
    for (let i = 0; i < 100; i++) { const value = await status(flow); if (value.status !== 'running') return value; await new Promise(r => setTimeout(r, 5)); }
    throw new Error('phase did not finish');
  };
  return { pool, store, root, get controller() { return controller; }, snap, comments, calls, platform, request, status, step,
    restart: async () => {
      await controller.active; await new Promise(resolve => server.close(resolve));
      controller = new Controller(new Store(pool), [platform], workspaces, model);
      server = application(controller, [], { INTERNAL_TOKEN: 'flow-test-secret' });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${server.address().port}`;
    },
    block: () => { blocked = new Promise(r => { release = r; }); }, unblock: () => { release?.(); blocked = undefined; },
  };
}

test('n8n explicitly drives each phase: admission/prepare never invokes AI and generation never publishes', async t => {
  const f = await fixture(t);
  const id = await f.store.enqueue({ kind: 'review', target: f.snap, requested: true, deliveryId: 'flow-1', headSha: f.snap.headSha });
  const claimed = await f.request('/claim'); assert.equal(claimed.status, 200);
  let flow = claimed.body; assert.equal(flow.jobId, id); assert.equal(flow.step, 'prepare'); assert.deepEqual(f.calls, []);
  assert.equal((await f.request(`/jobs/${id}/step`, { owner: flow.owner, step: 'publish' })).status, 409);
  flow = await f.step(flow, 'prepare'); assert.equal(flow.step, 'generate'); assert.deepEqual(f.calls, []);
  assert.equal((await f.request(`/jobs/${id}/step`, { owner: flow.owner, step: 'prepare' })).body.step, 'generate', 'lost start responses can be replayed after a checkpoint');
  assert.equal(f.comments.length, 1, 'only the existing progress notice is allowed');
  f.block();
  assert.equal((await f.request(`/jobs/${id}/step`, { owner: flow.owner, step: 'generate' })).status, 202);
  for (let i = 0; i < 100 && !f.calls.length; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal((await f.status(flow)).status, 'running');
  await f.request(`/jobs/${id}/step`, { owner: flow.owner, step: 'generate' });
  assert.deepEqual(f.calls, ['initial_questions'], 'a repeated start must not run inference twice');
  assert.match(f.comments[0].body, /codereviewbot:progress:v1/); assert.doesNotMatch(f.comments[0].body, /codereviewbot:question:/);
  f.unblock(); await f.controller.active;
  flow = await f.status(flow); assert.equal(flow.step, 'validate');
  flow = await f.step(flow, 'validate'); assert.equal(flow.step, 'publish');
  assert.equal((await f.store.getJob(id)).result.questions.length, 2);
  flow = await f.step(flow, 'publish'); assert.equal(flow.step, 'gate'); assert.match(f.comments[0].body, /codereviewbot:question:/);
  for (const name of ['gate', 'notify', 'complete']) flow = await f.step(flow, name);
  assert.equal(flow.status, 'completed'); assert.equal((await f.store.getJob(id)).state, 'completed');
  assert.equal((await f.request('/claim')).body.available, false);
  assert.deepEqual(f.calls, ['initial_questions']);
});

async function finish(f, flow) {
  for (let i = 0; i < 12 && flow.status === 'pending'; i++) flow = await f.step(flow, flow.step);
  return flow;
}

test('phase checkpoints survive controller restart and lease takeover without regenerating a saved result', async t => {
  const f = await fixture(t);
  const id = await f.store.enqueue({ kind: 'review', target: f.snap, requested: true, deliveryId: 'restart-1', headSha: f.snap.headSha });
  let flow = (await f.request('/claim')).body;
  flow = await f.step(flow, 'prepare'); flow = await f.step(flow, 'generate');
  assert.equal(flow.step, 'validate'); const owner = flow.owner;
  await f.restart();
  await f.pool.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [id]);
  flow = (await f.request('/claim')).body;
  assert.notEqual(flow.owner, owner); assert.equal(flow.step, 'validate');
  assert.equal((await f.request(`/jobs/${id}/step`, { owner, step: 'validate' })).status, 409);
  const response = JSON.stringify(flow); assert.doesNotMatch(response, /charge|sourceDir|questions|diff|prompt/);
  flow = await finish(f, flow);
  assert.equal(flow.status, 'completed'); assert.deepEqual(f.calls, ['initial_questions']);
  assert.equal(f.comments.length, 1);
});

test('publication response loss retries only publication and reconciles the existing remote comment', async t => {
  const f = await fixture(t);
  const id = await f.store.enqueue({ kind: 'review', target: f.snap, requested: true, deliveryId: 'publish-loss', headSha: f.snap.headSha });
  let flow = (await f.request('/claim')).body;
  for (const step of ['prepare','generate','validate']) flow = await f.step(flow, step);
  const comment = f.platform.comment; let lose = true;
  f.platform.comment = async (...args) => { await comment(...args); if (lose) { lose = false; throw new Error('response lost after write'); } };
  flow = await f.step(flow, 'publish'); assert.equal(flow.status, 'retry');
  assert.equal((await f.store.getJob(id)).state, 'ready');
  await f.restart(); await f.pool.query('UPDATE jobs SET due_at=now() WHERE id=$1', [id]);
  flow = (await f.request('/claim')).body; assert.equal(flow.step, 'publish');
  flow = await finish(f, flow);
  assert.equal(flow.status, 'completed'); assert.equal(f.comments.length, 1); assert.deepEqual(f.calls, ['initial_questions']);
});

test('the command branch preserves help without invoking preparation or AI', async t => {
  const f = await fixture(t);
  const comment = { id: '100', author: 'joe', body: '/hey help', surface: 'issue', parentId: null, discussionId: null };
  await f.store.enqueue({ kind: 'command', target: f.snap, deliveryId: 'help-flow', comment });
  let flow = (await f.request('/claim')).body; assert.equal(flow.step, 'command');
  flow = await f.step(flow, 'command'); assert.equal(flow.step, 'complete');
  flow = await f.step(flow, 'complete'); assert.equal(flow.status, 'completed');
  assert.deepEqual(f.calls, []); assert.equal(f.comments.length, 1);
  assert.match(f.comments[0].body, /명령어.*뜻.*설명/);
  assert.equal((await f.request(`/jobs/${flow.jobId}/step`, { owner: flow.owner, step: 'complete' })).body.status, 'completed');
});

test('n8n preserves classified model failures and publishes the stored failure notice', async t => {
  const { ModelFailure } = await import('../../dist/model-failure.js');
  const f = await fixture(t);
  const id = await f.store.enqueue({ kind: 'review', target: f.snap, requested: true, deliveryId: 'auth-failure', headSha: f.snap.headSha });
  f.controller.model.run = async () => { throw new ModelFailure({ code: 'authentication', provider: 'gms', apiStatus: 401 }); };
  let flow = (await f.request('/claim')).body; flow = await f.step(flow, 'prepare');
  flow = await f.step(flow, 'generate'); assert.equal(flow.step, 'publish');
  assert.equal((await f.store.getJob(id)).result.failure.code, 'authentication');
  flow = await finish(f, flow); assert.equal(flow.status, 'failed');
  assert.deepEqual(flow.failure, { step: 'generate', code: 'authentication' });
  assert.equal((await f.store.getJob(id)).result.failure.retryAt, undefined);
  assert.equal(f.comments.length, 1); assert.doesNotMatch(f.comments[0].body, /codereviewbot:question:/);
});

test('snapshot changes stop publication while workflow input and ownership are enforced', async t => {
  const f = await fixture(t);
  const id = await f.store.enqueue({ kind: 'review', target: f.snap, requested: true, deliveryId: 'changed', headSha: f.snap.headSha });
  let flow = (await f.request('/claim')).body;
  assert.equal((await f.request(`/jobs/${id}/step`, { owner: 'invalid', step: 'prepare' })).status, 400);
  assert.equal((await f.request(`/jobs/${id}/step`, { owner: flow.owner, step: 'arbitrary' })).status, 400);
  assert.equal((await f.request(`/jobs/${id}/status`, { owner: '00000000-0000-4000-8000-000000000000' })).status, 409);
  flow = await f.step(flow, 'prepare'); flow = await f.step(flow, 'generate');
  f.snap.headSha = 'c'.repeat(40);
  flow = await f.step(flow, 'validate'); assert.equal(flow.status, 'superseded');
  assert.equal((await f.store.getJob(id)).result, null); assert.match(f.comments[0].body, /codereviewbot:progress:/);
});

test('manual retry of a stored generation failure restarts generation instead of completing an empty result', async t => {
  const { ModelFailure } = await import('../../dist/model-failure.js');
  const f = await fixture(t);
  const id = await f.store.enqueue({ kind: 'review', target: f.snap, requested: true, deliveryId: 'manual', headSha: f.snap.headSha });
  const original = f.controller.model.run;
  f.controller.model.run = async () => { throw new ModelFailure({ code: 'authentication', provider: 'gms' }); };
  let flow = (await f.request('/claim')).body; flow = await finish(f, flow); assert.equal(flow.status, 'failed');
  f.controller.model.run = original;
  assert.equal(await f.store.retry(id), true);
  flow = (await f.request('/claim')).body; assert.equal(flow.step, 'prepare');
  flow = await finish(f, flow); assert.equal(flow.status, 'completed');
  assert.equal((await f.store.getJob(id)).result.questions.length, 2); assert.equal(f.comments.length, 1);
});

test('recovery is separated into gate reconciliation, admitted retries and protected source cleanup', async t => {
  const f = await fixture(t);
  for (const task of ['reconcile','recover','cleanup']) {
    const result = await f.request('/' + task);
    assert.equal(result.status, 200); assert.equal(result.body.completed, true);
  }
  assert.equal((await f.request('/claim')).body.available, false);
  assert.deepEqual(f.calls, []);
});

test('status polling cannot keep an orphaned running phase alive after a controller restart', async t => {
  const f = await fixture(t);
  const id = await f.store.enqueue({ kind: 'review', target: f.snap, requested: true, deliveryId: 'orphaned-running', headSha: f.snap.headSha });
  let flow = (await f.request('/claim')).body;
  flow = await f.step(flow, 'prepare');
  // This is the durable state left when the process dies after a phase is admitted.
  await f.store.beginWorkflowStep(id, flow.owner, 'generate');
  await f.restart();
  const lease = async () => (await f.pool.query('SELECT lease_until::text AS value FROM jobs WHERE id=$1', [id])).rows[0].value;
  const before = await lease();
  for (let i = 0; i < 3; i++) assert.equal((await f.status(flow)).status, 'running');
  assert.equal(await lease(), before, 'only the executing worker may extend a running phase lease');
  await f.pool.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [id]);
  const next = (await f.request('/claim')).body;
  assert.notEqual(next.owner, flow.owner); assert.equal(next.step, 'generate');
  assert.equal((await f.request(`/jobs/${id}/status`, { owner: flow.owner })).status, 409);
  flow = await finish(f, next);
  assert.equal(flow.status, 'completed'); assert.deepEqual(f.calls, ['initial_questions']);
});


test('manual retry rebuilds expired preparation artifacts for a review that exhausted crash retries without a result', async t => {
  const f = await fixture(t);
  const id = await f.store.enqueue({ kind: 'review', target: f.snap, requested: true, deliveryId: 'expired-artifacts', headSha: f.snap.headSha });
  let flow = (await f.request('/claim')).body;
  flow = await f.step(flow, 'prepare');
  await f.store.beginWorkflowStep(id, flow.owner, 'generate');
  await f.pool.query("UPDATE jobs SET attempts=3,lease_until=now()-interval '1 second' WHERE id=$1", [id]);
  assert.equal((await f.request('/claim')).body.available, false);
  assert.equal((await f.store.getJob(id)).state, 'failed');
  assert.equal((await f.store.getJob(id)).result, null);
  await rm(join(f.root, 'jobs', id), { recursive: true, force: true });
  assert.equal(await f.store.retry(id), true);
  flow = (await f.request('/claim')).body;
  assert.equal(flow.step, 'prepare', 'a manual retry without a durable result must rebuild its inputs');
  flow = await finish(f, flow);
  assert.equal(flow.status, 'completed'); assert.deepEqual(f.calls, ['initial_questions']);
  assert.equal((await f.store.getJob(id)).result.questions.length, 2);
});
