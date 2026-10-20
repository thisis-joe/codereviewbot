import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../dist/controller.js';
import { snapshot, report, finding, choices, answerKey } from './fixtures.mjs';
import { questionId } from '../dist/learning.js';

const context = () => ({ sourceDir: '/source', files: { 'src/pay.ts': 'function pay() {\n charge();\n save();\n}' }, baseFiles: {}, excluded: [], limited: false, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch: '@@ -1 +1,4 @@\n+function pay() {\n+ charge();\n+ save();\n+}', lines: new Set([1, 2, 3, 4]), oldLines: new Set() } } });
const explain = () => choices().map(o => ({ id: o.id, explanation: `${o.id} 해설` }));
const extraQuestions = () => ['pay의 멱등 키가 만료되면 어떤 문제가 생기나요?', 'charge의 외부 부작용을 DB 트랜잭션만으로 되돌릴 수 없는 이유는 무엇인가요?', 'pay의 동시 재시도에서 멱등 키를 원자적으로 확보하는 방법은 무엇인가요?', 'save 실패 후 보상 동작은 어느 시점에 실행해야 하나요?', 'charge 응답 지연으로 타임아웃이 나면 재시도는 무엇을 보장해야 하나요?'].map(question => ({ question, path: 'src/pay.ts', line: 2, side: 'RIGHT', level: 'advanced', options: choices(), key: answerKey() }));
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
  const h = learningHarness('/reviewbot morequestion'); await h.run();
  assert.deepEqual(h.data.calls.map(c => c.phase), ['questions']);
  assert.equal(h.data.saved.questions.length, 5);
  assert.match(h.data.replies[0][1], /심화 질문/);
  assert.equal(new Set([...h.data.replies[0][1].matchAll(/codereviewbot:question:(Q-[a-f0-9]{12})/g)].map(m => m[1])).size, 5);
  assert.equal(h.data.saved.snapshot.headSha, 'b'.repeat(40));
});

test('a bare option letter is graded from the stored key without a model call and stays in the originating thread', async () => {
  const r = report(); r.questions[0].options = choices('새 키', '같은 키');
  const id = questionId(r.snapshot, r.questions[0]);
  for (const [answer, verdict] of [['B', /✅ 정답/], ['b입니다.', /✅ 정답/], ['A', /❌ 오답/]]) {
    const h = learningHarness(`/reviewbot answer ${id} ${answer}`, { report: r, comment: { parentId: 'root1' } }); await h.run();
    assert.equal(h.data.calls.length, 0); assert.equal(h.data.replies[0][2], 'root1');
    const body = h.data.replies[0][1]; assert.match(body, verdict); assert.match(body, /정답: \*\*B\*\*/); assert.match(body, /정답은 B입니다/);
    for (const option of ['A', 'B', 'C', 'D']) assert.match(body, new RegExp(`^\\*\\*${option}\\.\\*\\* .* — ${option} 보기 해설$`, 'm'));
    assert.deepEqual(h.data.saved.grades, [{ id, verdict: answer === 'A' ? 'incorrect' : 'correct' }]);
  }
});

test('reasoning goes to the model with the key, but the key alone decides right or wrong', async () => {
  const r = report(), id = questionId(r.snapshot, r.questions[0]);
  const output = verdict => ({ verdict, explanation: '이유 평가', expectedAnswer: '같은 키', optionExplanations: explain(), evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '호출' }] });
  for (const [answer, model, expected] of [['B 같은 키를 재사용합니다', 'incorrect', 'partial'], ['B 같은 키', 'unverifiable', 'correct'], ['A 새 키가 안전합니다', 'correct', 'incorrect'], ['B 같은 키', 'partial', 'partial']]) {
    const h = learningHarness(`/reviewbot answer ${id} ${answer}`, { report: r, output: output(model) }); await h.run();
    assert.equal(h.data.calls[0].phase, 'grade'); assert.match(h.data.calls[0].prompt, /정답은 B입니다/);
    assert.deepEqual(h.data.saved.grades, [{ id, verdict: expected }]); assert.match(h.data.replies[0][1], /\*\*답변 평가\*\*\n이유 평가/);
  }
});

