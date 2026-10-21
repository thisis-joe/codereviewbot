import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { Store } from '../../dist/store.js';
import { Controller } from '../../dist/controller.js';
import { application } from '../../dist/application.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
for (const provider of ['github', 'gitlab']) test(`${provider} signed help commands work while paused with no report and reconcile a lost reply`, async t => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate(); await pool.query('TRUNCATE deliveries,jobs,feedback,targets CASCADE');
  const config = { platform: provider, instance: provider === 'github' ? 'https://api.github.com' : 'https://gitlab.example.com', repository: 'joe/demo', botLogin: 'bot', webhookSecretEnv: 'HELP_HOOK_SECRET', webhookAuth: provider === 'github' ? 'hmac' : 'signing', tokenEnv: 'TOKEN', enabled: true };
  const target = { platform: provider, instance: config.instance, repository: config.repository, number: 1 };
  await store.enqueue({ kind: 'review', target, deliveryId: 'paused-review', headSha: 'b'.repeat(40) });
  await store.setPaused(target, true);
  const comments = [], replies = [], forbidden = () => { throw new Error('help must not access code or inference'); };
  let loseReply = true;
  const platform = { config, permission: async () => 'write', comments: async () => comments, inlineComments: async () => [], owned: c => c.author === 'bot', snapshot: forbidden,
    reply: async (_number, body, parent, discussion) => {
      replies.push({ body, parent, discussion }); comments.push({ id: 'bot-help', author: 'bot', surface: provider === 'github' ? 'issue' : 'note', body });
      if (loseReply) { loseReply = false; throw new Error('response lost after remote write'); }
    } };
  let controller = new Controller(store, [platform], { prepare: forbidden }, { run: forbidden });
  const hookSecret = provider === 'github' ? 'help-test-secret' : Buffer.from('help-signature-fixture-secret').toString('base64');
  const server = application(controller, [config], { INTERNAL_TOKEN: 'internal-help-test', HELP_HOOK_SECRET: hookSecret });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const raw = JSON.stringify(provider === 'github'
    ? { action: 'created', repository: { full_name: 'joe/demo' }, issue: { number: 1, pull_request: {} }, comment: { id: 100, body: '/reviewbot help', user: { login: 'joe', type: 'User' } } }
    : { object_kind: 'note', project: { path_with_namespace: 'joe/demo' }, merge_request: { iid: 1 }, user: { username: 'joe' }, object_attributes: { id: 100, note: '/reviewbot help', noteable_type: 'MergeRequest', action: 'create', discussion_id: 'help-discussion' } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = { 'content-type': 'application/json', ...(provider === 'github'
    ? { 'x-github-event': 'issue_comment', 'x-github-delivery': 'help-delivery', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', hookSecret).update(raw).digest('hex') }
    : { 'x-gitlab-event': 'Note Hook', 'webhook-id': 'help-delivery', 'webhook-timestamp': timestamp, 'webhook-signature': 'v1,' + createHmac('sha256', Buffer.from(hookSecret, 'base64')).update(`help-delivery.${timestamp}.${raw}`).digest('base64') }) };
  for (let i = 0; i < 2; i++) assert.equal((await fetch(`${base}/webhooks/${provider}`, { method: 'POST', headers, body: raw })).status, 202);
  const tick = async () => { await controller.tick(); await controller.active; };
  await tick(); assert.equal(replies.length, 1);
  const command = (await pool.query("SELECT id,state FROM jobs WHERE kind='command'")).rows;
  assert.equal(command.length, 1); assert.equal(command[0].state, 'queued');
  await pool.query('UPDATE jobs SET due_at=now() WHERE id=$1', [command[0].id]);
  controller = new Controller(store, [platform], { prepare: forbidden }, { run: forbidden });
  await tick(); assert.equal(replies.length, 1);
  assert.equal((await store.getJob(command[0].id)).state, 'completed');
  assert.match(replies[0].body, /^\| 명령어 \| 뜻 \| 설명 \| 사용 예시 \|$/m);
  assert.equal([...replies[0].body.matchAll(/^\| (?:`\/reviewbot|`@reviewbot)/gm)].length, 13);
  assert.equal(replies[0].discussion, provider === 'gitlab' ? 'help-discussion' : null);
  const state = await store.getTarget(target); assert.equal(state.paused, true); assert.equal(state.report, null);
  assert.equal((await pool.query("SELECT state FROM jobs WHERE kind='review'")).rows[0].state, 'queued');
});
