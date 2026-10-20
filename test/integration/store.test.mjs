import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { Store, targetKey } from '../../dist/store.js';
import { snapshot, report } from '../fixtures.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database');
test('durable queue handles duplicate deliveries, immediate dispatch, exclusive leases and restart fencing', async t => {
  const pool = new pg.Pool({ connectionString: url }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate();
  await pool.query('TRUNCATE deliveries, jobs, feedback, targets CASCADE');
  const target = snapshot(); const event = { kind: 'review', target, deliveryId: 'd1', headSha: target.headSha };
  const id = await store.enqueue(event); assert.ok(id);
  assert.equal(await store.enqueue(event), null);
  const [one, two] = await Promise.all([store.claim(), store.claim()]);
  const claimed = one ?? two; assert.ok(claimed); assert.equal([one, two].filter(Boolean).length, 1);
  await store.saveResult(claimed.id, claimed.owner, report(), {}, 5);
  const publishing = await store.claim(); assert.equal(publishing.state, 'publishing');
  await pool.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [publishing.id]);
  const restarted = new Store(pool); const reclaimed = await restarted.claim();
  assert.notEqual(reclaimed.owner, publishing.owner);
  await assert.rejects(() => store.assertLease(publishing.id, publishing.owner));
  await restarted.complete(reclaimed.id, reclaimed.owner);
  assert.equal((await restarted.getJob(id)).state, 'completed');
  assert.equal((await restarted.getTarget(target)).report.snapshot.headSha, target.headSha);
});
test('a newer source push supersedes a running review and paused repositories retain commands', async t => {
  const pool = new pg.Pool({ connectionString: url }); t.after(() => pool.end()); const store = new Store(pool); await store.migrate();
  await pool.query('TRUNCATE deliveries, jobs, feedback, targets CASCADE');
  const target = snapshot(); await store.enqueue({ kind: 'review', target, deliveryId: 'd2', headSha: 'b'.repeat(40) });
  const first = await store.claim();
  await store.enqueue({ kind: 'review', target, deliveryId: 'd3', headSha: 'c'.repeat(40) });
  await assert.rejects(() => store.assertLease(first.id, first.owner));
  await store.setPaused(target, true);
  assert.equal(await store.claim(), null);
  await store.enqueue({ kind: 'command', target, deliveryId: 'd4', comment: { id: '4', body: '/reviewbot resume', author: 'joe', parentId: null, discussionId: null, surface: 'issue' } });
  assert.equal((await store.claim()).kind, 'command');
});