test('several answers in one command are graded together in one reply', async () => {
  const r = report(), ids = r.questions.map(q => questionId(r.snapshot, q));
  const h = learningHarness('/reviewbot answer Q1 B Q2. A Q3:B', { report: r }); await h.run();
  assert.equal(h.data.calls.length, 0); assert.equal(h.data.replies.length, 1);
  assert.deepEqual(h.data.saved.grades, [{ id: ids[0], verdict: 'correct' }, { id: ids[1], verdict: 'incorrect' }, { id: ids[2], verdict: 'correct' }]);
  const body = h.data.replies[0][1];
  assert.match(body, /### Q1 · ✅ 정답[\s\S]*\n---\n[\s\S]*### Q2 · ❌ 오답[\s\S]*### Q3 · ✅ 정답/);
  assert.equal((body.match(/codereviewbot:reply:/g) ?? []).length, 1);
  const bad = learningHarness('/reviewbot answer Q1 B Q9 A Q1 C Q2 같은 키', { report: r }); await bad.run();
  assert.equal(bad.data.calls.length, 0); assert.equal(bad.data.saved.grades, undefined);
  for (const problem of [/Q9: .*찾을 수 없습니다/, /Q1: .*두 번/, /Q2: 보기 A·B·C·D 중 하나/]) assert.match(bad.data.replies[0][1], problem);
});

test('only a published grade records the answered question for the merge gate', async () => {
  const r = report(), id = questionId(r.snapshot, r.questions[0]);
  const graded = learningHarness(`/reviewbot answer ${id} B 같은 키를 씁니다.`, { report: r, output: { verdict: 'incorrect', explanation: '설명', expectedAnswer: '키 재사용', optionExplanations: explain(), evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: 'charge 호출' }] } });
  await graded.run(); assert.deepEqual(graded.data.saved.grades, [{ id, verdict: 'partial' }]);
  const more = learningHarness('/reviewbot morequestion'); await more.run(); assert.equal(more.data.saved.grades, undefined);
  const unknown = learningHarness('/reviewbot answer Q-ffffffffffff B'); await unknown.run(); assert.equal(unknown.data.saved.grades, undefined);
});

test('a plain reply to a single owned question is graded and unrelated comments are ignored', async () => {
  const r = report(), id = questionId(r.snapshot, r.questions[0]);
  const h = learningHarness('A 키를 다시 생성합니다.', { report: r, comment: { discussionId: 'discussion1' }, remote: [{ id: 'root1', author: 'bot', discussionId: 'discussion1', body: `<!-- codereviewbot:question:${id} -->` }], output: { verdict: 'incorrect', explanation: '재시도에는 같은 키가 필요합니다.', expectedAnswer: '키 재사용', optionExplanations: explain(), evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: 'charge 호출' }] } });
  await h.run(); assert.equal(h.data.calls[0].phase, 'grade'); assert.match(h.data.replies[0][1], /오답/); assert.equal(h.data.replies[0][3], 'discussion1');
  const ignored = learningHarness('답입니다.', { comment: { parentId: 'not-owned' } }); await ignored.run(); assert.equal(ignored.data.calls.length, 0);
});

test('old revisions, unknown IDs, missing review data and batch limits never invoke the model', async () => {
  const r = report(), id = questionId(r.snapshot, r.questions[0]);
  for (const h of [learningHarness(`/reviewbot answer ${id} B`, { snap: snapshot({ headSha: 'c'.repeat(40) }) }), learningHarness('/reviewbot answer Q-ffffffffffff B'), learningHarness('/reviewbot morequestion', { report: null }), learningHarness('/reviewbot morequestion', { batches: Array.from({ length: 5 }, () => ({ snapshot: snapshot(), questions: extraQuestions() })) })]) {
    await h.run(); assert.equal(h.data.calls.length, 0); assert.equal(h.data.replies.length, 1);
  }
  const denied = learningHarness('/reviewbot morequestion', { permission: 'none' }); await denied.run(); assert.equal(denied.data.calls.length, 0); assert.equal(denied.data.replies.length, 0);
});

test('retries reuse the durable batch and an already published marker suppresses duplicates', async () => {
  const h = learningHarness('/reviewbot morequestion', { replyError: true });
  await assert.rejects(() => h.run(), /network lost/); assert.ok(h.data.saved);
  h.data.replyError = false;
  await h.run({ command_result: h.data.saved }); assert.equal(h.data.calls.length, 1);
  h.data.remote = [{ id: 'botreply', author: 'bot', body: h.data.saved.body }];
  await h.run({ command_result: h.data.saved }); assert.equal(h.data.replies.length, 2);
});

