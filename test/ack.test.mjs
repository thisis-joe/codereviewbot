import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../dist/controller.js';
import { snapshot } from './fixtures.mjs';

const target = { platform: 'github', instance: 'https://api.github.com', repository: 'joe/demo', number: 1 };
function harness(body, overrides = {}) {
  const data = { remote: [], replies: [], deleted: [], edited: [], logs: [], state: 'queued', permission: 'write', ...overrides };
  const comment = { id: 'human1', author: 'joe', body, parentId: null, discussionId: null, surface: 'issue' };
  const job = { id: '20000000-0000-4000-8000-000000000001', owner: 'owner', kind: 'command', state: 'running', attempts: 1, body: { kind: 'command', target, deliveryId: 'd1', comment } };
  const platform = { config: { ...target, botLogin: 'bot' }, owned: c => c.author === 'bot', permission: async () => { if (data.permissionError) throw data.permissionError; return data.permission; },
    comments: async () => data.remote, inlineComments: async () => [], snapshot: async () => snapshot(),
    reply: async (number, text, parentId, discussionId) => { data.replies.push({ text, parentId, discussionId }); data.remote.push({ id: `bot${data.remote.length}`, body: text, author: 'bot', surface: 'issue' }); },
    deleteComment: async (number, c) => { data.deleted.push(c.id); data.remote = data.remote.filter(r => r.id !== c.id); },
    editComment: async (number, c, text) => { data.edited.push({ id: c.id, text }); data.remote.find(r => r.id === c.id).body = text; } };
  const store = { getJob: async () => ({ ...job, state: data.state }), setPaused: async () => {}, enqueue: async () => 'x', complete: async () => {}, heartbeat: async () => {}, assertLease: async () => {},
    fail: async () => { data.failed = true; }, supersede: async () => {} };
  const controller = new Controller(store, [platform], {}, {});
  return { data, job, controller, event: { kind: 'command', target, deliveryId: 'd1', comment } };
}
async function captureErrors(fn) {
  const original = console.error, logs = []; console.error = line => logs.push(String(line));
  try { await fn(); } finally { console.error = original; } return logs;
}

test('an explicit command gets a received notice in its thread, and plain comments or outsiders get none', async () => {
  const h = harness('/reviewbot pause'); await h.controller.acknowledge(h.event, h.job.id);
  assert.equal(h.data.replies.length, 1); assert.match(h.data.replies[0].text, /요청을 접수했습니다/); assert.match(h.data.replies[0].text, /codereviewbot:ack:issue-human1/);
  const mention = harness('@bot 이 함수는 왜 바뀌었나요?'); await mention.controller.acknowledge(mention.event, mention.job.id);
  assert.equal(mention.data.replies.length, 1);
  for (const [body, extra] of [['좋아 보입니다', {}], ['/reviewbot pause', { permission: 'none' }]]) {
    const h2 = harness(body, extra); await h2.controller.acknowledge(h2.event, h2.job.id); assert.equal(h2.data.replies.length, 0);
  }
});

test('a finished command deletes its received notice after replying', async () => {
  const h = harness('/reviewbot pause'); await h.controller.acknowledge(h.event, h.job.id);
  await h.controller.perform(h.job);
  assert.deepEqual(h.data.deleted, ['bot0']);
  assert.equal(h.data.remote.length, 1); assert.match(h.data.remote[0].body, /자동 (?:리뷰를|질문 생성을) 일시정지했습니다/);
});

test('a notice posted after its command already finished is removed at once', async () => {
  const h = harness('/reviewbot pause', { state: 'completed' }); await h.controller.acknowledge(h.event, h.job.id);
  assert.deepEqual(h.data.deleted, ['bot0']);
});

test('the last failed attempt turns the notice into a failure notice', async () => {
  const h = harness('/reviewbot pause', { permissionError: new Error('Platform credential unavailable') });
  h.data.remote.push({ id: 'ack', body: '<!-- codereviewbot:ack:issue-human1 -->\n⏳ 요청을 접수했습니다.', author: 'bot', surface: 'issue' });
  const early = await captureErrors(() => h.controller.perform(h.job));
  assert.equal(h.data.edited.length, 0, 'earlier attempts keep the received notice while retrying');
  await captureErrors(() => h.controller.perform({ ...h.job, attempts: 3 }));
  assert.equal(h.data.edited.length, 1); assert.match(h.data.edited[0].text, /요청을 처리하지 못했습니다/);
});


test('received notice cleanup ignores foreign comments and deletes duplicate platform views once', async () => {
  const h = harness('/reviewbot pause');
  const own = { id: 'owned', body: '<!-- codereviewbot:ack:issue-human1 -->', author: 'bot', surface: 'issue' };
  h.data.remote.push(own, { ...own, id: 'foreign', author: 'someone-else' });
  h.controller.platforms[0].inlineComments = async () => [{ ...own }];
  await h.controller.perform(h.job);
  assert.deepEqual(h.data.deleted, ['owned']);
  assert.ok(h.data.remote.some(c => c.id === 'foreign'));
});
