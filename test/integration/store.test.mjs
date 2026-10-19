import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { Store, targetKey } from '../../dist/store.js';
import { snapshot, report } from '../fixtures.mjs';

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database');
test('durable queue handles duplicate deliveries, debounce, exclusive leases and restart fencing', async t => {
  const pool = new pg.Pool({ connectionString: url }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate();
  await pool.query('TRUNCATE deliveries, jobs, feedback, targets CASCADE');
  const target = snapshot(); const event = { kind: 'review', target, deliveryId: 'd1', headSha: target.headSha };
  const id = await store.enqueue(event, 0); assert.ok(id);
  assert.equal(await store.enqueue(event, 0), null);
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
  const target = snapshot(); await store.enqueue({ kind: 'review', target, deliveryId: 'd2', headSha: 'b'.repeat(40) }, 0);
  const first = await store.claim();
  await store.enqueue({ kind: 'review', target, deliveryId: 'd3', headSha: 'c'.repeat(40) }, 0);
  await assert.rejects(() => store.assertLease(first.id, first.owner));
  await store.setPaused(target, true);
  assert.equal(await store.claim(), null);
  await store.enqueue({ kind: 'command', target, deliveryId: 'd4', comment: { id: '4', body: '/reviewbot resume', author: 'joe', parentId: null, discussionId: null } }, 0);
  assert.equal((await store.claim()).kind, 'command');
});
