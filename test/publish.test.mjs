import test from 'node:test';
import assert from 'node:assert/strict';
import { publish } from '../dist/publish.js';
import { parseCommand } from '../dist/commands.js';
import { report, finding } from './fixtures.mjs';

function platform({ stale = false, lostResponse = false } = {}) {
  const comments = [], inline = [];
  return { config: { botLogin: 'bot' }, owned: c => c.author === 'bot', snapshot: async () => ({ ...report().snapshot, ...(stale ? { headSha: 'c'.repeat(40) } : {}) }),
    comments: async () => comments, inlineComments: async () => inline,
    comment: async (n, body, id) => { const item = comments.find(c => c.id === id); if (item) item.body = body; else comments.push({ id: String(comments.length + 1), body, author: 'bot' }); if (lostResponse) { lostResponse = false; throw Error('response lost'); } },
    inline: async (s, value) => { inline.push({ id: String(inline.length + 1), body: value.body, author: 'bot' }); }, stored: { comments, inline } };
}
test('publishing reconciles a remote summary accepted before response loss', async () => {
  const p = platform({ lostResponse: true }); const r = report({ findings: [finding({ id: 'CRB-0001' })] });
  await assert.rejects(() => publish(p, r, { 'src/pay.ts': { oldPath: 'src/pay.ts' } }, 5, async () => {}));
  await publish(p, r, { 'src/pay.ts': { oldPath: 'src/pay.ts' } }, 5, async () => {});
  await publish(p, r, { 'src/pay.ts': { oldPath: 'src/pay.ts' } }, 5, async () => {});
  assert.equal(p.stored.comments.length, 1); assert.equal(p.stored.inline.length, 1);
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
  assert.deepEqual(parseCommand('/reviewbot approve 11111111-1111-4111-8111-111111111111'), { action: 'approve', id: '11111111-1111-4111-8111-111111111111' });
  assert.equal(parseCommand('unrelated comment'), null);
  assert.equal(parseCommand('@reviewbot why is this unsafe?').action, 'ask');
});

test('large valid review output remains publishable with all fixed sections and visible truncation', async () => {
  const p = platform();
  const path = Array(5).fill('&'.repeat(99)).join('/');
  const r = report({ findings: [finding({ id: 'CRB-0001', problem: 'p'.repeat(6000), condition: 'c'.repeat(6000), impact: 'i'.repeat(6000), evidence: Array.from({ length: 12 }, () => ({ path: 'src/pay.ts', line: 4, side: 'RIGHT', reason: 'r'.repeat(6000) })) }), ...Array.from({ length: 39 }, (_, i) => finding({ id: `CRB-${String(i + 2).padStart(4, '0')}`, path, title: '&'.repeat(160) }))] });
  await publish(p, r, { 'src/pay.ts': { oldPath: 'src/pay.ts' } }, 5, async () => {});
  const body = p.stored.comments[0].body; assert.ok(body.length <= 60000);
  for (let i = 1; i <= 4; i++) assert.ok(body.includes(`### ${i}.`));
  assert.match(body, /축약/); assert.equal([...body.matchAll(/^\d+\. /gm)].length, 3); assert.match(body, /CRB-0001/);
  assert.equal(p.stored.inline.length, 1); assert.ok(p.stored.inline[0].body.length <= 60000);
});
