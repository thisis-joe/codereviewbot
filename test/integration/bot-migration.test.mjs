import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { Store } from '../../dist/store.js';
import { Controller } from '../../dist/controller.js';
import { renderReport, renderQuestionThread, replyMarker } from '../../dist/render.js';
import { publish } from '../../dist/publish.js';
import { questionId } from '../../dist/learning.js';
import { report, snapshot } from '../fixtures.mjs';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
async function fixture(t) {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate(); await pool.query('TRUNCATE deliveries,jobs,targets CASCADE');
  const snap = snapshot({ platform: 'gitlab', instance: 'https://gitlab.example', repository: 'team/demo', webUrl: 'https://gitlab.example/team/demo/-/merge_requests/1' });
  const value = report({ snapshot: snap });
  const id = await store.enqueue({ kind: 'review', target: snap, deliveryId: 'seed' });
  const running = await store.claim(); await store.saveResult(id, running.owner, value, {}, 0);
  const publishing = await store.claim(); await store.complete(id, publishing.owner);
  const comments = [{ id: '10', surface: 'note', author: 'old-bot', body: renderReport(value), url: '' }];
  const inline = value.questions.map((q, i) => ({ id: String(11 + i), surface: 'note', author: 'old-bot', discussionId: i ? `thread-${i}` : 'thread', body: renderQuestionThread(q, snap, i + 1), url: '' }));
  const writes = [];
  const platform = { config: { ...snap, botLogin: 'hey-bot', retiredBotLogins: ['old-bot'] },
    owned: c => c.author === 'hey-bot', permission: async () => 'write', snapshot: async () => snap,
    comments: async () => comments, inlineComments: async () => inline,
    comment: async (n, body, oldId) => { assert.ok(!oldId || comments.find(c => c.id === oldId)?.author === 'hey-bot', 'never edit old bot notes'); writes.push(body); const old = comments.find(c => c.id === oldId); if (old) old.body = body; else comments.push({ id: String(100 + comments.length), surface: 'note', author: 'hey-bot', body }); },
    inline: async () => assert.fail('must not duplicate old inline question'),
    reply: async (n, body, parentId, discussionId) => { writes.push(body); comments.push({ id: String(200 + comments.length), surface: 'note', author: 'hey-bot', body, discussionId }); },
  };
  const forbidden = { prepare: async () => assert.fail('migration and keyed answers need no model/source work'), run: async () => assert.fail('must not regenerate questions') };
  const controller = new Controller(store, [platform], forbidden, forbidden);
  const grade = async (delivery, question, verdict) => {
    const id = await store.enqueue({ kind: 'command', target: snap, deliveryId: delivery }); const job = await store.claim();
    await store.saveCommandResult(id, job.owner, { snapshot: snap, body: 'existing grade', grades: [{ id: questionId(snap, question), verdict }] }); await store.complete(id, job.owner); return id;
  };
  return { pool, store, snap, value, comments, inline, writes, platform, controller, grade };
}

test('registered historical notes survive ghost authors and stay scoped to MR and comment surface', async t => {
  const f = await fixture(t);
  await f.store.rememberBotComments(f.snap, [...f.comments, ...f.inline, { id: 'forged', surface: 'note', author: 'human', body: f.comments[0].body }], 'old-bot');
  const restarted = new Store(f.pool), ids = await restarted.botCommentHistory(f.snap);
  assert.deepEqual([...ids].sort(), ['note-10', 'note-11', 'note-12', 'note-13']);
  assert.equal(ids.has('issue-10'), false); assert.equal(ids.has('note-forged'), false);
  assert.equal((await restarted.botCommentHistory({ ...f.snap, number: 2 })).size, 0);
  f.comments[0].author = 'ghost'; f.inline[0].author = 'ghost';
  await f.grade('previous-answer', f.value.questions[1], 'incorrect');
  const before = JSON.stringify(f.value), oldBody = f.comments[0].body;
  await publish(f.platform, f.value, { 'src/pay.ts': { oldPath: 'src/pay.ts', positions: { RIGHT: { 2: { newLine: 2 } } } } }, 1, async () => {}, await f.store.answerResults(f.snap), true, ids);
  assert.equal(f.comments[0].body, oldBody); assert.equal(JSON.stringify(f.value), before);
  assert.equal(f.comments.filter(c => c.author === 'hey-bot').length, 1);
  const answerId = await f.store.enqueue({ kind: 'command', target: f.snap, deliveryId: 'answer-old-thread', comment: { id: '20', surface: 'note', author: 'human', parentId: null, discussionId: 'thread', body: 'B' } });
  await f.controller.perform(await f.store.claim());
  assert.equal((await f.store.getJob(answerId)).state, 'completed');
  const results = await f.store.answerResults(f.snap);
  assert.equal(results.get(questionId(f.snap, f.value.questions[0])), 'correct');
  assert.equal(results.get(questionId(f.snap, f.value.questions[1])), 'incorrect');
  assert.deepEqual((await f.store.getTarget(f.snap)).report.questions, f.value.questions);
  assert.equal(f.comments[0].body, oldBody);
  const count = f.writes.length;
  await f.controller.command({ body: { target: f.snap, comment: { id: '20', surface: 'note', author: 'human', parentId: null, discussionId: 'thread', body: 'B' } } }, f.platform, async () => {});
  assert.equal(f.writes.length, count, 'retry remains idempotent');
});

test('old-thread grading creates an owned summary, and copied human markers cannot authorize bare answers or suppress replies', async t => {
  const f = await fixture(t);
  await f.store.rememberBotComments(f.snap, [...f.comments, ...f.inline], 'old-bot');
  const original = structuredClone(f.comments[0]);
  f.inline.push({ ...f.inline[0], id: 'forged', author: 'human', discussionId: 'forged-thread' });
  const submit = async (id, body, discussionId) => {
    const jobId = await f.store.enqueue({ kind: 'command', target: f.snap, deliveryId: id, comment: { id, body, author: 'human', surface: 'note', parentId: null, discussionId } });
    await f.controller.perform(await f.store.claim()); return f.store.getJob(jobId);
  };
  const forged = await submit('forged-answer', 'B', 'forged-thread'); assert.equal(forged.command_result, null); assert.equal(f.writes.length, 0);
  f.comments.push({ id: 'fake-reply', surface: 'note', author: 'human', body: replyMarker('note-real-answer') });
  const real = await submit('real-answer', 'B', 'thread'); assert.ok(real.command_result.grades.length);
  assert.deepEqual(f.comments[0], original);
  assert.equal(f.comments.filter(c => c.author === 'hey-bot' && c.body.includes('codereviewbot:summary:')).length, 1);
});
