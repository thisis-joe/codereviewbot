import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { Store } from '../../dist/store.js';
import { Controller } from '../../dist/controller.js';
import { application } from '../../dist/application.js';
import { report, snapshot } from '../fixtures.mjs';
import { questionId } from '../../dist/learning.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
test('signed learning webhooks generate, resume, grade and reconcile lost replies through real PostgreSQL', async t => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate(); await pool.query('TRUNCATE deliveries,jobs,feedback,targets CASCADE');
  await store.enqueue({ kind: 'review', target: snapshot(), deliveryId: 'seed', headSha: snapshot().headSha });
  const seed = await store.claim(); await store.saveResult(seed.id, seed.owner, report(), {}, 0);
  const publishing = await store.claim(); await store.complete(publishing.id, publishing.owner);
  const config = { platform: 'github', instance: 'https://api.github.com', repository: 'joe/demo', botLogin: 'bot', webhookSecretEnv: 'HOOK_SECRET', webhookAuth: 'hmac', tokenEnv: 'TOKEN', enabled: true };
  const comments = [{ id: '50', surface: 'review', author: 'bot', body: '<!-- codereviewbot:finding:v1:CRB-0001 -->', url: '' }], calls = [], replies = []; let snap = snapshot(), loseReply = true;
  const platform = { config, snapshot: async () => ({ ...snap }), permission: async () => 'write', comments: async () => comments.filter(c => c.surface !== 'review'), inlineComments: async () => comments.filter(c => c.surface === 'review'), owned: c => c.author === 'bot',
    reply: async (number, body, parent, discussion) => { replies.push({ body, parent, discussion }); comments.push({ id: `bot-${replies.length}`, surface: parent ? 'review' : 'issue', parentId: parent ?? undefined, body, author: 'bot', url: '' }); if (loseReply) { loseReply = false; throw new Error('response lost after remote write'); } } };
  const workspaces = { prepare: async () => ({ policy: {}, context: { sourceDir: '/source', files: { 'src/pay.ts': 'function pay() {\ncharge();\n}' }, baseFiles: {}, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch: '@@ -1,3 +1,3 @@\n function pay() {\n+charge();\n }', lines: new Set([1, 2, 3]) } }, excluded: [], limited: false } }) };
  const questions = ['pay에서 같은 멱등 키를 사용하는 이유는 무엇인가요?', 'charge가 성공한 뒤 저장이 실패하면 어떤 복구 전략을 적용하나요?', '동시 pay 요청에 대한 멱등 기록은 어떻게 원자적으로 저장하나요?'].map((question, i) => ({ question, path: 'src/pay.ts', line: 2, side: 'RIGHT', options: i ? [] : [{ id: 'A', text: '중복 요청 식별' }, { id: 'B', text: '호출마다 새 승인' }] }));
  const model = { run: async (phase, prompt) => { calls.push({ phase, prompt }); return phase === 'questions' ? { questions } : { verdict: 'correct', explanation: '동일 요청을 식별한다는 답이 맞습니다.', expectedAnswer: '외부 승인 재시도에서 같은 키를 재사용해 중복 부작용을 방지합니다.', optionExplanations: [{ id: 'A', explanation: '같은 논리 요청을 식별합니다.' }, { id: 'B', explanation: '새 승인은 중복 결제를 만들 수 있습니다.' }], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '외부 결제 승인' }] }; } };
  let controller = new Controller(store, [platform], workspaces, model);
  // The HTTP application and signature verification remain real; only provider/model boundaries are fixtures.
  let server;
  const start = async () => { server = application(controller, [config], { INTERNAL_TOKEN: 'internal-test-secret', HOOK_SECRET: 'hook-test-secret' }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`; };
  t.after(() => server.close()); let base = await start();
  const submit = async (id, body, delivery = id, bot = false, surface = 'issue') => {
    const raw = JSON.stringify({ action: 'created', repository: { full_name: 'joe/demo' }, ...(surface === 'review' ? { pull_request: { number: 1 } } : { issue: { number: 1, pull_request: {} } }), comment: { id, body, ...(surface === 'review' ? { in_reply_to_id: 50 } : {}), user: { login: bot ? 'bot' : 'joe', type: bot ? 'Bot' : 'User' } } });
    const headers = { 'content-type': 'application/json', 'x-github-event': surface === 'review' ? 'pull_request_review_comment' : 'issue_comment', 'x-github-delivery': delivery, 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'hook-test-secret').update(raw).digest('hex') };
    if (!comments.some(c => c.id === id && c.surface === surface)) comments.push({ id, body, surface, author: bot ? 'bot' : 'joe', url: `${snap.webUrl}#${surface === 'review' ? 'discussion_r' : 'issuecomment-'}${id}` });
    assert.equal((await fetch(base + '/webhooks/github', { method: 'POST', headers, body: raw })).status, 202);
  };
  const tick = async () => { assert.equal((await fetch(base + '/internal/tick', { method: 'POST', headers: { authorization: 'Bearer internal-test-secret' } })).status, 202); await controller.active; };
  await submit('100', '더 알아보자'); await submit('100', '더 알아보자'); await tick();
  assert.equal(calls.length, 1); assert.equal(replies.length, 1);
  const saved = (await pool.query("SELECT * FROM jobs WHERE kind='command'")).rows;
  assert.equal(saved.length, 1); assert.equal(saved[0].state, 'queued'); assert.equal(saved[0].command_result.questions.length, 3);
  assert.ok(saved[0].command_result.body.includes('[요청 댓글](https://github.com/joe/demo/pull/1#issuecomment-100)'));
  await pool.query('UPDATE jobs SET due_at=now() WHERE id=$1', [saved[0].id]);
  await new Promise(resolve => server.close(resolve)); controller = new Controller(new Store(pool), [platform], workspaces, model); base = await start();
  await tick(); assert.equal(replies.length, 1); assert.equal(calls.length, 1); assert.equal((await store.getJob(saved[0].id)).state, 'completed');
  const id = replies[0].body.match(/codereviewbot:question:(Q-[a-f0-9]{12})/)[1];
  await submit('101', `/reviewbot answer ${id} A`); await tick();
  assert.equal(calls[1].phase, 'grade'); assert.equal(replies.length, 2); assert.match(replies[1].body, /정답/);
  assert.match(replies[1].body, /A\. 중복 요청 식별/); assert.match(replies[1].body, /B\. 호출마다 새 승인/);
  assert.equal(replies[1].parent, null); assert.equal((await store.learningBatches(snapshot())).length, 1);
  // Same numeric ID in the other GitHub comment resource is a different command.
  await submit('100', `/reviewbot answer ${id} A`, 'review-collision', false, 'review'); await tick();
  assert.equal(calls.length, 3); assert.equal(replies[2].parent, '50');
  assert.ok(replies[2].body.includes('codereviewbot:reply:review-100'));
  assert.ok(replies[2].body.includes('[요청 댓글](https://github.com/joe/demo/pull/1#discussion_r100)'));
  snap = snapshot({ headSha: 'c'.repeat(40) });
  await submit('102', `/reviewbot answer ${id} A`); await tick();
  assert.equal(calls.length, 3); assert.match(replies[3].body, /최신 리뷰/);
  await submit('103', '더 알아보자', 'bot-loop', true); await tick(); assert.equal(replies.length, 4);
});