test('unverifiable answers remain ungraded and incomplete choice explanations cannot be posted', async () => {
  const r = report(); delete r.questions[0].key; delete r.questions[0].level; const id = questionId(r.snapshot, r.questions[0]);
  const h = learningHarness(`${id}: C 제 생각에는 순서가 중요합니다.`, { report: r, output: { verdict: 'unverifiable', explanation: '외부 API 계약을 확인하지 못했습니다.', expectedAnswer: 'API의 멱등 계약 확인이 필요합니다.', optionExplanations: explain(), evidence: [] } });
  await h.run(); assert.match(h.data.replies[0][1], /판정 보류/);
  const bad = learningHarness(`${id}: B 같은 키입니다.`, { report: r, output: { verdict: 'correct', explanation: '맞음', expectedAnswer: '동일 키', optionExplanations: explain(), evidence: [{ path: 'missing.ts', line: 1, side: 'RIGHT', reason: '추측' }] } });
  await assert.rejects(() => bad.run(), /근거/); assert.equal(bad.data.replies.length, 0);
  r.questions[0].options = choices('새 키', '같은 키');
  const choice = learningHarness(`/reviewbot answer ${questionId(r.snapshot, r.questions[0])} B 같은 요청`, { report: r, output: { verdict: 'correct', explanation: '맞음', expectedAnswer: '동일 키', optionExplanations: [{ id: 'B', explanation: '동일 요청' }], evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '호출' }] } });
  await assert.rejects(() => choice.run(), /보기/); assert.equal(choice.data.replies.length, 0);
});

test('display numbers resolve to review questions first and then continue through follow-up batches', async () => {
  const grade = { verdict: 'correct', explanation: '맞습니다.', expectedAnswer: '같은 키', optionExplanations: explain(), evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '호출' }] };
  const r = report(), extra = extraQuestions();
  const second = learningHarness('/reviewbot answer Q2 B', { report: r, output: grade }); await second.run();
  assert.deepEqual(second.data.saved.grades, [{ id: questionId(r.snapshot, r.questions[1]), verdict: 'correct' }]); assert.match(second.data.replies[0][1], /^### Q2 · ✅ 정답$/m);
  assert.match(second.data.replies[0][1], /^내 답: \*\*B\*\* · 정답: \*\*B\*\*$/m);
  const batch = learningHarness('/reviewbot answer 심화2 C', { report: r, batches: [{ snapshot: snapshot(), questions: extra, start: 1 }], output: grade }); await batch.run();
  assert.deepEqual(batch.data.saved.grades, [{ id: questionId(r.snapshot, extra[1]), verdict: 'incorrect' }]); assert.match(batch.data.replies[0][1], /^### 심화2 · ❌ 오답$/m); assert.doesNotMatch(batch.data.replies[0][1], /\[심화\]/);
  const clash = learningHarness('/reviewbot answer Q5 C', { report: r, batches: [{ snapshot: snapshot(), questions: extra, start: 1 }] }); await clash.run();
  assert.equal(clash.data.saved.grades, undefined); assert.match(clash.data.replies[0][1], /Q5: .*찾을 수 없습니다/);
  const mixed = learningHarness('/reviewbot answer Q1 B 심화1 B', { report: r, batches: [{ snapshot: snapshot(), questions: extra, start: 1 }] }); await mixed.run();
  assert.deepEqual(mixed.data.saved.grades.map(g => g.id), [questionId(r.snapshot, r.questions[0]), questionId(r.snapshot, extra[0])]);
  const fresh = ['pay 재시도 사이 키 저장소 장애는 어떻게 다뤄야 하나요?', 'charge 응답 코드별 재시도 정책은 어떻게 나누나요?', 'save 실패를 재현하는 테스트는 어떤 경계에서 작성하나요?', 'pay 로그에 남길 멱등 키 정보는 무엇인가요?', 'charge 호출 순서를 바꾸면 어떤 불변 조건이 깨지나요?'].map(question => ({ ...extra[0], question }));
  const more = learningHarness('/reviewbot morequestion', { report: r, batches: [{ snapshot: snapshot(), questions: extra }], output: { questions: fresh } }); await more.run();
  assert.equal(more.data.saved.start, 6); assert.match(more.data.replies[0][1], /^\*\*심화6\. pay /m); assert.match(more.data.replies[0][1], /^\*\*심화10\. /m);
  assert.doesNotMatch(more.data.replies[0][1], /^\*\*Q\d/m); assert.match(more.data.replies[0][1], /`\/reviewbot answer 심화1 B`/); assert.doesNotMatch(more.data.replies[0][1], /^\*\*Q1\. /m);
  const missing = learningHarness('/reviewbot answer Q4 B', { report: r }); await missing.run();
  assert.equal(missing.data.calls.length, 0); assert.match(missing.data.replies[0][1], /찾을 수 없습니다/);
});

