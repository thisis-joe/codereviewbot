import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { Store } from '../../dist/store.js';
import { Controller } from '../../dist/controller.js';
import { application } from '../../dist/application.js';
import { snapshot, initialQuestions, checked } from '../fixtures.mjs';
import { driveWorkflow } from '../workflow-driver.mjs';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');

for (const provider of ['github', 'gitlab']) test(`${provider}: signed interview commands persist, recover, grade and reveal alongside five supplementary batches`, async t => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate(); await pool.query('TRUNCATE deliveries,jobs,targets CASCADE');
  let snap = snapshot(provider === 'gitlab' ? { platform: provider, instance: 'https://gitlab.example', repository: 'joe/demo', webUrl: 'https://gitlab.example/joe/demo/-/merge_requests/1' } : {});
  const config = { platform: provider, instance: snap.instance, repository: snap.repository, botLogin: 'bot', webhookSecretEnv: 'INTERVIEW_HOOK_SECRET', webhookAuth: provider === 'github' ? 'hmac' : 'signing', tokenEnv: 'TOKEN', enabled: true };
  const signingKey = Buffer.alloc(32, 7), hookSecret = provider === 'github' ? 'interview-hook-secret' : 'whsec_' + signingKey.toString('base64');
  const comments = [], replies = [], calls = [];
  let sequence = 0, loseReply = true;
  const platform = { config, snapshot: async () => ({ ...snap }), permission: async () => 'write', owned: c => c.author === 'bot', comments: async () => comments, inlineComments: async () => [],
    deleteComment: async (_n, comment) => { const i = comments.indexOf(comment); assert.ok(i >= 0); comments.splice(i, 1); },
    reply: async (_n, body, parentId, discussionId, newThread) => {
      const comment = { id: `bot-${++sequence}`, body, author: 'bot', surface: newThread && provider === 'github' ? 'review' : provider === 'github' ? 'issue' : 'note', parentId,
        discussionId: newThread && provider === 'gitlab' ? `thread-${sequence}` : discussionId };
      comments.push(comment);
      if (body.includes('codereviewbot:ack:')) return;
      replies.push(comment);
      if (newThread && loseReply) { loseReply = false; throw new Error('reply response lost'); }
    } };
  const workspaces = { prepare: async () => ({ policy: {}, context: { sourceDir: '/source', files: { 'src/pay.ts': 'function pay() {\ncharge();\n}' }, baseFiles: {},
    diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch: '@@ -1,3 +1,3 @@\n function pay() {\n+charge();\n }', lines: new Set([1, 2, 3]) } }, excluded: [], limited: false } }) };
  const model = { run: async (phase, prompt) => {
    calls.push({ phase, prompt });
    const count = phase === 'csinterview' ? 2 : 5;
    return { questions: Array.from({ length: count }, (_, i) => (phase === 'csinterview' ? checked : x => x)({ ...initialQuestions()[0], level: 'advanced',
      question: `호출 ${calls.length}의 조건 ${i + 1}에서 멱등성(idempotency)의 보장은 무엇인가요?`,
      key: { ...initialQuestions()[0].key, explanation: '멱등성(idempotency)은 반복 호출의 효과가 같은 성질입니다. 이 코드는 동일 요청을 식별합니다.' } })),
      ...(phase === 'csinterview' ? { unavailableReason: null } : {}) };
  } };
  let controller = new Controller(store, [platform], workspaces, model), server;
  async function start() {
    server = application(controller, [config], { INTERNAL_TOKEN: 'interview-internal-secret', INTERVIEW_HOOK_SECRET: hookSecret });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`;
  }
  let base = await start(); t.after(() => server.close());
  async function submit(id, body, root) {
    const raw = JSON.stringify(provider === 'github'
      ? { action: 'created', repository: { full_name: snap.repository }, ...(root ? { pull_request: { number: 1 } } : { issue: { number: 1, pull_request: {} } }),
        comment: { id, body, ...(root ? { in_reply_to_id: root.id } : {}), user: { login: 'joe', type: 'User' } } }
      : { object_kind: 'note', project: { path_with_namespace: snap.repository }, merge_request: { iid: 1 }, user: { username: 'joe' },
        object_attributes: { id, note: body, noteable_type: 'MergeRequest', action: 'create', ...(root ? { discussion_id: root.discussionId } : {}) } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers = { 'content-type': 'application/json', ...(provider === 'github'
      ? { 'x-github-event': root ? 'pull_request_review_comment' : 'issue_comment', 'x-github-delivery': id, 'x-hub-signature-256': 'sha256=' + createHmac('sha256', hookSecret).update(raw).digest('hex') }
      : { 'x-gitlab-event': 'Note Hook', 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': 'v1,' + createHmac('sha256', signingKey).update(`${id}.${timestamp}.${raw}`).digest('base64') }) };
    assert.equal((await fetch(base + '/webhooks/' + provider, { method: 'POST', headers, body: raw })).status, 202);
  }
  const tick = () => driveWorkflow(base, 'interview-internal-secret');
  await submit('first-interview', '/hey csinterview'); await submit('first-interview', '/hey csinterview'); await tick();
  assert.equal(calls.length, 1); assert.equal(replies.length, 1);
  assert.match(replies[0].body, /^#### 면접1\./m); assert.doesNotMatch(replies[0].body, /반복 호출의 효과가 같은 성질/);
  const durable = (await pool.query("SELECT * FROM jobs WHERE kind='command'")).rows;
  assert.equal(durable.length, 1); assert.equal(durable[0].state, 'queued'); assert.equal(durable[0].command_result.batchKind, 'csinterview');
  await pool.query('UPDATE jobs SET due_at=now() WHERE id=$1', [durable[0].id]);
  await new Promise(resolve => server.close(resolve)); controller = new Controller(new Store(pool), [platform], workspaces, model); base = await start();
  await tick(); assert.equal(replies.length, 1); assert.equal(calls.length, 1);
  assert.equal((await store.getJob(durable[0].id)).state, 'completed');
  // More than six persisted batches must remain visible to both numbering and answer lookup.
  for (let i = 0; i < 5; i++) { await submit(`more-${i}`, '/hey whatelse'); await tick(); }
  await submit('second-interview', '/hey csinterview'); await tick();
  assert.equal(calls.length, 7); assert.equal((await store.learningBatches(snap)).length, 7);
  const second = replies.at(-1); assert.match(second.body, /^#### 면접3\./m);
  await submit('answer-interview', '/hey answer 면접3 B'); await tick();
  assert.match(replies.at(-1).body, /^### 면접3 · ✅ 정답$/m);
  assert.match(replies.at(-1).body, /멱등성.*idempotency/); assert.equal(calls.length, 7);
  for (const root of [replies[0], second]) {
    await submit(`reveal-${root.id}`, '/hey showanswer', root); await tick();
    assert.equal([...replies.at(-1).body.matchAll(/^#### 면접\d+\./gm)].length, 2);
    assert.doesNotMatch(replies.at(-1).body, /^#### (?:Q|심화)\d+\./m);
    assert.match(replies.at(-1).body, /멱등성.*idempotency/);
  }
  assert.equal(calls.length, 7);
  const grades = (await pool.query("SELECT command_result FROM jobs WHERE command_result->'grades' IS NOT NULL")).rows;
  assert.equal(grades.length, 1, 'reveal never records grade credit');
  assert.equal(grades[0].command_result.grades[0].verdict, 'correct');
  snap = { ...snap, headSha: 'c'.repeat(40) };
  await submit('stale-answer', '/hey answer 면접3 B'); await tick();
  assert.equal(calls.length, 7); assert.match(replies.at(-1).body, /최신 질문/);
});
