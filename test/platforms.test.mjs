import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { authenticate, normalize } from '../dist/webhooks.js';
import { Platform } from '../dist/platform.js';

const repo = { platform: 'github', instance: 'https://api.github.com', repository: 'joe/demo', botLogin: 'reviewbot[bot]', webhookSecretEnv: 'HOOK_SECRET', tokenEnv: 'TOKEN', webhookAuth: 'hmac' };
const raw = JSON.stringify({ action: 'synchronize', repository: { full_name: 'joe/demo' }, pull_request: { number: 7, head: { sha: 'b'.repeat(40) } } });
test('GitHub authenticates original bytes before admitting an allowed repository', () => {
  const headers = { 'x-github-event': 'pull_request', 'x-github-delivery': 'delivery-1', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'test-secret').update(raw).digest('hex') };
  const event = authenticate('github', headers, Buffer.from(raw), [repo], { HOOK_SECRET: 'test-secret' });
  assert.equal(normalize(event)[0].target.number, 7);
  assert.throws(() => authenticate('github', headers, Buffer.from(raw + ' '), [repo], { HOOK_SECRET: 'test-secret' }));
  assert.throws(() => authenticate('github', headers, Buffer.from(raw), [{ ...repo, repository: 'other/demo' }], { HOOK_SECRET: 'test-secret' }));
});
test('GitLab signing validation checks timestamp and does not fall back to a secret header', () => {
  const body = JSON.stringify({ object_kind: 'merge_request', project: { path_with_namespace: 'group/demo' }, object_attributes: { iid: 4, action: 'update', oldrev: 'a'.repeat(40), last_commit: { id: 'b'.repeat(40) } } });
  const key = Buffer.alloc(32, 7), timestamp = '1700000000';
  const headers = { 'webhook-id': 'message-4', 'webhook-timestamp': timestamp, 'webhook-signature': 'v1,' + createHmac('sha256', key).update(`message-4.${timestamp}.${body}`).digest('base64'), 'x-gitlab-token': 'legacy', 'x-gitlab-event': 'Merge Request Hook' };
  const config = { ...repo, platform: 'gitlab', repository: 'group/demo', webhookAuth: 'signing' };
  const env = { HOOK_SECRET: 'whsec_' + key.toString('base64') };
  assert.equal(normalize(authenticate('gitlab', headers, Buffer.from(body), [config], env, 1700000000))[0].kind, 'review');
  assert.throws(() => authenticate('gitlab', headers, Buffer.from(body), [config], env, 1700000500));
  assert.throws(() => authenticate('gitlab', { ...headers, 'webhook-signature': 'wrong' }, Buffer.from(body), [config], env, 1700000000));
});
test('bot comments and metadata-only MR updates cannot create review loops', () => {
  const event = { repo, deliveryId: 'd', event: 'issue_comment', body: { action: 'created', issue: { number: 1, pull_request: {} }, comment: { id: 1, body: '/reviewbot full', user: { login: 'reviewbot[bot]', type: 'Bot' } } } };
  assert.deepEqual(normalize(event), []);
  assert.deepEqual(normalize({ ...event, repo: { ...repo, platform: 'gitlab' }, event: 'Merge Request Hook', body: { object_kind: 'merge_request', object_attributes: { iid: 1, action: 'update' } } }), []);
});
test('provider preserves native GitLab refs and creates correctly positioned discussion', async t => {
  let posted, webRoot;
  const server = createServer(async (req, res) => {
    assert.equal(req.headers['private-token'], 'test-token');
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST') { let body = ''; for await (const part of req) body += part; posted = JSON.parse(body); res.end('{"id":"discussion-1"}'); }
    else res.end(JSON.stringify({ iid: 4, state: 'opened', title: 'change', description: '', web_url: webRoot + '/group/demo/-/merge_requests/4', diff_refs: { base_sha: 'a'.repeat(40), start_sha: 'c'.repeat(40), head_sha: 'b'.repeat(40) } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  webRoot = `https://127.0.0.1:${server.address().port}`;
  const config = { ...repo, platform: 'gitlab', instance: `http://127.0.0.1:${server.address().port}`, repository: 'group/demo' };
  const provider = new Platform(config, async () => 'test-token');
  const snap = await provider.snapshot(4);
  assert.equal(snap.startSha, 'c'.repeat(40));
  await provider.inline(snap, { path: 'src/new.ts', oldPath: 'src/old.ts', line: 9, body: 'finding', suggestion: null });
  assert.equal(posted.position.start_sha, 'c'.repeat(40));
  assert.equal(posted.position.base_sha, 'a'.repeat(40));
  assert.equal(posted.position.old_path, 'src/old.ts');
  assert.equal(posted.position.new_line, 9);
});
