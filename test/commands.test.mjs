import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../dist/controller.js';
import { snapshot, report } from './fixtures.mjs';
import { questionId } from '../dist/learning.js';

const context = () => ({ sourceDir: '/source', files: { 'src/pay.ts': 'function pay() {\n charge();\n save();\n}' }, baseFiles: {}, excluded: [], limited: false, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch: '@@ -1 +1,4 @@\n+function pay() {\n+ charge();\n+ save();\n+}', lines: new Set([1, 2, 3, 4]), oldLines: new Set() } } });
const extraQuestions = () => ['pay의 멱등 키가 만료되면 어떤 문제가 생기며 어떻게 설계해야 하나요?', 'charge의 외부 부작용을 DB 트랜잭션만으로 되돌릴 수 없는 이유는 무엇인가요?', 'pay의 동시 재시도에서 멱등 키를 원자적으로 확보하는 방법을 설명하세요.'].map(question => ({ question, path: 'src/pay.ts', line: 2, side: 'RIGHT', options: [] }));
function learningHarness(body, overrides = {}) {
  const data = { snap: snapshot(), report: report(), batches: [], saved: null, calls: [], replies: [], remote: [], ...overrides };
  const job = { id: '10000000-0000-4000-8000-000000000001', owner: 'owner', kind: 'command', body: { target: snapshot(), comment: { id: 'human1', author: 'joe', body, parentId: null, discussionId: null, surface: 'issue', ...overrides.comment } } };
  const store = { getTarget: async () => ({ report: data.report }), learnings: async () => data.learnings ?? [], learningBatches: async () => data.batches, questionHistory: async () => data.history ?? [],
    saveCommandResult: async (id, owner, value) => { data.saved = value; } };
  const platform = { config: { botLogin: 'bot' }, permission: async () => data.permission ?? 'write', owned: c => c.author === 'bot',
    comments: async () => data.remote.map(c => ({ surface: job.body.comment.surface, ...c })), inlineComments: async () => [], snapshot: async () => ({ ...data.snap }),
    reply: async (...args) => { data.replies.push(args); if (data.replyError) throw new Error('network lost'); } };
  const model = { run: async (phase, prompt) => { data.calls.push({ phase, prompt }); data.onModel?.(); return data.output ?? { questions: extraQuestions() }; } };
  const controller = new Controller(store, [], { prepare: async () => ({ context: data.context ?? context(), policy: data.policy ?? {} }) }, model);
  return { data, job, run: async (jobOverride = {}) => controller.command({ ...job, ...jobOverride }, platform, async () => {}) };
}

test('more-learning generates a source-bound technical batch and persists it before replying', async () => {
  const h = learningHarness('더 알아보자'); await h.run();
  assert.deepEqual(h.data.calls.map(c => c.phase), ['questions']);
  assert.equal(h.data.saved.questions.length, 3);
  assert.match(h.data.replies[0][1], /심화 학습 질문/);
  assert.equal(new Set([...h.data.replies[0][1].matchAll(/codereviewbot:question:(Q-[a-f0-9]{12})/g)].map(m => m[1])).size, 3);
  assert.equal(h.data.saved.snapshot.headSha, 'b'.repeat(40));
});

test('grading a choice answer explains every option and stays in the originating thread', async () => {
  const r = report(); r.questions[0].options = [{ id: 'A', text: '새 키' }, { id: 'B', text: '같은 키' }];
  const id = questionId(r.snapshot, r.questions[0]);
  const h = learningHarness(`/reviewbot answer ${id} B`, { report: r, comment: { parentId: 'root1' }, output: { verdict: 'correct', explanation: '같은 멱등 키를 재사용한다는 답이 맞습니다.', expectedAnswer: '같은 키를 외부 승인과 재시도에 전달해야 합니다.', optionExplanations: [{ id: 'A', explanation: '새 키는 새로운 결제로 취급될 수 있습니다.' }, { id: 'B', explanation: '같은 키는 동일 요청으로 식별합니다.' }], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '외부 결제 호출' }] } });
  await h.run();
  assert.equal(h.data.calls[0].phase, 'grade');
  assert.match(h.data.replies[0][1], /정답/); assert.match(h.data.replies[0][1], /A.*새 키/); assert.match(h.data.replies[0][1], /B.*같은 키/);
  assert.equal(h.data.replies[0][2], 'root1');
  assert.ok(h.data.saved.body.includes('외부 승인'));
});

