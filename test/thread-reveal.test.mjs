import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../dist/controller.js';
import { parseCommand } from '../dist/commands.js';
import { renderReport, renderQuestionBatch, renderQuestionThread, summaryMarker } from '../dist/render.js';
import { report, snapshot, initialQuestions } from './fixtures.mjs';

function fixture(platformName = 'gitlab') {
  const snap = snapshot({ platform: platformName });
  const value = report({ snapshot: snap, questions: initialQuestions() });
  const first = initialQuestions().map((q, i) => ({ ...q, question: `추가 첫 묶음 ${i + 1}은 무엇인가요?` }));
  const second = first.map((q, i) => ({ ...q, question: `추가 둘째 묶음 ${i + 1}은 무엇인가요?` }));
  const batches = [{ snapshot: snap, questions: first, start: 1 }, { snapshot: snap, questions: second, start: 3 }];
  const surface = platformName === 'gitlab' ? 'note' : 'review';
  const roots = [renderReport(value), renderQuestionBatch(first, snap, 'more1'), renderQuestionBatch(second, snap, 'more2', 3)].map((body, i) => ({ id: `root${i}`, discussionId: `thread${i}`, surface, body, author: 'bot', url: '' }));
  const replies = [], saved = [];
  const store = { getTarget: async () => ({ report: value }), learningBatches: async () => batches, questionHistory: async () => [], saveCommandResult: async (id, owner, result) => saved.push(result) };
  const platform = { config: { platform: platformName, botLogin: 'bot' }, permission: async () => 'write', owned: c => c.author === 'bot', comments: async () => roots, inlineComments: async () => [], snapshot: async () => snap, reply: async (...args) => replies.push(args) };
  const forbidden = () => { throw Error('reveal must not run model or prepare source'); };
  const controller = new Controller(store, [], { prepare: forbidden }, { run: forbidden });
  const run = async (root, body = '/hey showanswer', extra = {}) => {
    const comment = { id: `human${replies.length}`, body, author: 'human', surface, parentId: platformName === 'github' && root ? root.id : null, discussionId: platformName === 'gitlab' && root ? root.discussionId : null, ...extra };
    await controller.command({ id: 'job', owner: 'owner', body: { target: snap, comment } }, platform, async () => {});
    return replies.at(-1)?.[1];
  };
  return { snap, value, roots, batches, replies, saved, run };
}

test('showanswer accepts no individual question selectors', () => {
  assert.deepEqual(parseCommand('/hey SHOWANSWER'), { action: 'reveal' });
  for (const text of ['/hey showanswer Q1', '/hey showanswer 심화1', '/hey showanswer Q1 심화2']) assert.equal(parseCommand(text), null);
});

for (const name of ['gitlab', 'github']) {
  test(`${name}: reveal follows the question comment, not the most recent or initial batch`, async () => {
    const h = fixture(name);
    for (const [i, expected, excluded] of [[0, /#### Q1\./, /#### 심화/], [1, /#### 심화1\./, /#### Q1\.|#### 심화3\./], [2, /#### 심화3\./, /#### Q1\.|#### 심화1\./], [0, /#### Q1\./, /#### 심화/]]) {
      const body = await h.run(h.roots[i]);
      assert.match(body, expected); assert.doesNotMatch(body, excluded);
      assert.equal([...body.matchAll(/^#### (?:Q|심화)\d+\./gm)].length, 2);
      assert.equal(h.saved.at(-1).grades, undefined);
    }
  });
  test(`${name}: unscoped, forged, stale and ambiguous threads never disclose unrelated answers`, async () => {
    const h = fixture(name);
    assert.doesNotMatch(await h.run(null), /##### 해설/);
    h.roots[1].author = 'human'; assert.doesNotMatch(await h.run(h.roots[1]), /##### 해설/);
    h.roots[1].author = 'bot';
    h.roots[1].body = renderQuestionBatch(h.batches[0].questions, { ...h.snap, headSha: 'c'.repeat(40) }, 'old');
    assert.doesNotMatch(await h.run(h.roots[1]), /##### 해설/);
    if (name === 'gitlab') { h.roots[2].discussionId = h.roots[0].discussionId; assert.doesNotMatch(await h.run(h.roots[0]), /##### 해설/); }
  });
  test(`${name}: an individual inline question reveals only itself`, async () => {
    const h = fixture(name);
    h.roots[0].body = renderQuestionThread(h.value.questions[0], h.snap, 1);
    const body = await h.run(h.roots[0]); assert.match(body, /#### Q1\./); assert.doesNotMatch(body, /#### Q2\./);
  });
}

test('question thread revision markers never identify batches as the summary', () => {
  const h = fixture();
  assert.ok(h.roots[0].body.includes(summaryMarker(h.snap)));
  for (const root of h.roots.slice(1)) assert.ok(!root.body.includes(summaryMarker(h.snap)));
  assert.ok(!renderQuestionThread(h.value.questions[0], h.snap, 1).includes(summaryMarker(h.snap)));
});
