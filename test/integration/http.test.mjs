import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import pg from 'pg';
import { Store } from '../../dist/store.js';
import { application } from '../../dist/application.js';
import { Controller } from '../../dist/controller.js';
import { analysis, finding, snapshot } from '../fixtures.mjs';
import { parsePatch } from '../../dist/review.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL required');
test('signed HTTP admission, database work, two-pass result and replay-safe publication work end to end', async t => {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL }); t.after(() => pool.end());
  const store = new Store(pool); await store.migrate(); await pool.query('TRUNCATE deliveries,jobs,feedback,targets CASCADE');
  const comments = [], inline = [];
  const config = { platform: 'github', instance: 'https://api.github.com', repository: 'joe/demo', botLogin: 'bot', webhookSecretEnv: 'HOOK_SECRET', webhookAuth: 'hmac', tokenEnv: 'TOKEN', enabled: true };
  const platform = { config, target: n => ({ ...snapshot(), number: n }), snapshot: async () => snapshot(), checks: async () => [], linkedIssues: async () => [], permission: async () => 'write',
    comments: async () => comments, inlineComments: async () => inline, owned: c => c.author === 'bot',
    comment: async (n, body, id) => { const existing = comments.find(c => c.id === id); if (existing) existing.body = body; else comments.push({ id: '1', body, author: 'bot' }); },
    inline: async (s, value) => { inline.push({ id: '2', body: value.body, author: 'bot' }); },
  };
  const patch = '@@ -1,2 +1,2 @@\n function pay() {\n+charge();\n';
  const workspaces = { prepare: async () => ({ policy: { version: 1, pathInstructions: [], exclude: [], maxInlineComments: 5 }, guidelines: [], mode: 'full', context: { files: { 'src/pay.ts': 'function pay() {\ncharge();\n}' }, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch, lines: parsePatch(patch) } }, excluded: [], limited: false, sourceDir: '/snapshots/source' } }), cleanup: async () => {} };
  const checks = ['정확성·신뢰성','보안','성능','호환성','테스트','팀 규칙·요구사항'].map(name => ({ name, status: 'clear', detail: '관련 코드 검토', url: null }));
  const model = { run: async phase => phase === 'review' ? analysis({ checks, findings: [finding({ line: 2, evidence: [{ path: 'src/pay.ts', line: 2, reason: '승인 호출' }] })] }) : { decisions: [{ id: 'C-1', decision: 'confirmed', reason: '재시도 흐름 확인' }], resolutions: [] } };
  const controller = new Controller(store, [platform], workspaces, model, 0);
  const server = application(controller, [config], { INTERNAL_TOKEN: 'internal-test-secret', HOOK_SECRET: 'hook-test-secret' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = JSON.stringify({ action: 'synchronize', repository: { full_name: 'joe/demo' }, pull_request: { number: 1, head: { sha: 'b'.repeat(40) } } });
  const headers = { 'content-type': 'application/json', 'x-github-event': 'pull_request', 'x-github-delivery': 'http-1', 'x-hub-signature-256': 'sha256=' + createHmac('sha256','hook-test-secret').update(body).digest('hex') };
  assert.equal((await fetch(base+'/internal/tick', { method:'POST' })).status, 401);
  assert.equal((await fetch(base+'/webhooks/github', { method:'POST', headers: { ...headers, 'x-hub-signature-256':'invalid' }, body })).status, 401);
  for (let i=0;i<2;i++) assert.equal((await fetch(base+'/webhooks/github', { method:'POST', headers, body })).status, 202);
  const tick = async () => { const response = await fetch(base+'/internal/tick', { method:'POST', headers:{ authorization:'Bearer internal-test-secret' } }); assert.equal(response.status,202); await controller.active; };
  await tick(); await tick(); await tick();
  assert.equal(comments.length,1); assert.equal(inline.length,1);
  assert.match(comments[0].body,/수정 필요/); assert.match(inline[0].body,/CRB-0001/);
  assert.equal((await store.health()).queued,0);
});