test('only a published grade records the answered question for the merge gate', async () => {
  const r = report(), id = questionId(r.snapshot, r.questions[0]);
  const graded = learningHarness(`/reviewbot answer ${id} 같은 키를 씁니다.`, { report: r, output: { verdict: 'incorrect', explanation: '설명', expectedAnswer: '키 재사용', optionExplanations: [], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: 'charge 호출' }] } });
  await graded.run(); assert.equal(graded.data.saved.answered, id);
  const more = learningHarness('더 알아보자'); await more.run(); assert.equal(more.data.saved.answered, undefined);
  const unknown = learningHarness('/reviewbot answer Q-ffffffffffff B'); await unknown.run(); assert.equal(unknown.data.saved.answered, undefined);
});

test('a plain reply to a single owned question is graded and unrelated comments are ignored', async () => {
  const r = report(), id = questionId(r.snapshot, r.questions[0]);
  const h = learningHarness('키를 다시 생성합니다.', { report: r, comment: { discussionId: 'discussion1' }, remote: [{ id: 'root1', author: 'bot', discussionId: 'discussion1', body: `<!-- codereviewbot:question:${id} -->` }], output: { verdict: 'incorrect', explanation: '재시도에는 같은 키가 필요합니다.', expectedAnswer: '키 재사용', optionExplanations: [], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: 'charge 호출' }] } });
  await h.run(); assert.equal(h.data.calls[0].phase, 'grade'); assert.match(h.data.replies[0][1], /오답/); assert.equal(h.data.replies[0][3], 'discussion1');
  const ignored = learningHarness('답입니다.', { comment: { parentId: 'not-owned' } }); await ignored.run(); assert.equal(ignored.data.calls.length, 0);
});

test('old revisions, unknown IDs, missing review data and batch limits never invoke the model', async () => {
  const r = report(), id = questionId(r.snapshot, r.questions[0]);
  for (const h of [learningHarness(`/reviewbot answer ${id} B`, { snap: snapshot({ headSha: 'c'.repeat(40) }) }), learningHarness('/reviewbot answer Q-ffffffffffff B'), learningHarness('더 알아보자', { report: null }), learningHarness('더 알아보자', { batches: Array.from({ length: 5 }, () => ({ snapshot: snapshot(), questions: extraQuestions() })) })]) {
    await h.run(); assert.equal(h.data.calls.length, 0); assert.equal(h.data.replies.length, 1);
  }
  const denied = learningHarness('더 알아보자', { permission: 'none' }); await denied.run(); assert.equal(denied.data.calls.length, 0); assert.equal(denied.data.replies.length, 0);
});

test('retries reuse the durable batch and an already published marker suppresses duplicates', async () => {
  const h = learningHarness('더 알아보자', { replyError: true });
  await assert.rejects(() => h.run(), /network lost/); assert.ok(h.data.saved);
  h.data.replyError = false;
  await h.run({ command_result: h.data.saved }); assert.equal(h.data.calls.length, 1);
  h.data.remote = [{ id: 'botreply', author: 'bot', body: h.data.saved.body }];
  await h.run({ command_result: h.data.saved }); assert.equal(h.data.replies.length, 2);
});

