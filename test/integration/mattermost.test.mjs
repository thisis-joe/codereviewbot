import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import pg from 'pg';
import { Store } from '../../dist/store.js';
import { Mattermost } from '../../dist/mattermost.js';
import { Controller } from '../../dist/controller.js';
import { application } from '../../dist/application.js';
import { snapshot, report, initialQuestions } from '../fixtures.mjs';

async function fixture(t, responseStatus = 200) {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate();
  await pool.query('TRUNCATE mattermost_notifications,deliveries,jobs,feedback,targets CASCADE');
  const received = [], comments = [], authorReads = [];
  const receiver = createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    received.push(JSON.parse(Buffer.concat(parts).toString())); res.writeHead(responseStatus); res.end('ok');
  });
  await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => receiver.close(resolve)));
  const config = { platform: 'gitlab', instance: 'https://gitlab.example', repository: 'team/project', botLogin: 'project_123_bot_hash', enabled: true, webhookAuth: 'secret', webhookSecretEnv: 'HOOK_SECRET', tokenEnv: 'TOKEN', mattermostWebhookEnv: 'MM_URL', mattermostChannel: 'ci' };
  const snap = snapshot({ ...config, number: 15, webUrl: 'https://gitlab.example/team/project/-/merge_requests/15' });
  const platform = { config, root: '/projects/team%2Fproject',
    api: { request: async path => { authorReads.push(path); return { author: { name: '박찬형[부울경_1반_E102]팀원', username: 'login_must_not_appear' } }; } },
    snapshot: async () => snap, comments: async () => comments, inlineComments: async () => [], owned: c => c.author === config.botLogin,
    comment: async (number, body, id) => { const c = comments.find(c => c.id === id); if (c) c.body = body; else comments.push({ id: '321', body, author: config.botLogin, surface: 'note' }); },
  };
  const env = { MM_URL: 'https://mm.example/hooks/test', HOOK_SECRET: 'fixture-secret', INTERNAL_TOKEN: 'internal-fixture-secret' };
  const transport = async (url, init) => {
    assert.equal(url, env.MM_URL); assert.equal(init.redirect, 'error');
    return fetch(`http://127.0.0.1:${receiver.address().port}`, init);
  };
  const notifications = new Mattermost(store, [platform], env, transport);
  const flush = async (n = notifications) => { n.tick(); await n.active; };
  const event = (action, deliveryId = action) => ({ repo: config, deliveryId, event: 'Merge Request Hook', body: { object_kind: 'merge_request', user: { name: '송가연', username: 'merger_login' }, object_attributes: { action, iid: 15, title: 'docs(data): 대금 자료 조사', author_id: 7 } } });
  return { pool, store, received, comments, authorReads, platform, config, snap, env, transport, notifications, flush, event };
}

