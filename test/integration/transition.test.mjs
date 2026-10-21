import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { Controller } from '../../dist/controller.js';
import { renderReport } from '../../dist/render.js';
import { Store } from '../../dist/store.js';
import { questionId } from '../../dist/learning.js';
import { parsePatch, parsePositions } from '../../dist/review.js';
import { changeQuestions, finding, report, snapshot } from '../fixtures.mjs';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');

async function fixture(t, name) {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  t.after(() => pool.end());
  const store = new Store(pool);
  await store.migrate();
  await pool.query('TRUNCATE deliveries,jobs,feedback,targets CASCADE');
  const snap = snapshot(name === 'gitlab' ? {
    platform: 'gitlab', instance: 'https://gitlab.com', repository: 'group/demo', webUrl: 'https://gitlab.com/group/demo/-/merge_requests/1',
  } : {});
  const config = { platform: snap.platform, instance: snap.instance, repository: snap.repository, botLogin: 'bot', webhookSecretEnv: 'HOOK_SECRET', webhookAuth: 'hmac', tokenEnv: 'TOKEN', enabled: true };
  const comments = [], inline = [], writes = [], calls = [], preparations = [], statuses = [];
  let checks = 0, cleanups = 0;
  const platform = {
    config, target: number => ({ ...snap, number }), snapshot: async () => ({ ...snap }), openNumbers: async () => [snap.number],
    permission: async () => 'write', comments: async () => comments, inlineComments: async () => inline, owned: c => c.author === 'bot',
    checks: async () => { checks++; throw new Error('Question generation must not collect CI results'); }, linkedIssues: async () => [],
    comment: async (number, body, id) => {
      writes.push({ kind: 'summary', body });
      const previous = comments.find(c => c.id === id);
      if (previous) previous.body = body;
      else comments.push({ id: `summary-${comments.length}`, body, author: 'bot', surface: name === 'github' ? 'issue' : 'note' });
    },
    inline: async (s, value) => {
      writes.push({ kind: 'inline', body: value.body });
      inline.push({ id: `inline-${inline.length}`, body: value.body, author: 'bot', surface: name === 'github' ? 'review' : 'note' });
    },
    reply: async (number, body, parentId, discussionId) => {
      writes.push({ kind: 'reply', body });
      comments.push({ id: `reply-${comments.length}`, body, author: 'bot', surface: name === 'github' ? 'issue' : 'note', parentId, discussionId });
    },
    gateStatus: async () => statuses.at(-1) ?? null,
    setGateStatus: async (s, value) => { statuses.push(value); },
  };
  const patch = '@@ -1,3 +1,3 @@\n function pay() {\n-oldCharge();\n+charge();\n }';
  const diff = { 'src/pay.ts': { oldPath: 'src/pay.ts', patch, lines: parsePatch(patch), positions: parsePositions(patch) } };
  const workspaces = {
    prepare: async (provider, current, id, previous) => {
      preparations.push({ previous });
      return {
        policy: { version: 1, pathInstructions: [], exclude: [], maxInlineComments: 5, requireAnswers: true }, guidelines: [], mode: previous ? 'incremental' : 'full',
        context: { files: { 'src/pay.ts': 'function pay() {\ncharge();\n}' }, baseFiles: { 'src/pay.ts': 'function pay() {\noldCharge();\n}' }, diff, excluded: [], limited: false, sourceDir: '/snapshots/source' },
      };
    },
    cleanup: async () => { cleanups++; },
  };
  const model = { run: async (phase, prompt) => {
    calls.push({ phase, prompt });
    return { questions: changeQuestions().map(q => ({ ...q, question: `새 질문: ${q.question}` })) };
  } };
  const controller = new Controller(store, [platform], workspaces, model);
  const tick = async (runner = controller) => { const id = await runner.tick(); await runner.active; return id; };
  const drain = async () => {
    for (let i = 0; i < 10; i++) if (!await tick()) return;
    assert.fail('Question work did not finish within ten queue claims');
  };
  const seed = async (value, { ready = false, kind = 'review' } = {}) => {
    const id = await store.enqueue({ kind, target: snap, deliveryId: `seed-${kind}`, headSha: snap.headSha });
    const running = await store.claim();
    assert.equal(running.id, id);
    await store.saveResult(id, running.owner, { ...value, snapshot: { ...snap } }, diff, 5);
    if (!ready) {
      const publishing = await store.claim();
      await store.complete(publishing.id, publishing.owner);
    }
    return id;
  };
  return { pool, store, snap, platform, workspaces, model, controller, tick, drain, seed, comments, inline, writes, calls, preparations, statuses, checks: () => checks, cleanups: () => cleanups };
}