test('unverifiable answers remain ungraded and incomplete choice explanations cannot be posted', async () => {
  const r = report(), id = questionId(r.snapshot, r.questions[0]);
  const h = learningHarness(`${id}: 제 생각에는 순서가 중요합니다.`, { report: r, output: { verdict: 'unverifiable', explanation: '외부 API 계약을 확인하지 못했습니다.', expectedAnswer: 'API의 멱등 계약 확인이 필요합니다.', optionExplanations: [], evidence: [] } });
  await h.run(); assert.match(h.data.replies[0][1], /판정 보류/);
  const bad = learningHarness(`${id}: 같은 키입니다.`, { report: r, output: { verdict: 'correct', explanation: '맞음', expectedAnswer: '동일 키', optionExplanations: [], evidence: [{ path: 'missing.ts', line: 1, side: 'RIGHT', reason: '추측' }] } });
  await assert.rejects(() => bad.run(), /근거/); assert.equal(bad.data.replies.length, 0);
  r.questions[0].options = [{ id: 'A', text: '새 키' }, { id: 'B', text: '같은 키' }];
  const choice = learningHarness(`/reviewbot answer ${questionId(r.snapshot, r.questions[0])} B`, { report: r, output: { verdict: 'correct', explanation: '맞음', expectedAnswer: '동일 키', optionExplanations: [{ id: 'B', explanation: '동일 요청' }], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '호출' }] } });
  await assert.rejects(() => choice.run(), /보기/); assert.equal(choice.data.replies.length, 0);
});

test('extra learning rejects repeated questions and anchors outside the current change', async () => {
  for (const q of [report().questions[0], { ...extraQuestions()[0], path: 'unrelated.ts' }]) {
    const h = learningHarness('더 알아보자', { output: { questions: [q, ...extraQuestions().slice(1)] } });
    await assert.rejects(() => h.run(), /중복|근거/); assert.equal(h.data.replies.length, 0);
  }
});

test('a supplementary question can be answered after controller restart', async () => {
  const questions = extraQuestions(), id = questionId(snapshot(), questions[1]);
  const h = learningHarness(`${id}: 되돌릴 수 없으니 보상 동작이 필요합니다.`, { batches: [{ snapshot: snapshot(), questions }], output: { verdict: 'partial', explanation: '보상 동작은 적절하며 중복 승인 방지도 함께 필요합니다.', expectedAnswer: '외부 승인에는 멱등 요청과 보상 동작을 설계합니다.', optionExplanations: [], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '외부 승인' }] } });
  await h.run(); assert.match(h.data.replies[0][1], /부분 정답/);
});

test('a same-revision supplementary question remains answerable after a full review fails', async () => {
  const questions = extraQuestions(), id = questionId(snapshot(), questions[0]);
  const h = learningHarness(`${id}: 같은 요청을 식별합니다.`, { report: report({ state: 'failed', questions: [] }), batches: [{ snapshot: snapshot(), questions }], output: { verdict: 'partial', explanation: '실패 복구도 고려해야 합니다.', expectedAnswer: '멱등 식별과 복구', optionExplanations: [], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '승인' }] } });
  await h.run(); assert.equal(h.data.calls.length, 1); assert.equal(h.data.calls[0].phase, 'grade'); assert.match(h.data.replies[0][1], /부분 정답/);
});

test('natural GitHub answers find owned question replies under the root and ask for IDs when ambiguous', async () => {
  const r = report(), id = questionId(snapshot(), r.questions[0]);
  const remote = [{ id: 'root', author: 'bot', body: '<!-- codereviewbot:finding:v1:CRB-0001 -->' }, { id: 'reply', parentId: 'root', author: 'bot', body: `<!-- codereviewbot:question:${id} -->` }];
  const h = learningHarness('동일한 키로 재시도합니다.', { remote, comment: { parentId: 'root' }, output: { verdict: 'correct', explanation: '맞습니다.', expectedAnswer: '동일 키 재시도', optionExplanations: [], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '승인' }] } });
  await h.run(); assert.equal(h.data.calls[0].phase, 'grade');
  const second = questionId(snapshot(), r.questions[1]);
  const ambiguous = learningHarness('B입니다.', { remote: [...remote, { id: 'other-reply', parentId: 'root', author: 'bot', body: `<!-- codereviewbot:question:${second} -->` }], comment: { parentId: 'root' } });
  await ambiguous.run(); assert.equal(ambiguous.data.calls.length, 0); assert.match(ambiguous.data.replies[0][1], /질문 ID/);
});

