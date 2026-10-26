import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { Store } from '../../dist/store.js';
import { Controller } from '../../dist/controller.js';
import { application } from '../../dist/application.js';
import { snapshot, initialQuestions } from '../fixtures.mjs';
import { driveWorkflow } from '../workflow-driver.mjs';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');

for (const provider of ['github', 'gitlab']) test(`${provider}: chained morecs batches persist labels and anchors, grade mixed answers and reveal per thread`, async t => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate(); await pool.query('TRUNCATE deliveries,jobs,targets CASCADE');
  let snap = snapshot(provider === 'gitlab' ? { platform: provider, instance: 'https://gitlab.example', repository: 'joe/demo', webUrl: 'https://gitlab.example/joe/demo/-/merge_requests/1' } : {});
  const config = { platform: provider, instance: snap.instance, repository: snap.repository, botLogin: 'bot', webhookSecretEnv: 'MORECS_HOOK_SECRET', webhookAuth: provider === 'github' ? 'hmac' : 'signing', tokenEnv: 'TOKEN', enabled: true };
  const signingKey = Buffer.alloc(32, 9), hookSecret = provider === 'github' ? 'morecs-hook-secret' : 'whsec_' + signingKey.toString('base64');
  const comments = [], replies = [], calls = [];
  let sequence = 0;
  const platform = { config, snapshot: async () => ({ ...snap }), permission: async () => 'write', owned: c => c.author === 'bot', comments: async () => comments, inlineComments: async () => [],
    deleteComment: async (_n, comment) => { const i = comments.indexOf(comment); assert.ok(i >= 0); comments.splice(i, 1); },
    reply: async (_n, body, parentId, discussionId, newThread) => {
      const comment = { id: `bot-${++sequence}`, body, author: 'bot', surface: newThread && provider === 'github' ? 'review' : provider === 'github' ? 'issue' : 'note', parentId,
        discussionId: newThread && provider === 'gitlab' ? `thread-${sequence}` : discussionId };
      comments.push(comment); if (!body.includes('codereviewbot:ack:')) replies.push(comment);
    } };
  const workspaces = { prepare: async () => ({ policy: {}, context: { sourceDir: '/source', files: { 'src/pay.ts': 'function pay() {\ncharge();\n}' }, baseFiles: {},
    diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch: '@@ -1,3 +1,3 @@\n function pay() {\n+charge();\n }', lines: new Set([1, 2, 3]) } }, excluded: [], limited: false } }) };
  const base = initialQuestions()[0];
  const question = (text, extra = {}) => ({ ...base, level: 'advanced', question: text, key: { ...base.key, explanation: '멱등성(idempotency)은 반복 적용의 효과가 같은 성질입니다.' }, ...extra });
  const model = { run: async (phase, prompt) => {
    calls.push({ phase, prompt }); const n = calls.length;
    if (phase === 'csinterview') return { questions: [question(`면접 ${n}-1?`), question(`면접 ${n}-2?`)], unavailableReason: null };
    const anchors = JSON.parse(prompt.split('출제 자료(JSON 데이터):\n')[1]).anchorBatch.map(a => a.label);
    const interview = anchors.filter(l => l.startsWith('면접'));
    // First run: 3 follow-ups + 1 new interview question; later runs: 4 follow-ups that cover every 면접 anchor first.
    if (n === 2) return { questions: [question(`꼬리 ${n}-a?`, { kind: 'followup', anchor: interview[0] }), question(`꼬리 ${n}-b?`, { kind: 'followup', anchor: interview[1] }), question(`꼬리 ${n}-c?`, { kind: 'followup', anchor: interview[1] }),
      question(`새 면접 ${n}?`, { kind: 'interview', anchor: null, key: { ...base.key, answer: 'C' } })], unavailableReason: null };
    const targets = [...interview, ...anchors.filter(a => !interview.includes(a))].slice(0, 4);
    while (targets.length < 4) targets.push(anchors[0]);
    return { questions: targets.map((a, i) => question(`꼬리 ${n}-${i}?`, { kind: 'followup', anchor: a })), unavailableReason: null };
  } };
  let controller = new Controller(store, [platform], workspaces, model), server;
  async function start() {
    server = application(controller, [config], { INTERNAL_TOKEN: 'morecs-internal-secret', MORECS_HOOK_SECRET: hookSecret });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${server.address().port}`;
  }
  let url = await start(); t.after(() => server.close());
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
    assert.equal((await fetch(url + '/webhooks/' + provider, { method: 'POST', headers, body: raw })).status, 202);
  }
  const tick = () => driveWorkflow(url, 'morecs-internal-secret');

  await submit('early-morecs', '/hey morecs'); await tick();
  assert.equal(calls.length, 0); assert.match(replies.at(-1).body, /`\/hey csinterview`/);
  await submit('interview', '/hey csinterview'); await tick();
  await submit('morecs-1', '/hey morecs'); await submit('morecs-1', '/hey morecs'); await tick();
  assert.equal(calls.length, 2, 'duplicate delivery generates once');
  const first = replies.at(-1);
  assert.deepEqual([...first.body.matchAll(/^#### ((?:꼬리|면접)\d+)\./gm)].map(m => m[1]), ['꼬리1', '꼬리2', '꼬리3', '면접3']);
  assert.match(first.body, /^#### 꼬리1\. .*\n\n↳ 면접1에서 이어짐$/m);
  // A restarted controller keeps the durable labels and continues numbering from them.
  await new Promise(resolve => server.close(resolve)); controller = new Controller(new Store(pool), [platform], workspaces, model); url = await start();
  await submit('morecs-2', '/hey morecs'); await tick();
  const second = replies.at(-1);
  assert.deepEqual([...second.body.matchAll(/^#### ((?:꼬리|면접)\d+)\./gm)].map(m => m[1]), ['꼬리4', '꼬리5', '꼬리6', '꼬리7']);
  assert.match(second.body, /↳ 면접3에서 이어짐/, 'the new interview question of the anchor batch gets a follow-up');
  const stored = (await pool.query("SELECT command_result FROM jobs WHERE command_result->>'batchKind'='morecs' ORDER BY created_at")).rows.map(r => r.command_result);
  assert.deepEqual(stored.map(r => r.labels), [['꼬리1', '꼬리2', '꼬리3', '면접3'], ['꼬리4', '꼬리5', '꼬리6', '꼬리7']]);
  assert.equal(JSON.parse(calls[2].prompt.split('출제 자료(JSON 데이터):\n')[1]).anchorBatch.length, 4);

  await submit('mixed', '/hey answer 꼬리2 B 면접3 C'); await tick();
  assert.match(replies.at(-1).body, /^### 꼬리2 · ✅ 정답$/m); assert.match(replies.at(-1).body, /^### 면접3 · ✅ 정답$/m);
  assert.equal(calls.length, 3, 'bare letters grade from stored keys');
  await submit('reveal-first', '/hey showanswer', first); await tick();
  assert.deepEqual([...replies.at(-1).body.matchAll(/^#### ((?:꼬리|면접)\d+)\./gm)].map(m => m[1]), ['꼬리1', '꼬리2', '꼬리3', '면접3']);
  assert.match(replies.at(-1).body, /↳ 면접2에서 이어짐/);
  const grades = (await pool.query("SELECT command_result FROM jobs WHERE command_result->'grades' IS NOT NULL")).rows;
  assert.equal(grades.length, 1, 'reveal never records grade credit');

  for (let i = 0; i < 3; i++) { await submit(`morecs-more-${i}`, '/hey morecs'); await tick(); }
  await submit('morecs-over', '/hey morecs'); await tick();
  assert.equal(calls.length, 6); assert.match(replies.at(-1).body, /꼬리 질문은 5회까지/);
  snap = { ...snap, headSha: 'c'.repeat(40) };
  await submit('stale', '/hey answer 꼬리2 B'); await tick();
  assert.match(replies.at(-1).body, /현재 코드 기준의 학습 질문이 준비되지 않았습니다/); assert.equal(calls.length, 6);
});