test('authenticated GitLab admission sends distinct MR events once, identifies the MR author and keeps human comments', async t => {
  const f = await fixture(t);
  const controller = new Controller(f.store, [f.platform], {}, {}, f.notifications);
  const server = application(controller, [f.config], f.env);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const post = async (event, secret = f.env.HOOK_SECRET) => fetch(`http://127.0.0.1:${server.address().port}/webhooks/gitlab`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-token': secret, 'x-gitlab-event-uuid': event.deliveryId },
    body: JSON.stringify({ ...event.body, project: event.body.project ?? { path_with_namespace: f.config.repository } }),
  });
  assert.equal((await post(f.event('open'), 'wrong')).status, 401);
  assert.equal((await f.pool.query('SELECT count(*) FROM mattermost_notifications')).rows[0].count, '0');
  for (const action of ['open', 'reopen', 'merge', 'close']) {
    for (let replay = 0; replay < 2; replay++) assert.equal((await post(f.event(action))).status, 202);
    await Promise.all([f.flush(), f.flush()]);
  }
  assert.equal(f.received.length, 4);
  for (const [i, label] of ['열렸어요', '다시 열렸어요', '머지 완료', '닫혔어요'].entries()) assert.ok(f.received[i].text.includes(label));
  assert.ok(f.received.every(p => p.username === 'hey' && p.channel === 'ci' && p.text.includes('찬형님의 MR !15')));
  assert.doesNotMatch(JSON.stringify(f.received), /송가연|merger_login|login_must_not_appear|project_123_bot|<!--/);
  const note = { repo: f.config, deliveryId: 'human-note', event: 'Note Hook', body: { object_kind: 'note', user: { username: 'human' }, object_attributes: { id: 9, noteable_type: 'MergeRequest', action: 'create', note: '의견' }, merge_request: { iid: 15, title: '대금 자료 조사' } } };
  assert.equal((await post(note)).status, 202); await f.flush();
  assert.match(f.received.at(-1).text, /새 댓글이 달렸어요/); assert.ok(f.received.at(-1).text.endsWith('#note_9)'));
  assert.equal(await f.notifications.capture({ ...note, deliveryId: 'bot-note', body: { ...note.body, user: { username: f.config.botLogin } } }), false);
  assert.equal(await f.notifications.capture(f.event('update')), false);
  assert.equal(await f.notifications.capture(f.event('toString')), false);
  const disabled = new Mattermost(f.store, [f.platform], {}); assert.equal(await disabled.capture(f.event('open', 'disabled')), false);
  assert.equal((await post({ ...f.event('open', 'foreign'), body: { ...f.event('open').body, project: { path_with_namespace: 'other/project' } } })).status, 401);
  assert.equal((await f.pool.query('SELECT count(*) FROM mattermost_notifications')).rows[0].count, '5');
});

test('successful question publication queues one exact-comment notification per revision and skips partial or failed runs', async t => {
  const f = await fixture(t), controller = new Controller(f.store, [f.platform], {}, {}, f.notifications);
  await f.store.enqueue({ kind: 'review', target: f.snap, headSha: f.snap.headSha, deliveryId: 'generation' });
  const running = await f.store.claim();
  const result = report({ snapshot: f.snap, questions: initialQuestions(), requireAnswers: false });
  await f.store.saveResult(running.id, running.owner, result, {}, 0);
  await controller.tick(); await controller.active; await f.notifications.active;
  assert.equal((await f.store.getJob(running.id)).state, 'completed');
  assert.equal(f.comments.length, 1); await f.flush();
  assert.equal(f.received.length, 1); assert.match(f.received[0].text, /찬형님의 MR !15 · 질문 4개 준비됐어요/);
  assert.ok(f.received[0].text.endsWith('#note_321)'));
  for (const r of [result, { ...result, state: 'partial' }, { ...result, state: 'failed' }]) await f.notifications.questionsPublished(f.platform, r);
  await f.flush(); assert.equal(f.received.length, 1);
});

test('MM delivery survives a restart without repeating unknown writes and retries only explicit rejection', async t => {
  const f = await fixture(t);
  const lossy = new Mattermost(f.store, [f.platform], f.env, async (...args) => { await f.transport(...args); throw new Error('Response lost after acceptance'); });
  await lossy.capture(f.event('merge')); await f.flush(lossy);
  assert.equal(f.received.length, 1); assert.equal((await f.pool.query('SELECT state FROM mattermost_notifications')).rows[0].state, 'uncertain');
  const restarted = new Mattermost(f.store, [f.platform], f.env, f.transport); await f.flush(restarted); assert.equal(f.received.length, 1);
  const limited = new Mattermost(f.store, [f.platform], f.env, async () => new Response('limited', { status: 429 }));
  await limited.capture(f.event('open')); await f.flush(limited);
  assert.equal((await f.pool.query("SELECT state FROM mattermost_notifications WHERE state='queued'")).rowCount, 1);
  await f.pool.query("UPDATE mattermost_notifications SET due_at=now() WHERE state='queued'"); await f.flush(restarted);
  assert.equal(f.received.length, 2);
  await restarted.capture(f.event('close'));
  await f.pool.query("UPDATE mattermost_notifications SET state='sending',lease_until=now()-interval '1 second' WHERE state='queued'");
  await f.flush(restarted); assert.equal(f.received.length, 2);
  assert.equal((await f.pool.query("SELECT count(*) FROM mattermost_notifications WHERE state='uncertain'")).rows[0].count, '2');
});