test('a push during learning prevents storing or publishing the obsolete result', async () => {
  const h = learningHarness('더 알아보자'); h.data.onModel = () => { h.data.snap = snapshot({ startSha: 'c'.repeat(40) }); };
  await assert.rejects(() => h.run(), /Learning snapshot changed/); assert.equal(h.data.saved, null); assert.equal(h.data.replies.length, 0);
  const retry = learningHarness('더 알아보자', { replyError: true }); await assert.rejects(() => retry.run(), /network/);
  retry.data.replyError = false; retry.data.snap = snapshot({ headSha: 'c'.repeat(40) });
  await retry.run({ command_result: retry.data.saved }); assert.equal(retry.data.calls.length, 1); assert.match(retry.data.replies[1][1], /코드 기준/);
});

test('same-revision report replacement keeps old question IDs answerable and excluded from new batches', async () => {
  const old = extraQuestions(), id = questionId(snapshot(), old[0]);
  const h = learningHarness(`${id}: 같은 요청입니다.`, { history: old, output: { verdict: 'partial', explanation: '복구도 필요합니다.', expectedAnswer: '요청 식별과 복구', optionExplanations: [], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '호출' }] } });
  await h.run(); assert.equal(h.data.calls[0].phase, 'grade');
  const duplicate = learningHarness('더 알아보자', { history: old }); await assert.rejects(() => duplicate.run(), /중복/);
});

test('large but valid accumulated learning context fits the runner prompt boundary', async () => {
  const options = ['A', 'B', 'C', 'D', 'E'].map(id => ({ id, text: id + 'x'.repeat(299) }));
  const questions = Array.from({ length: 50 }, (_, i) => ({ question: String(i).padStart(3, '0') + 'q'.repeat(497), path: 'src/pay.ts', line: 2, side: 'RIGHT', options }));
  const h = learningHarness('더 알아보자', { report: report({ questions: questions.slice(0, 10) }), batches: [0, 1, 2, 3].map(i => ({ snapshot: snapshot(), questions: questions.slice((i + 1) * 10, (i + 2) * 10) })), policy: { pathInstructions: Array.from({ length: 25 }, (_, i) => ({ path: `src/${i}`, instructions: 'p'.repeat(4000) })) }, learnings: Array(20).fill('l'.repeat(4000)), context: { ...context(), diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch: '@@ -0,0 +1 @@\n+' + '\t'.repeat(139000), lines: new Set([1, 2]) } } } });
  await h.run(); assert.ok(h.data.calls[0].prompt.length <= 500000); assert.match(h.data.replies[0][1], /심화 학습 질문/);
  assert.ok(h.data.calls[0].prompt.includes(questions[49].question));
});

test('malformed answer commands ask for usage instead of grading the command as an answer', async () => {
  const id = questionId(snapshot(), report().questions[0]);
  const h = learningHarness(`/reviewbot answer ${id}`, { remote: [{ id: 'root', author: 'bot', body: `<!-- codereviewbot:question:${id} -->` }], comment: { parentId: 'root' } });
  await h.run(); assert.equal(h.data.calls.length, 0); assert.match(h.data.replies[0][1], /reviewbot answer/);
});

test('GitHub comment surfaces prevent numeric ID collisions in replies and thread inference', async () => {
  const id = questionId(snapshot(), report().questions[0]);
  const h = learningHarness(`/reviewbot answer ${id} 같은 키`, { comment: { id: '10', surface: 'review', parentId: 'root' }, remote: [{ id: 'botreply', author: 'bot', surface: 'issue', body: '<!-- codereviewbot:reply:issue-10 -->' }], output: { verdict: 'correct', explanation: '맞습니다.', expectedAnswer: '같은 키', optionExplanations: [], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '호출' }] } });
  await h.run(); assert.equal(h.data.calls.length, 1); assert.match(h.data.replies[0][1], /codereviewbot:reply:review-10/);
  const unrelated = learningHarness('그냥 대화입니다.', { comment: { surface: 'review', parentId: '1' }, remote: [{ id: '1', surface: 'issue', author: 'bot', body: `<!-- codereviewbot:question:${id} -->` }] });
  await unrelated.run(); assert.equal(unrelated.data.calls.length, 0); assert.equal(unrelated.data.replies.length, 0);
});

