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
  await pool.query('TRUNCATE mattermost_notifications,deliveries,jobs,targets CASCADE');
  const received = [], comments = [], authorReads = [];
  const receiver = createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    received.push(JSON.parse(Buffer.concat(parts).toString())); res.writeHead(responseStatus); res.end('ok');
  });
  await new Promise(resolve => receiver.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => receiver.close(resolve)));
  const config = { platform: 'gitlab', instance: 'https://gitlab.example', repository: 'team/project', botLogin: 'project_123_bot_hash', enabled: true, webhookAuth: 'secret', webhookSecretEnv: 'HOOK_SECRET', tokenEnv: 'TOKEN', mattermostWebhookEnv: 'MM_URL', mattermostChannel: 'ci' };
  const snap = snapshot({ ...config, number: 15, webUrl: 'https://gitlab.example/team/project/-/merge_requests/15' });
  const platform = { config, root: '/projects/team%2Fproject',
    api: { request: async path => {
      authorReads.push(path);
      if (path.includes('/repository/compare?')) return { commits: Array.from({ length: 24 }, (_, i) => ({
        id: (i + 1).toString(16).padStart(40, '0'), message: `feat: 변경 ${i + 1}`,
        created_at: new Date(Date.UTC(2026, 9, 23, 0, i)).toISOString(),
      })).reverse() };
      return { author: { name: '박찬형[부울경_1반_E102]팀원', username: 'login_must_not_appear' } };
    } },
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
  for (const [i, label] of ['**찬형**님이 **새 MR**을 열었어요. 📬', '**찬형**님이 **MR을 다시 열었어요.** 🔄', '**찬형**님의 **MR이 머지됐어요!** 🎉', '**찬형**님의 **MR이 닫혔어요.** 🗃️'].entries()) assert.ok(f.received[i].text.startsWith(`${label}\n`));
  assert.ok(f.received.every(p => p.username === 'hey' && p.channel === 'ci' && p.text.includes('[**MR !15 · docs\\(data\\): 대금 자료 조사**]')));
  assert.doesNotMatch(JSON.stringify(f.received), /송가연|merger_login|login_must_not_appear|project_123_bot|<!--/);
  const note = { repo: f.config, deliveryId: 'human-note', event: 'Note Hook', body: { object_kind: 'note', user: { username: 'human', name: '우동균' }, object_attributes: { id: 9, noteable_type: 'MergeRequest', action: 'create', note: '의견' }, merge_request: { iid: 15, title: '대금 자료 조사' } } };
  assert.equal((await post(note)).status, 202); await f.flush();
  assert.ok(f.received.at(-1).text.startsWith('**동균**님이 MR에 **댓글을 남겼어요.** 💬\n')); assert.ok(f.received.at(-1).text.includes('**](https://gitlab.example/team/project/-/merge_requests/15#note_9)')); assert.ok(f.received.at(-1).text.endsWith('\n\n*“의견”*'));
  assert.equal(await f.notifications.capture({ ...note, deliveryId: 'bot-note', body: { ...note.body, user: { username: f.config.botLogin } } }), false);
  assert.equal(await f.notifications.capture(f.event('update')), false);
  assert.equal(await f.notifications.capture(f.event('toString')), false);
  const disabled = new Mattermost(f.store, [f.platform], {}); assert.equal(await disabled.capture(f.event('open', 'disabled')), false);
  assert.equal((await post({ ...f.event('open', 'foreign'), body: { ...f.event('open').body, project: { path_with_namespace: 'other/project' } } })).status, 401);
  assert.equal((await f.pool.query('SELECT count(*) FROM mattermost_notifications')).rows[0].count, '5');
});

test('successful question publication queues one exact-comment notification per revision and skips failures', async t => {
  const f = await fixture(t), controller = new Controller(f.store, [f.platform], {}, {}, f.notifications);
  await f.store.enqueue({ kind: 'review', target: f.snap, headSha: f.snap.headSha, deliveryId: 'generation' });
  const running = await f.store.claim();
  const result = report({ snapshot: f.snap, questions: initialQuestions(), requireAnswers: false });
  await f.store.saveResult(running.id, running.owner, result, {}, 0);
  await controller.tick(); await controller.active; await f.notifications.active;
  assert.equal((await f.store.getJob(running.id)).state, 'completed');
  assert.equal(f.comments.length, 1); await f.flush();
  assert.equal(f.received.length, 1); assert.ok(f.received[0].text.startsWith('**찬형**님의 MR에 **질문이 준비됐어요.** 🧩\n[**MR !15 · '));
  assert.ok(f.received[0].text.endsWith('**](https://gitlab.example/team/project/-/merge_requests/15#note_321)'));
  assert.doesNotMatch(f.received[0].text, /질문 4개|일부 변경 제외/);
  for (const r of [result, { ...result, state: 'partial' }, { ...result, state: 'failed' }]) await f.notifications.questionsPublished(f.platform, r);
  await f.flush(); assert.equal(f.received.length, 1);
});