for (const name of ['github', 'gitlab']) {
  test(`${name}: a same-revision legacy report gets fresh questions while preserving findings and learning history`, async t => {
    const f = await fixture(t, name);
    const legacy = report({ schemaVersion: '1', findings: [finding({ id: 'CRB-0001', status: 'new' }), finding({ id: 'CRB-0002', status: 'dismissed' })] });
    await f.seed(legacy);
    const oldId = questionId(f.snap, legacy.questions[0]);
    const answerId = await f.store.enqueue({ kind: 'command', target: f.snap, deliveryId: 'legacy-answer', comment: { id: 'answer', body: 'B', author: 'joe', surface: name === 'github' ? 'issue' : 'note', parentId: null, discussionId: null } });
    const answer = await f.store.claim();
    await f.store.saveCommandResult(answerId, answer.owner, { snapshot: f.snap, body: '기존 채점 결과', grades: [{ id: oldId, verdict: 'correct' }] });
    await f.store.complete(answerId, answer.owner);

    await f.store.enqueue({ kind: 'review', target: f.snap, deliveryId: 'same-sha-after-upgrade', headSha: f.snap.headSha });
    await f.drain();

    const current = (await f.store.getTarget(f.snap)).report;
    assert.equal(current.schemaVersion, '2');
    assert.deepEqual(f.calls.map(c => c.phase), ['initial_questions']);
    assert.equal(f.preparations.length, 1);
    assert.equal(f.preparations[0].previous, null, 'A legacy SHA must not become an empty incremental diff');
    assert.equal(current.questions.length, 3);
    assert.deepEqual(current.findings.map(item => [item.id, item.status]), [['CRB-0001', 'unverified'], ['CRB-0002', 'dismissed']]);
    assert.ok((await f.store.questionHistory(f.snap)).some(q => questionId(f.snap, q) === oldId));
    assert.equal((await f.store.answerResults(f.snap)).get(oldId), 'correct');
    assert.equal(current.requireAnswers, true);
    assert.equal(f.statuses.at(-1).state, 'pending');
    assert.match(f.statuses.at(-1).description, /0\/3/);
    assert.equal(f.checks(), 0);
    assert.ok(f.writes.some(value => value.kind === 'inline' && value.body.includes('codereviewbot:question:')));
    assert.ok(f.writes.every(value => !value.body.includes('codereviewbot:finding:') && !value.body.includes('CRB-0001')));
    assert.equal((await f.store.health()).queued, 0);
  });

  for (const kind of ['review', 'ci']) {
    test(`${name}: a durable legacy ${kind} result is replaced before any publication`, async t => {
      const f = await fixture(t, name);
      const legacyId = await f.seed(report({ schemaVersion: '1', findings: [finding({ id: 'CRB-0001' })] }), { ready: true, kind });
      // Reclaim a publisher after restart, rather than relying only on fresh queue dispatch.
      const interrupted = await f.store.claim();
      assert.equal(interrupted.state, 'publishing');
      await f.pool.query("UPDATE jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [legacyId]);
      const restarted = new Controller(new Store(f.pool), [f.platform], f.workspaces, f.model);
      await f.tick(restarted);

      assert.equal(f.writes.length, 0, 'An old ready result cannot post a summary or a finding');
      assert.equal(f.calls.length, 0);
      const replacement = (await f.pool.query("SELECT * FROM jobs WHERE kind='review' AND state='queued'")).rows;
      assert.equal(replacement.length, 1);
      assert.equal(replacement[0].body.force, true);
      assert.equal(replacement[0].body.deliveryId, `questions-v2:${legacyId}`);
      assert.ok(['completed', 'superseded'].includes((await f.store.getJob(legacyId)).state));

      await f.drain();
      assert.equal((await f.store.getTarget(f.snap)).report.schemaVersion, '2');
      assert.deepEqual(f.calls.map(c => c.phase), ['initial_questions']);
      assert.ok(f.writes.every(value => !value.body.includes('codereviewbot:finding:')));
      assert.equal(f.checks(), 0);
    });
  }

  test(`${name}: recovery bypasses the old permanent delivery key and leaves current question results alone`, async t => {
    const f = await fixture(t, name);
    await f.seed(report({ schemaVersion: '1' }));
    const oldDelivery = `recover:${f.snap.headSha}:${f.snap.startSha}:${f.snap.baseSha}`;
    const consumed = await f.store.enqueue({ kind: 'review', target: f.snap, deliveryId: oldDelivery, headSha: f.snap.headSha });
    const oldJob = await f.store.claim();
    assert.equal(oldJob.id, consumed);
    await f.store.complete(oldJob.id, oldJob.owner);

    await f.controller.recover();
    await f.controller.recover();
    const queued = (await f.pool.query("SELECT * FROM jobs WHERE state='queued'")).rows;
    assert.equal(queued.length, 1);
    assert.equal(queued[0].kind, 'review');
    assert.match(queued[0].body.deliveryId, /questions-v2/);
    assert.equal(f.checks(), 0);
    assert.equal(f.cleanups(), 2);
    await f.drain();
    assert.equal((await f.store.getTarget(f.snap)).report.schemaVersion, '2');
    assert.equal(f.calls.length, 1);
    const writes = f.writes.length, statuses = f.statuses.length;

    await f.controller.recover();
    assert.equal((await f.store.health()).queued, 0);
    assert.equal(f.calls.length, 1);
    assert.equal(f.writes.length, writes);
    assert.equal(f.statuses.length, statuses, 'Recovery keeps gate reconciliation idempotent');
    assert.equal(f.checks(), 0);
  });

  test(`${name}: current same-SHA cache and queued CI do not generate questions or poll checks`, async t => {
    const f = await fixture(t, name);
    const current = report({ schemaVersion: '2', requireAnswers: true });
    await f.seed(current);
    const id = await f.store.enqueue({ kind: 'review', target: f.snap, deliveryId: 'cached-sha', headSha: f.snap.headSha });
    await f.drain();
    assert.equal((await f.store.getJob(id)).state, 'completed');
    assert.equal(f.calls.length, 0);
    assert.equal((await f.store.getTarget(f.snap)).report.schemaVersion, '2');
    assert.deepEqual((await f.store.getTarget(f.snap)).report.questions, current.questions);

    const writes = f.writes.length, preparations = f.preparations.length;
    const ci = await f.store.enqueue({ kind: 'ci', target: f.snap, deliveryId: 'already-queued-ci', headSha: f.snap.headSha });
    await f.tick();
    assert.equal((await f.store.getJob(ci)).state, 'completed');
    assert.equal((await f.store.getJob(ci)).result, null);
    assert.equal(f.calls.length, 0);
    assert.equal(f.preparations.length, preparations);
    assert.equal(f.writes.length, writes);
    assert.equal(f.checks(), 0);
    assert.equal((await f.store.health()).queued, 0);
  });

  test(`${name}: an explicit review command regenerates current same-SHA questions with a full source fallback`, async t => {
    const f = await fixture(t, name);
    const current = report({ schemaVersion: '2', requireAnswers: true });
    await f.seed(current);
    const commandId = await f.store.enqueue({ kind: 'command', target: f.snap, deliveryId: 'explicit-review', comment: {
      id: 'explicit-review', body: '/reviewbot review', author: 'joe', surface: name === 'github' ? 'issue' : 'note', parentId: null, discussionId: null,
    } });
    await f.tick();
    assert.equal((await f.store.getJob(commandId)).state, 'completed');
    assert.equal(f.calls.length, 0, 'The command dispatches generation through the durable queue');
    const queued = (await f.pool.query("SELECT * FROM jobs WHERE kind='review' AND state='queued'")).rows;
    assert.equal(queued.length, 1);
    assert.equal(queued[0].body.regenerate, true);
    assert.equal(queued[0].body.force, false);

    await f.drain();
    assert.deepEqual(f.calls.map(c => c.phase), ['initial_questions']);
    assert.equal(f.preparations.length, 1);
    assert.equal(f.preparations[0].previous, null, 'Regenerating an equal SHA must not select an empty incremental diff');
    const regenerated = (await f.store.getTarget(f.snap)).report;
    assert.equal(regenerated.mode, 'full');
    assert.notDeepEqual(regenerated.questions, current.questions);
    assert.ok((await f.store.questionHistory(f.snap)).some(q => questionId(f.snap, q) === questionId(f.snap, current.questions[0])));
    assert.equal(f.checks(), 0);
  });

  test(`${name}: a new push during generation prevents storing or publishing obsolete questions`, async t => {
    const f = await fixture(t, name);
    const run = f.model.run;
    let writesAtPush;
    f.model.run = async (...args) => {
      const result = await run(...args);
      writesAtPush = f.writes.length;
      f.platform.snapshot = async () => ({ ...f.snap, headSha: 'c'.repeat(40) });
      return result;
    };
    const id = await f.store.enqueue({ kind: 'review', target: f.snap, deliveryId: 'push-during-generation', headSha: f.snap.headSha });
    await f.tick();

    assert.deepEqual(f.calls.map(c => c.phase), ['initial_questions']);
    assert.equal((await f.store.getJob(id)).state, 'superseded');
    assert.equal((await f.store.getJob(id)).result, null);
    assert.equal((await f.store.getTarget(f.snap)).report, null);
    assert.equal(f.writes.length, writesAtPush, 'Only the progress notice written before the push may exist');
    assert.equal(f.inline.length, 0);
    assert.equal(f.statuses.length, 0);
  });

  test(`${name}: a new push between publication reads prevents all remote writes`, async t => {
    const f = await fixture(t, name);
    const id = await f.seed(report({ schemaVersion: '2', requireAnswers: true }), { ready: true });
    f.platform.comments = async () => {
      f.platform.snapshot = async () => ({ ...f.snap, headSha: 'c'.repeat(40) });
      return f.comments;
    };
    await f.tick();

    assert.equal((await f.store.getJob(id)).state, 'superseded');
    assert.equal(f.writes.length, 0);
    assert.equal(f.calls.length, 0);
    assert.equal(f.statuses.length, 0);
  });
}

test('question timing estimates exclude stored two-pass review timings and prefer the current mode', async t => {
  const f = await fixture(t, 'github');
  const unmeasured = await f.store.reviewEstimate('full');
  assert.equal(unmeasured.measured, false);
  let next = 0;
  const record = async (schemaVersion, mode, seconds) => {
    const id = await f.store.enqueue({ kind: 'review', target: f.snap, deliveryId: `timing-${next++}`, headSha: f.snap.headSha });
    const running = await f.store.claim();
    await f.store.saveResult(id, running.owner, report({ schemaVersion, snapshot: f.snap, mode }), {}, 0, seconds);
    const publishing = await f.store.claim();
    await f.store.complete(publishing.id, publishing.owner);
  };
  await record('1', 'full', 1200);
  await record('1', 'incremental', 1800);
  assert.deepEqual(await f.store.reviewEstimate('full'), unmeasured, 'Legacy review timings do not replace the unmeasured estimate');
  for (const seconds of [20, 40, 70]) await record('2', 'full', seconds);
  assert.deepEqual(await f.store.reviewEstimate('full'), { minutes: 1, measured: true });
  assert.deepEqual(await f.store.reviewEstimate('incremental'), { minutes: 1, measured: true }, 'A missing mode falls back to question timings only');
  for (const seconds of [110, 130, 150]) await record('2', 'incremental', seconds);
  assert.deepEqual(await f.store.reviewEstimate('full'), { minutes: 1, measured: true });
  assert.deepEqual(await f.store.reviewEstimate('incremental'), { minutes: 3, measured: true });
});

for (const command of ['review', 'full']) {
  test(`same-head automatic events preserve an explicit ${command} request queued before dispatch`, async t => {
    const f = await fixture(t, 'github');
    await f.seed(report({ schemaVersion: '2' }));
    await f.store.enqueue({ kind: 'command', target: f.snap, deliveryId: `manual-${command}`, comment: { id: `manual-${command}`, body: `/reviewbot ${command}`, author: 'joe', surface: 'issue', parentId: null, discussionId: null } });
    await f.tick();
    await f.store.enqueue({ kind: 'review', target: f.snap, headSha: f.snap.headSha, deliveryId: `auto-after-${command}` });
    const queued = (await f.pool.query("SELECT body FROM jobs WHERE state='queued' AND kind='review'")).rows[0].body;
    assert.equal(queued.regenerate, true);
    assert.equal(queued.force, command === 'full');
    await f.drain();
    assert.deepEqual(f.calls.map(c => c.phase), ['initial_questions']);
  });
}

test('a failed first generation retains the policy answer gate instead of silently disabling it', async t => {
  const f = await fixture(t, 'github');
  f.model.run = async () => { throw new Error('inference unavailable'); };
  const id = await f.store.enqueue({ kind: 'review', target: f.snap, headSha: f.snap.headSha, deliveryId: 'first-generation-fails' });
  await f.pool.query('UPDATE jobs SET attempts=2 WHERE id=$1', [id]);
  await f.drain();
  const current = (await f.store.getTarget(f.snap)).report;
  assert.equal(current.state, 'failed'); assert.equal(current.requireAnswers, true);
  assert.equal(f.statuses.at(-1).state, 'pending');
});

test('grading an unversioned current summary retains its questions and leaves older summaries untouched', async t => {
  const f = await fixture(t, 'github'), current = report();
  await f.seed(current);
  const legacy = r => renderReport(r).split('\n').filter(line => !line.includes('codereviewbot:revision:')).join('\n');
  const old = { id: 'older-legacy', author: 'bot', body: legacy(report({ snapshot: { ...f.snap, headSha: 'd'.repeat(40) } })) };
  const saved = old.body;
  f.comments.push(old, { id: 'current-legacy', author: 'bot', body: legacy(current) });
  await f.store.enqueue({ kind: 'command', target: f.snap, deliveryId: 'legacy-answer', comment: { id: 'legacy-answer', body: '/reviewbot answer Q1 B', author: 'joe', surface: 'issue', parentId: null, discussionId: null } });
  await f.drain();
  assert.equal(old.body, saved);
  assert.match(f.comments.find(c => c.id === 'current-legacy').body, /답변 1\/3/);
  for (const q of current.questions) assert.ok(f.comments.find(c => c.id === 'current-legacy').body.includes(questionId(f.snap, q)));
});

for (const name of ['github', 'gitlab']) {
  test(`${name}: pushes preserve older question comments through progress, publication retry and latest grading`, async t => {
    const f = await fixture(t, name);
    const enqueue = deliveryId => f.store.enqueue({ kind: 'review', target: f.snap, headSha: f.snap.headSha, deliveryId });
    await enqueue('first-push'); await f.drain();
    const older = f.comments.find(c => c.body.includes('codereviewbot:summary:'));
    const saved = older.body;
    f.snap.headSha = 'e'.repeat(40);
    await enqueue('second-push'); await f.tick();
    assert.equal(older.body, saved, 'Generation progress must not edit the earlier questions');
    assert.equal(f.comments.filter(c => c.body.includes('codereviewbot:summary:')).length, 2);
    const post = f.platform.comment; let lost = false;
    f.platform.comment = async (...args) => { await post(...args); if (!lost) { lost = true; throw Error('accepted response lost'); } };
    await f.tick();
    await f.pool.query("UPDATE jobs SET due_at=now() WHERE state='ready'");
    await f.drain();
    assert.equal(older.body, saved);
    assert.equal(f.comments.filter(c => c.body.includes('codereviewbot:summary:')).length, 2);
    const latest = (await f.store.getTarget(f.snap)).report;
    const first = latest.questions[0];
    await f.store.enqueue({ kind: 'command', target: f.snap, deliveryId: 'answer-latest-push', comment: { id: 'answer-latest', body: `/reviewbot answer Q1 ${first.key.answer}`, author: 'joe', surface: name === 'github' ? 'issue' : 'note', parentId: null, discussionId: null } });
    await f.drain();
    assert.equal(older.body, saved);
    assert.match(f.comments.filter(c => c.body.includes('codereviewbot:summary:')).at(-1).body, /답변 1\/3/);
  });
}