test('CI completion during review is retained for refresh and dismissal cannot resurrect a ready finding', async t => {
  const pool = new pg.Pool({ connectionString: url }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate(); await pool.query('TRUNCATE deliveries, jobs, feedback, targets CASCADE');
  const target = snapshot(); await store.enqueue({ kind: 'review', target, deliveryId: 'review', headSha: target.headSha });
  const reviewing = await store.claim();
  await store.enqueue({ kind: 'ci', target, deliveryId: 'ci-finished', headSha: target.headSha });
  await store.saveResult(reviewing.id, reviewing.owner, report({ findings: [{ ...(await import('../fixtures.mjs')).finding(), id: 'CRB-0001', status: 'new' }] }), {}, 5);
  assert.equal(await store.dismiss(target, 'CRB-0001'), true);
  const ready = await store.claim(); assert.equal(ready.state, 'publishing'); assert.equal(ready.result.findings[0].status, 'dismissed');
  await store.complete(ready.id, ready.owner);
  assert.equal((await store.claim()).kind, 'ci');
});

test('learning responses survive restart, remain target-scoped and reject expired-lease writes', async t => {
  const pool = new pg.Pool({ connectionString: url }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate(); await store.migrate();
  await pool.query('TRUNCATE deliveries, jobs, feedback, targets CASCADE');
  const target = snapshot();
  const id = await store.enqueue({ kind: 'command', target, deliveryId: 'learning', comment: { id: 'human1', author: 'joe', body: '/reviewbot morequestion', surface: 'issue', parentId: null, discussionId: null } });
  const job = await store.claim();
  const response = { snapshot: target, body: 'saved questions', questions: report().questions };
  assert.equal(typeof store.saveCommandResult, 'function', 'learning needs durable responses before external effects');
  await store.saveCommandResult(id, job.owner, response);
  await store.fail(job, 'temporary network failure');
  await pool.query('UPDATE jobs SET due_at=now() WHERE id=$1', [id]);
  const restarted = new Store(pool), retry = await restarted.claim();
  assert.deepEqual(retry.command_result, response);
  assert.equal((await restarted.learningBatches(target)).length, 1);
  assert.equal((await restarted.learningBatches({ ...target, number: 2 })).length, 0);
  await assert.rejects(() => store.saveCommandResult(id, job.owner, { ...response, body: 'obsolete owner' }), /lease/);
  await assert.rejects(() => restarted.saveCommandResult(id, retry.owner, { ...response, body: 'must stay immutable' }), /already|immutable/);
  await pool.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [id]);
  await assert.rejects(() => restarted.saveCommandResult(id, retry.owner, response), /lease/);
  assert.equal((await restarted.getJob(id)).command_result.body, 'saved questions');
});

test('question history preserves earlier same-revision report questions without crossing targets or refs', async t => {
  const pool = new pg.Pool({ connectionString: url }); t.after(() => pool.end()); const store = new Store(pool); await store.migrate();
  await pool.query('TRUNCATE deliveries, jobs, feedback, targets CASCADE');
  for (let i = 0; i < 3; i++) {
    const snap = snapshot(i === 2 ? { headSha: 'c'.repeat(40) } : {});
    await store.enqueue({ kind: 'review', target: snap, headSha: snap.headSha, deliveryId: `history-${i}` }, true);
    const running = await store.claim();
    await store.saveResult(running.id, running.owner, report({ snapshot: snap, questions: report().questions.map(q => ({ ...q, question: `${i}: ${q.question}` })) }), {}, 0);
    const publishing = await store.claim(); await store.complete(publishing.id, publishing.owner);
  }
  assert.equal(typeof store.questionHistory, 'function', 'question IDs must survive report replacement');
  const history = await store.questionHistory(snapshot()); assert.equal(history.length, 6);
  assert.ok(history.some(q => q.question.startsWith('0:'))); assert.ok(history.some(q => q.question.startsWith('1:')));
  assert.ok(!history.some(q => q.question.startsWith('2:')));
  assert.equal((await store.questionHistory(snapshot({ number: 2 }))).length, 0);
});

test('only completed graded answers on the same revision and target count toward the merge gate', async t => {
  const pool = new pg.Pool({ connectionString: url }); t.after(() => pool.end()); const store = new Store(pool); await store.migrate();
  await pool.query('TRUNCATE deliveries, jobs, feedback, targets CASCADE');
  const answer = async (target, deliveryId, answered, complete = true) => {
    const id = await store.enqueue({ kind: 'command', target, deliveryId, comment: { id: deliveryId, author: 'joe', body: 'answer', surface: 'issue', parentId: null, discussionId: null } });
    const job = await store.claim(); assert.equal(job.id, id);
    await store.saveCommandResult(id, job.owner, { snapshot: target, body: 'graded', ...(answered ? { answered } : {}) });
    if (complete) await store.complete(id, job.owner); else await store.fail(job, 'reply lost');
  };
  await answer(snapshot(), 'a1', 'Q-000000000001');
  await answer(snapshot(), 'a2', 'Q-000000000001');
  await answer(snapshot(), 'a3', 'Q-000000000002', false);
  await answer(snapshot(), 'a4', undefined);
  await answer(snapshot({ headSha: 'c'.repeat(40) }), 'a5', 'Q-000000000003');
  await answer(snapshot({ number: 2 }), 'a6', 'Q-000000000004');
  assert.deepEqual([...await store.answeredQuestions(snapshot())], ['Q-000000000001']);
  // Newer replies record verdicts for several questions at once; the latest grade per question wins.
  const graded = async (deliveryId, grades) => {
    const id = await store.enqueue({ kind: 'command', target: snapshot(), deliveryId, comment: { id: deliveryId, author: 'joe', body: 'answer', surface: 'issue', parentId: null, discussionId: null } });
    const job = await store.claim(); await store.saveCommandResult(id, job.owner, { snapshot: snapshot(), body: 'graded', grades }); await store.complete(id, job.owner);
  };
  await graded('g1', [{ id: 'Q-000000000002', verdict: 'incorrect' }, { id: 'Q-000000000005', verdict: 'correct' }]);
  await graded('g2', [{ id: 'Q-000000000002', verdict: 'correct' }]);
  assert.deepEqual([...await store.answerResults(snapshot())], [['Q-000000000001', null], ['Q-000000000002', 'correct'], ['Q-000000000005', 'correct']]);
  assert.deepEqual([...await store.answeredQuestions(snapshot())].sort(), ['Q-000000000001', 'Q-000000000002', 'Q-000000000005']);
});

test('the start-of-review estimate uses recorded model review times for the same mode', async t => {
  const pool = new pg.Pool({ connectionString: url }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate();
  await pool.query('TRUNCATE deliveries, jobs, feedback, targets CASCADE');
  assert.deepEqual(await store.reviewEstimate('full'), { minutes: 5, measured: false });
  for (const [i, seconds] of [200, 250, 400].entries()) {
    const target = snapshot({ number: 10 + i });
    await store.enqueue({ kind: 'review', target, deliveryId: `estimate-${i}`, headSha: target.headSha });
    const claimed = await store.claim();
    await store.saveResult(claimed.id, claimed.owner, report({ snapshot: target, mode: 'full' }), {}, 5, seconds);
    const publishing = await store.claim(); await store.complete(publishing.id, publishing.owner);
  }
  assert.deepEqual(await store.reviewEstimate('full'), { minutes: 5, measured: true });
  assert.deepEqual(await store.reviewEstimate('incremental'), { minutes: 5, measured: true }, 'falls back to other modes before guessing');
});