test('grading reserves comment room for the request link near the output boundary', async () => {
  const r = report(); r.questions[0] = { question: '&'.repeat(500), path: 'src/pay.ts', line: 2, side: 'RIGHT', options: ['A', 'B', 'C', 'D', 'E'].map(id => ({ id, text: '&'.repeat(299) + id })) };
  const id = questionId(snapshot(), r.questions[0]);
  const output = { verdict: 'correct', explanation: '&'.repeat(2000), expectedAnswer: '&'.repeat(1426), optionExplanations: r.questions[0].options.map(o => ({ id: o.id, explanation: '&'.repeat(799) + o.id })), evidence: Array(6).fill({ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '&'.repeat(400) }) };
  const h = learningHarness(`/reviewbot answer ${id} A`, { report: r, output, comment: { id: '123456789', surface: 'issue' }, remote: [{ id: '123456789', author: 'joe', surface: 'issue', body: 'answer', url: 'https://github.com/joe/demo/pull/1#issuecomment-123456789' }] });
  await h.run(); assert.equal(h.data.replies.length, 1); assert.ok(h.data.replies[0][1].length <= 60000); assert.match(h.data.replies[0][1], /요청 댓글/);
  for (const id of ['A', 'B', 'C', 'D', 'E']) assert.match(h.data.replies[0][1], new RegExp(`^- ${id}\\.`, 'm'));
});

test('oversized additional batches retain at least three full questions and visible choices', async () => {
  const path = Array(5).fill('漢'.repeat(99)).join('/');
  const questions = Array.from({ length: 10 }, (_, i) => ({ question: '&'.repeat(498) + i, path, line: 1, side: 'RIGHT', options: ['A', 'B', 'C', 'D', 'E'].map(id => ({ id, text: '&'.repeat(299) + id })) }));
  const h = learningHarness('더 알아보자', { output: { questions }, context: { ...context(), files: { [path]: 'source' }, diff: { [path]: { oldPath: path, patch: '@@ -0,0 +1 @@\n+source', lines: new Set([1]) } } } });
  await h.run(); assert.ok(h.data.replies[0][1].length <= 60000);
  assert.ok(h.data.saved.questions.length >= 3); assert.ok(h.data.saved.questions.length < 10);
  assert.equal([...h.data.replies[0][1].matchAll(/^\d+\. /gm)].length, h.data.saved.questions.length);
});

test('a push during contextual answer generation prevents publishing obsolete code advice', async () => {
  let snap = snapshot(), replies = 0;
  const platform = { config: { botLogin: 'bot' }, permission: async () => 'write', comments: async () => [], inlineComments: async () => [], snapshot: async () => ({ ...snap }), reply: async () => { replies++; } };
  const store = { getTarget: async () => ({ report: report() }), learnings: async () => [] };
  const workspaces = { prepare: async () => ({ context: { sourceDir: '/source' }, policy: {} }) };
  const model = { run: async () => { snap = { ...snap, headSha: 'c'.repeat(40) }; return { answer: 'old code advice', evidence: [], next: 'check code' }; } };
  const controller = new Controller(store, [], workspaces, model);
  const job = { id: 'job', body: { target: snapshot(), comment: { id: 'q1', author: 'joe', body: '@reviewbot explain behavior', parentId: null, discussionId: null, surface: 'issue' } } };
  await assert.rejects(() => controller.command(job, platform, async () => {}), /Answer snapshot changed/);
  assert.equal(replies, 0);
});