test('partial publication keeps count and limitations on GitLab while sending the same concise MM preparation notice', async t => {
  const f = await fixture(t), controller = new Controller(f.store, [f.platform], {}, {}, f.notifications);
  await f.store.enqueue({ kind: 'review', target: f.snap, headSha: f.snap.headSha, deliveryId: 'partial-generation' });
  const running = await f.store.claim();
  const result = report({ snapshot: f.snap, state: 'partial', questions: initialQuestions(), limitations: ['source size limit'], requireAnswers: false });
  await f.store.saveResult(running.id, running.owner, result, {}, 0);
  await controller.tick(); await controller.active; await f.flush();
  assert.equal(f.received.length, 1);
  assert.ok(f.received[0].text.startsWith('**찬형**님의 MR에 **질문이 준비됐어요.** 🧩\n[**MR !15 · '));
  assert.ok(f.received[0].text.endsWith('**](https://gitlab.example/team/project/-/merge_requests/15#note_321)'));
  assert.doesNotMatch(f.received[0].text, /질문 4개|일부 변경 제외|source size limit/);
  assert.match(f.comments[0].body, /부분 완료/);
  assert.match(f.comments[0].body, /답변 0\/4/);
  assert.match(f.comments[0].body, /source size limit/);
  assert.equal(f.received[0].text.split('\n').length, 2);
  for (const value of [result, { ...result, state: 'completed' }, { ...result, state: 'failed' }, { ...result, questions: [] }]) await f.notifications.questionsPublished(f.platform, value);
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

test('push events preserve the total count, deduplicate replay and ignore branch deletion and tags', async t => {
  const f = await fixture(t);
  const push = { repo: f.config, deliveryId: 'push-1', event: 'Push Hook', body: { object_kind: 'push', user_name: '박찬형[소속]팀원', user_username: 'must_not_appear', ref: 'refs/heads/feature/data', before: 'a'.repeat(40), after: 'b'.repeat(40), total_commits_count: 24, commits: Array(20).fill({}) } };
  const server = application(new Controller(f.store, [f.platform], {}, {}, f.notifications), [f.config], f.env);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  for (let replay = 0; replay < 2; replay++) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/webhooks/gitlab`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-gitlab-token': f.env.HOOK_SECRET, 'x-gitlab-event-uuid': push.deliveryId }, body: JSON.stringify({ ...push.body, project: { path_with_namespace: f.config.repository } }) });
    assert.equal(response.status, 202); assert.deepEqual(await response.json(), { admitted: 0 });
  }
  assert.equal((await f.pool.query('SELECT count(*) FROM mattermost_notifications')).rows[0].count, '1');
  await f.flush(); assert.equal(f.received.length, 1);
  assert.ok(f.received[0].text.startsWith('**찬형**님의 **커밋 24개**가 올라왔어요. 🚀\n[**feature/data**](https://gitlab.example/team/project/-/compare/'));
  assert.equal(f.received[0].text.split('\n').filter(line => line.startsWith('- ')).length, 24);
  assert.ok(f.received[0].text.indexOf('변경 1**') < f.received[0].text.indexOf('변경 24**'));
  assert.doesNotMatch(f.received[0].text, /must_not_appear|박찬형/);
  assert.equal(f.authorReads.length, 1);
  assert.equal(f.authorReads[0], `/projects/team%2Fproject/repository/compare?from=${push.body.before}&to=${push.body.after}&straight=true`);
  assert.equal(await f.notifications.capture({ ...push, deliveryId: 'branch-created', body: { ...push.body, before: '0'.repeat(40) } }), true);
  await f.flush(); assert.equal(f.received.length, 2);
  assert.equal(f.received[1].text, '**찬형**님의 **새 브랜치가 생겼어요.** 🌱\n[**feature/data**](https://gitlab.example/team/project/-/commits/feature%2Fdata)');
  for (const body of [{ ...push.body, after: '0'.repeat(40) }, { ...push.body, ref: 'refs/tags/v1' }, { ...push.body, after: 'https://evil.example' }])
    assert.equal(await f.notifications.capture({ ...push, deliveryId: 'ignored', body }), false);
});

test('commit lookup failures retry before any MM write', async t => {
  const f = await fixture(t);
  f.platform.api.request = async () => { throw new Error('GitLab unavailable'); };
  await f.notifications.capture({ repo: f.config, deliveryId: 'missing-commits', body: { object_kind: 'push', user_name: '박찬형', ref: 'refs/heads/feature/data', before: 'a'.repeat(40), after: 'b'.repeat(40), total_commits_count: 24, commits: [] } });
  await f.flush();
  assert.equal(f.received.length, 0);
  assert.equal((await f.pool.query('SELECT state FROM mattermost_notifications')).rows[0].state, 'queued');
});