test('choice questions ask for an option letter before spending a grading call', async () => {
  for (const answer of ['같은 키를 씁니다.', 'Because the key is reused', 'E']) {
    const h = learningHarness(`/reviewbot answer Q1 ${answer}`); await h.run();
    assert.equal(h.data.calls.length, 0); assert.match(h.data.replies[0][1], /보기 A·B·C·D 중 하나로 답하세요[\s\S]*Q1 B/);
  }
});

test('extra learning rejects repeated questions and anchors outside the current change', async () => {
  for (const q of [report().questions[0], { ...extraQuestions()[0], path: 'unrelated.ts' }]) {
    const h = learningHarness('/reviewbot morequestion', { output: { questions: [q, ...extraQuestions().slice(1)] } });
    await assert.rejects(() => h.run(), /중복|근거/); assert.equal(h.data.replies.length, 0);
  }
});

test('a supplementary question can be answered after controller restart', async () => {
  const questions = extraQuestions(), id = questionId(snapshot(), questions[1]);
  const h = learningHarness(`${id}: B 되돌릴 수 없으니 보상 동작이 필요합니다.`, { batches: [{ snapshot: snapshot(), questions }], output: { verdict: 'partial', explanation: '보상 동작은 적절하며 중복 승인 방지도 함께 필요합니다.', expectedAnswer: '외부 승인에는 멱등 요청과 보상 동작을 설계합니다.', optionExplanations: explain(), evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '외부 승인' }] } });
  await h.run(); assert.match(h.data.replies[0][1], /부분 정답/);
});

test('a same-revision supplementary question remains answerable after a full review fails', async () => {
  const questions = extraQuestions(), id = questionId(snapshot(), questions[0]);
  const h = learningHarness(`${id}: B 같은 요청을 식별합니다.`, { report: report({ state: 'failed', questions: [] }), batches: [{ snapshot: snapshot(), questions }], output: { verdict: 'partial', explanation: '실패 복구도 고려해야 합니다.', expectedAnswer: '멱등 식별과 복구', optionExplanations: explain(), evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '승인' }] } });
  await h.run(); assert.equal(h.data.calls.length, 1); assert.equal(h.data.calls[0].phase, 'grade'); assert.match(h.data.replies[0][1], /부분 정답/);
});

test('natural GitHub answers find owned question replies under the root and ask for IDs when ambiguous', async () => {
  const r = report(), id = questionId(snapshot(), r.questions[0]);
  const remote = [{ id: 'root', author: 'bot', body: '<!-- codereviewbot:finding:v1:CRB-0001 -->' }, { id: 'reply', parentId: 'root', author: 'bot', body: `<!-- codereviewbot:question:${id} -->` }];
  const h = learningHarness('B 동일한 키로 재시도합니다.', { remote, comment: { parentId: 'root' }, output: { verdict: 'correct', explanation: '맞습니다.', expectedAnswer: '동일 키 재시도', optionExplanations: explain(), evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '승인' }] } });
  await h.run(); assert.equal(h.data.calls[0].phase, 'grade');
  const second = questionId(snapshot(), r.questions[1]);
  const ambiguous = learningHarness('B입니다.', { remote: [...remote, { id: 'other-reply', parentId: 'root', author: 'bot', body: `<!-- codereviewbot:question:${second} -->` }], comment: { parentId: 'root' } });
  await ambiguous.run(); assert.equal(ambiguous.data.calls.length, 0); assert.match(ambiguous.data.replies[0][1], /질문 번호/);
});