test('answering every published question, right or wrong, clears the merge gate', async t => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate(); await pool.query('TRUNCATE deliveries,jobs,feedback,targets CASCADE');
  const seeded = report({ requireAnswers: true });
  await store.enqueue({ kind: 'review', target: snapshot(), deliveryId: 'seed', headSha: snapshot().headSha });
  const seed = await store.claim(); await store.saveResult(seed.id, seed.owner, seeded, {}, 0);
  const config = { platform: 'github', instance: 'https://api.github.com', repository: 'joe/demo', botLogin: 'bot', webhookSecretEnv: 'HOOK_SECRET', webhookAuth: 'hmac', tokenEnv: 'TOKEN', enabled: true };
  const comments = [], statuses = [];
  const platform = { config, snapshot: async () => snapshot(), permission: async () => 'write', comments: async () => comments, inlineComments: async () => [], owned: c => c.author === 'bot',
    comment: async (n, body, id) => { const existing = comments.find(c => c.id === id); if (existing) existing.body = body; else comments.push({ id: `bot-${comments.length}`, body, author: 'bot', surface: 'issue' }); },
    reply: async (n, body) => { comments.push({ id: `bot-${comments.length}`, body, author: 'bot', surface: 'issue' }); },
    gateStatus: async () => statuses.at(-1) ?? null, setGateStatus: async (s, gate) => { statuses.push(gate); } };
  const workspaces = { prepare: async () => ({ policy: {}, context: { sourceDir: '/source', files: { 'src/pay.ts': 'function pay() {\ncharge();\n}' }, baseFiles: {}, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch: '@@ -1,3 +1,3 @@\n function pay() {\n+charge();\n }', lines: new Set([1, 2, 3]) } }, excluded: [], limited: false } }) };
  const verdicts = ['incorrect', 'unverifiable', 'correct']; let graded = 0;
  const model = { run: async () => ({ verdict: verdicts[graded++ % 3], explanation: '설명', expectedAnswer: '권장 답변', optionExplanations: [], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '외부 결제 승인' }] }) };
  const controller = new Controller(store, [platform], workspaces, model);
  const server = application(controller, [config], { INTERNAL_TOKEN: 'internal-test-secret', HOOK_SECRET: 'hook-test-secret' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const tick = async () => { assert.equal((await fetch(base + '/internal/tick', { method: 'POST', headers: { authorization: 'Bearer internal-test-secret' } })).status, 202); await controller.active; };
  const submit = async (id, body) => {
    const raw = JSON.stringify({ action: 'created', repository: { full_name: 'joe/demo' }, issue: { number: 1, pull_request: {} }, comment: { id, body, user: { login: 'joe', type: 'User' } } });
    comments.push({ id, body, surface: 'issue', author: 'joe', url: '' });
    const headers = { 'content-type': 'application/json', 'x-github-event': 'issue_comment', 'x-github-delivery': `d-${id}`, 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'hook-test-secret').update(raw).digest('hex') };
    assert.equal((await fetch(base + '/webhooks/github', { method: 'POST', headers, body: raw })).status, 202);
    await tick();
  };
  await tick();
  assert.deepEqual(statuses.map(s => s.description), ['질문 답변 0/3 · /reviewbot answer Q-ID 내 답변']);
  const ids = seeded.questions.map(q => questionId(seeded.snapshot, q));
  await submit('200', `/reviewbot answer ${ids[0]} 모르겠습니다`);
  await submit('201', `/reviewbot answer ${ids[0]} 다시 답합니다`);
  await submit('202', `/reviewbot answer ${ids[1]} 키를 재사용합니다`);
  assert.equal(statuses.at(-1).state, 'pending'); assert.match(statuses.at(-1).description, /2\/3/);
  await submit('203', `/reviewbot answer ${ids[2]} 트랜잭션으로 묶습니다`);
  assert.equal(statuses.at(-1).state, 'success');
  assert.deepEqual(statuses.map(s => s.description.match(/\d\/3|모두/)[0]), ['0/3', '1/3', '2/3', '모두']);
  // Periodic recovery re-syncs the gate but does not repost an unchanged status.
  platform.openNumbers = async () => [1]; platform.target = number => ({ ...snapshot(), number }); platform.checks = async () => []; workspaces.cleanup = async () => {};
  await controller.recover();
  assert.equal(statuses.length, 4);
});
