import test from 'node:test';
import assert from 'node:assert/strict';
import { publish } from '../dist/publish.js';
import { parseCommand } from '../dist/commands.js';
import { report, finding, answerKey } from './fixtures.mjs';
import { questionId } from '../dist/learning.js';

function platform({ stale = false, lostResponse = false } = {}) {
  const comments = [], inline = [];
  return { config: { botLogin: 'bot' }, owned: c => c.author === 'bot', snapshot: async () => ({ ...report().snapshot, ...(stale ? { headSha: 'c'.repeat(40) } : {}) }),
    comments: async () => comments, inlineComments: async () => inline,
    comment: async (n, body, id) => { const item = comments.find(c => c.id === id); if (item) item.body = body; else comments.push({ id: String(comments.length + 1), body, author: 'bot' }); if (lostResponse) { lostResponse = false; throw Error('response lost'); } },
    inline: async (s, value) => { inline.push({ id: String(inline.length + 1), body: value.body, author: 'bot', input: value }); }, stored: { comments, inline } };
}
test('publishing reconciles a remote summary accepted before response loss', async () => {
  const p = platform({ lostResponse: true }); const r = report({ findings: [finding({ id: 'CRB-0001' })] });
  await assert.rejects(() => publish(p, r, { 'src/pay.ts': { oldPath: 'src/pay.ts' } }, 5, async () => {}));
  await publish(p, r, { 'src/pay.ts': { oldPath: 'src/pay.ts' } }, 5, async () => {});
  await publish(p, r, { 'src/pay.ts': { oldPath: 'src/pay.ts' } }, 5, async () => {});
  assert.equal(p.stored.comments.length, 1); assert.equal(p.stored.inline.length, 0);
});
test('changed head or a lost lease prevents all remote writes', async () => {
  const stale = platform({ stale: true });
  await assert.rejects(() => publish(stale, report(), {}, 5, async () => {}), /snapshot/);
  assert.equal(stale.stored.comments.length, 0);
  const p = platform(); await assert.rejects(() => publish(p, report(), {}, 5, async () => { throw Error('lease lost'); }));
  assert.equal(p.stored.comments.length, 0);
});
test('commands distinguish explicit dismiss/learning approval from ordinary conversation', () => {
  assert.deepEqual(parseCommand('/reviewbot dismiss CRB-0002 intentional fallback'), { action: 'dismiss', id: 'CRB-0002', text: 'intentional fallback' });
  assert.equal(parseCommand('/reviewbot dismiss CRB-0002'), null);
  assert.deepEqual(parseCommand('/reviewbot dismiss 의도된 동작'), { action: 'dismiss', id: null, text: '의도된 동작' }, 'a thread reply supplies the finding');
  assert.deepEqual(parseCommand('/reviewbot explain'), { action: 'explain', id: null });
  assert.deepEqual(parseCommand('/reviewbot explain CRB-0003'), { action: 'explain', id: 'CRB-0003' });
  assert.equal(parseCommand('/reviewbot explain why'), null);
  assert.deepEqual(parseCommand('/reviewbot approve 11111111-1111-4111-8111-111111111111'), { action: 'approve', id: '11111111-1111-4111-8111-111111111111' });
  assert.equal(parseCommand('unrelated comment'), null);
  assert.equal(parseCommand('@reviewbot why is this unsafe?').action, 'ask');
});

test('archived review output never posts findings and cannot crowd out questions', async () => {
  const p = platform();
  const path = Array(5).fill('&'.repeat(99)).join('/');
  const r = report({ findings: [finding({ id: 'CRB-0001', problem: 'p'.repeat(6000), condition: 'c'.repeat(6000), impact: 'i'.repeat(6000), evidence: Array.from({ length: 12 }, () => ({ path: 'src/pay.ts', line: 4, side: 'RIGHT', reason: 'r'.repeat(6000) })) }), ...Array.from({ length: 39 }, (_, i) => finding({ id: `CRB-${String(i + 2).padStart(4, '0')}`, path, title: '&'.repeat(160) }))] });
  await publish(p, r, { 'src/pay.ts': { oldPath: 'src/pay.ts' } }, 5, async () => {});
  const body = p.stored.comments[0].body; assert.ok(body.length <= 60000);
  assert.doesNotMatch(body, /### [1-4]\.|CRB-0001|수정 필요/); assert.equal([...body.matchAll(/^\*\*Q\d+\. /gm)].length, 3);
  assert.equal(p.stored.inline.length, 0);
});
test('each review question gets one inline thread on its diff line and the summary shows recorded grades', async () => {
  const p = platform(), r = report(); r.questions[2] = { ...r.questions[2], line: 9 };
  const diff = { 'src/pay.ts': { oldPath: 'src/pay.ts', positions: { LEFT: {}, RIGHT: { 2: { newLine: 2 } } } } };
  const ids = r.questions.map(q => questionId(r.snapshot, q));
  await publish(p, r, diff, 5, async () => {}, new Map([[ids[0], 'correct']]));
  const threads = p.stored.inline.filter(c => c.body.includes('codereviewbot:question:'));
  assert.equal(threads.length, 2, 'line 9 is outside the hunk, so Q3 stays in the summary only');
  assert.match(threads[0].body, new RegExp(`<!-- codereviewbot:question:${ids[0]} -->\\n\\*\\*Q1\\. \\[기본\\] `)); assert.match(threads[1].body, /\*\*Q2\. /);
  assert.match(threads[0].body, /^(&nbsp;){4}\*\*D\.\*\* /m); assert.match(threads[0].body, /보기 문자\(A~D\)만 답글로/);
  assert.deepEqual(threads[0].input.coordinates, { newLine: 2 }); assert.ok(!threads[0].body.includes(answerKey().explanation));
  assert.match(p.stored.comments[0].body, /^\*\*Q1\. .* · ✅ 정답\\$/m); assert.match(p.stored.comments[0].body, /답변 1\/3/);
  await publish(p, r, diff, 5, async () => {});
  assert.equal(p.stored.inline.filter(c => c.body.includes('codereviewbot:question:')).length, 2);
});