test('a push during learning prevents storing or publishing the obsolete result', async () => {
  const h = learningHarness('/reviewbot morequestion'); h.data.onModel = () => { h.data.snap = snapshot({ startSha: 'c'.repeat(40) }); };
  await assert.rejects(() => h.run(), /Learning snapshot changed/); assert.equal(h.data.saved, null); assert.equal(h.data.replies.length, 0);
  const retry = learningHarness('/reviewbot morequestion', { replyError: true }); await assert.rejects(() => retry.run(), /network/);
  retry.data.replyError = false; retry.data.snap = snapshot({ headSha: 'c'.repeat(40) });
  await retry.run({ command_result: retry.data.saved }); assert.equal(retry.data.calls.length, 1); assert.match(retry.data.replies[1][1], /코드 기준/);
});

test('same-revision report replacement keeps old question IDs answerable and excluded from new batches', async () => {
  const old = extraQuestions(), id = questionId(snapshot(), old[0]);
  const h = learningHarness(`${id}: A 같은 요청입니다.`, { history: old, output: { verdict: 'partial', explanation: '복구도 필요합니다.', expectedAnswer: '요청 식별과 복구', optionExplanations: explain(), evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '호출' }] } });
  await h.run(); assert.equal(h.data.calls[0].phase, 'grade');
  const duplicate = learningHarness('/reviewbot morequestion', { history: old }); await assert.rejects(() => duplicate.run(), /중복/);
});

test('large but valid accumulated learning context fits the runner prompt boundary', async () => {
  const options = ['A', 'B', 'C', 'D', 'E'].map(id => ({ id, text: id + 'x'.repeat(299) }));
  const questions = Array.from({ length: 50 }, (_, i) => ({ question: String(i).padStart(3, '0') + 'q'.repeat(497), path: 'src/pay.ts', line: 2, side: 'RIGHT', options }));
  const h = learningHarness('/reviewbot morequestion', { report: report({ questions: questions.slice(0, 10) }), batches: [0, 1, 2, 3].map(i => ({ snapshot: snapshot(), questions: questions.slice((i + 1) * 10, (i + 2) * 10) })), policy: { pathInstructions: Array.from({ length: 25 }, (_, i) => ({ path: `src/${i}`, instructions: 'p'.repeat(4000) })) }, learnings: Array(20).fill('l'.repeat(4000)), context: { ...context(), diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch: '@@ -0,0 +1 @@\n+' + '\t'.repeat(139000), lines: new Set([1, 2]) } } } });
  await h.run(); assert.ok(h.data.calls[0].prompt.length <= 500000); assert.match(h.data.replies[0][1], /심화 질문/);
  assert.ok(h.data.calls[0].prompt.includes(questions[49].question));
});

test('malformed answer commands ask for usage instead of grading the command as an answer', async () => {
  const id = questionId(snapshot(), report().questions[0]);
  const h = learningHarness(`/reviewbot answer ${id}`, { remote: [{ id: 'root', author: 'bot', body: `<!-- codereviewbot:question:${id} -->` }], comment: { parentId: 'root' } });
  await h.run(); assert.equal(h.data.calls.length, 0); assert.match(h.data.replies[0][1], /reviewbot answer/);
});

test('GitHub comment surfaces prevent numeric ID collisions in replies and thread inference', async () => {
  const id = questionId(snapshot(), report().questions[0]);
  const h = learningHarness(`/reviewbot answer ${id} B 같은 키`, { comment: { id: '10', surface: 'review', parentId: 'root' }, remote: [{ id: 'botreply', author: 'bot', surface: 'issue', body: '<!-- codereviewbot:reply:issue-10 -->' }], output: { verdict: 'correct', explanation: '맞습니다.', expectedAnswer: '같은 키', optionExplanations: explain(), evidence: [{ path: 'src/pay.ts', line: 2, side: 'RIGHT', reason: '호출' }] } });
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
  for (const id of ['A', 'B', 'C', 'D', 'E']) assert.match(h.data.replies[0][1], new RegExp(`^\\*\\*${id}\\.\\*\\*`, 'm'));
});

