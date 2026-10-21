import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { answerGate, requiredQuestions, syncAnswerGate, GATE_CONTEXT } from '../dist/answer-gate.js';
import { questionId } from '../dist/learning.js';
import { Platform } from '../dist/platform.js';
import { report, snapshot, choices, answerKey } from './fixtures.mjs';

const gated = (o = {}) => report({ requireAnswers: true, ...o });
const ids = r => r.questions.map(q => questionId(r.snapshot, q));

test('the gate is off unless the repository policy requires answers', () => {
  assert.equal(answerGate(report(), new Set()), null);
});

test('every visible question must be answered, whatever the grade', () => {
  const r = gated(), all = ids(r);
  assert.deepEqual(answerGate(r, new Set()), { state: 'pending', description: `질문 답변 0/3` });
  assert.match(answerGate(r, new Set(all.slice(0, 2))).description, /2\/3/);
  assert.equal(answerGate(r, new Set(all)).state, 'success');
  assert.equal(answerGate(r, new Set(['Q-ffffffffffff', ...all.slice(1)])).state, 'pending');
});

test('failed reviews block and reviews without possible questions pass', () => {
  assert.equal(answerGate(gated({ state: 'failed', questions: [] }), new Set()).state, 'pending');
  assert.equal(answerGate(gated({ state: 'partial', questions: [], questionsUnavailableReason: '텍스트 변경 없음' }), new Set()).state, 'success');
});

test('a shortened report only requires the questions it shows', () => {
  const questions = Array.from({ length: 10 }, (_, i) => ({ question: `pay 변경 질문 ${i}: 재시도 시 어떤 조건이 유지되나요?`, path: 'src/pay.ts', line: 2, side: 'RIGHT', level: 'basic', options: choices(), key: answerKey() }));
  const long = gated({ questions: questions.map(q => ({ ...q, path: Array(6).fill('漢'.repeat(82)).join('/'), question: '&'.repeat(480) + q.question, options: choices(...Array(4).fill('&'.repeat(299))) })) });
  assert.equal(requiredQuestions(gated({ questions })).length, 10);
  assert.equal(requiredQuestions(long).length, 3);
});

test('syncing posts only when the status changes', async () => {
  const posted = [];
  let current = null;
  const platform = { gateStatus: async () => current, setGateStatus: async (s, gate) => { posted.push(gate); current = gate; } };
  const r = gated(), store = { answeredQuestions: async () => new Set(ids(r).slice(0, 1)) };
  await syncAnswerGate(platform, store, r); await syncAnswerGate(platform, store, r);
  assert.equal(posted.length, 1); assert.match(posted[0].description, /1\/3/);
  await syncAnswerGate(platform, { answeredQuestions: async () => { throw Error('must not query'); } }, report());
  assert.equal(posted.length, 1);
});

test('providers write the gate as a commit status and keep it out of CI results', async t => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
    res.setHeader('content-type', 'application/json');
    if (req.url.includes('check-runs')) res.end('{"check_runs":[]}');
    else if (req.url.endsWith('/status')) res.end(JSON.stringify({ statuses: [{ context: GATE_CONTEXT, state: 'pending', description: '질문 답변 0/3' }, { context: 'ci/test', state: 'success' }] }));
    else if (req.url.includes('/merge_requests/1/pipelines')) res.end(JSON.stringify([{ id: 9, sha: 'b'.repeat(40), source: 'external' }, { id: 7, sha: 'b'.repeat(40), source: 'merge_request_event' }]));
    else if (req.url.includes('/repository/commits/')) res.end(JSON.stringify([{ id: 1, status: 'pending', description: 'old' }, { id: 2, status: 'success', description: 'new' }]));
    else res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const instance = `http://127.0.0.1:${server.address().port}`, snap = snapshot();
  const repo = { platform: 'github', instance, repository: 'joe/demo', botLogin: 'reviewbot[bot]', webhookSecretEnv: 'HOOK_SECRET', tokenEnv: 'TOKEN', webhookAuth: 'hmac' };
  const gh = new Platform(repo, async () => 'token');
  assert.deepEqual(await gh.gateStatus(snap), { state: 'pending', description: '질문 답변 0/3' });
  assert.deepEqual((await gh.checks(snap)).map(c => c.name), ['CI: ci/test']);
  await gh.setGateStatus(snap, { state: 'success', description: '질문 3개에 모두 답했습니다.' });
  const ghPost = requests.find(r => r.method === 'POST');
  assert.equal(ghPost.url, `/repos/joe/demo/statuses/${'b'.repeat(40)}`);
  assert.deepEqual(ghPost.body, { state: 'success', context: GATE_CONTEXT, description: '질문 3개에 모두 답했습니다.', target_url: snap.webUrl });
  requests.length = 0;
  const gl = new Platform({ ...repo, platform: 'gitlab', repository: 'group/demo' }, async () => 'token');
  assert.deepEqual(await gl.gateStatus(snap), { state: 'success', description: 'new' });
  await gl.setGateStatus(snap, { state: 'pending', description: '질문 답변 1/3' });
  const glPost = requests.find(r => r.method === 'POST');
  assert.equal(glPost.body.name, GATE_CONTEXT); assert.equal(glPost.body.pipeline_id, 7);
});

test('the policy flag is opt-in and leaves existing policy versions unchanged', async () => {
  const { readPolicy, policyVersion } = await import('../dist/policy.js');
  assert.equal(readPolicy('requireAnswers: true').requireAnswers, true);
  assert.equal('requireAnswers' in readPolicy(''), false);
  assert.equal(policyVersion(readPolicy(''), [], []), policyVersion({ version: 1, pathInstructions: [], exclude: [], maxInlineComments: 5 }, [], []));
  assert.throws(() => readPolicy('requireAnswers: "yes"'));
});