test('oversized follow-up batches keep all five questions and their choices within the comment budget', async () => {
  const path = Array(5).fill('漢'.repeat(99)).join('/');
  const questions = Array.from({ length: 5 }, (_, i) => ({ question: '&'.repeat(498) + i, path, line: 1, side: 'RIGHT', level: 'advanced', options: ['A', 'B', 'C', 'D'].map(id => ({ id, text: '&'.repeat(299) + id })), key: answerKey() }));
  const h = learningHarness('/reviewbot morequestion', { output: { questions }, context: { ...context(), files: { [path]: 'source' }, diff: { [path]: { oldPath: path, patch: '@@ -0,0 +1 @@\n+source', lines: new Set([1]) } } } });
  await h.run(); const body = h.data.replies[0][1]; assert.ok(body.length <= 60000, `got ${body.length}`);
  assert.equal(h.data.saved.questions.length, 5); assert.equal([...body.matchAll(/^\*\*심화\d+\. /gm)].length, 5);
  assert.equal([...body.matchAll(/^(&nbsp;){4}\*\*[A-D]\.\*\* /gm)].length, 20); assert.match(body, /코드 링크를 경로 표기로/);
  assert.ok(!body.includes(answerKey().explanation));
});

test('the @reviewbot prompt never carries answer keys', async () => {
  const h = learningHarness('@reviewbot Q1 정답이 뭐야?', { output: { answer: '코드를 보세요.', evidence: [], next: '확인' } }); await h.run();
  assert.equal(h.data.calls[0].phase, 'answer'); assert.ok(!h.data.calls[0].prompt.includes('보기 해설')); assert.ok(!h.data.calls[0].prompt.includes('"key"'));
  assert.ok(h.data.calls[0].prompt.includes(h.data.report.questions[0].question));
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

function findingHarness(body, comment = {}) {
  const findings = [finding({ id: 'CRB-0001', status: 'new' }), finding({ id: 'CRB-0002', status: 'open', line: 3 }), finding({ id: 'CRB-0003', status: 'fixed' })];
  const data = { prompts: [], replies: [], dismissed: [] };
  const platform = { config: { botLogin: 'bot' }, permission: async () => 'write', owned: c => c.author === 'bot',
    comments: async () => [], inlineComments: async () => [{ id: 'root2', author: 'bot', surface: 'review', body: '<!-- codereviewbot:finding:v1:CRB-0002 -->\n### [보통][정확성] 문제' }],
    snapshot: async () => snapshot(), reply: async (_n, text) => { data.replies.push(text); } };
  const store = { getTarget: async () => ({ report: report({ findings }) }), learnings: async () => [], dismiss: async (_t, id) => { data.dismissed.push(id); return true; }, enqueue: async () => 'job2' };
  const workspaces = { prepare: async () => ({ context: { sourceDir: '/source' }, policy: {} }) };
  const model = { run: async (_phase, prompt) => { data.prompts.push(prompt); return { answer: '설명', evidence: [], next: '확인' }; } };
  const job = { id: 'job', body: { target: snapshot(), comment: { id: 'c1', author: 'joe', body, parentId: null, discussionId: null, surface: 'issue', ...comment } } };
  return { data, run: () => new Controller(store, [], workspaces, model).command(job, platform, async () => {}) };
}
const promptFindings = prompt => JSON.parse(prompt.slice(prompt.indexOf('{'))).findings.map(f => f.id);

test('explain without an ID covers the finding thread it replies in, or every open finding from a plain comment', async () => {
  const thread = findingHarness('/reviewbot explain', { surface: 'review', parentId: 'root2' }); await thread.run();
  assert.deepEqual(promptFindings(thread.data.prompts[0]), ['CRB-0002']);
  const plainComment = findingHarness('/reviewbot explain'); await plainComment.run();
  assert.deepEqual(promptFindings(plainComment.data.prompts[0]), ['CRB-0001', 'CRB-0002'], 'fixed findings are not re-explained');
  const named = findingHarness('/reviewbot explain CRB-0001', { surface: 'review', parentId: 'root2' }); await named.run();
  assert.deepEqual(promptFindings(named.data.prompts[0]), ['CRB-0001'], 'an explicit ID wins over the thread');
});

test('dismiss without an ID only works inside a finding thread', async () => {
  const thread = findingHarness('/reviewbot dismiss 의도된 동작', { surface: 'review', parentId: 'root2' }); await thread.run();
  assert.deepEqual(thread.data.dismissed, ['CRB-0002']);
  assert.match(thread.data.replies[0], /CRB\\-0002 지적을 기각했습니다/);
  const plainComment = findingHarness('/reviewbot dismiss 의도된 동작'); await plainComment.run();
  assert.deepEqual(plainComment.data.dismissed, []);
  assert.match(plainComment.data.replies[0], /어떤 지적을 기각할지 알 수 없습니다/);
});
