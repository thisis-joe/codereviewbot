import { createServer } from 'node:http';
import pg from 'pg';
import { Store } from '../dist/store.js';
import { Controller } from '../dist/controller.js';
import { application } from '../dist/application.js';
import { parsePatch } from '../dist/review.js';
import { snapshot, initialQuestions } from './fixtures.mjs';

if (!process.env.TEST_DATABASE_URL?.endsWith('/hey_n8n_test')) throw new Error('Disposable n8n database required');
const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
const store = new Store(pool); await store.migrate();
const snap = snapshot(), comments = [], calls = [];
const config = { platform: 'github', instance: snap.instance, repository: snap.repository, botLogin: 'bot', webhookSecretEnv: 'HOOK_SECRET', webhookAuth: 'hmac', tokenEnv: 'TOKEN', enabled: true };
const platform = { config, snapshot: async () => ({ ...snap }), linkedIssues: async () => [], permission: async () => 'write', comments: async () => comments, inlineComments: async () => [], owned: c => c.author === 'bot', openNumbers: async () => [],
  comment: async (_n, body, id) => { const old = comments.find(c => c.id === id); if (old) old.body = body; else comments.push({ id: String(comments.length + 1), body, author: 'bot', surface: 'issue' }); },
  reply: async (_n, body) => { comments.push({ id: String(comments.length + 1), body, author: 'bot', surface: 'issue' }); },
  deleteComment: async (_n, c) => { comments.splice(comments.indexOf(c), 1); },
};
const patch = '@@ -1,2 +1,2 @@\n function pay() {\n+charge();\n';
const workspaces = { root: '/data', prepare: async () => ({ policy: { version: 1, pathInstructions: [], exclude: [], maxInlineComments: 5, requireAnswers: false }, guidelines: [], mode: 'full', context: { files: { 'src/pay.ts': 'function pay() {\ncharge();\n}' }, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch, lines: parsePatch(patch) } }, excluded: [], limited: false, sourceDir: '/data/source' } }), cleanup: async () => {} };
const model = { run: async phase => { calls.push(phase); return { questions: initialQuestions() }; } };
const controller = new Controller(store, [platform], workspaces, model);
const app = application(controller, [config], { INTERNAL_TOKEN: 'n8n-fixture-internal-token-32-chars', HOOK_SECRET: 'n8n-fixture-hook-secret' });
const server = createServer(async (req, res) => {
  if (req.url === '/fixture') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ calls, comments, jobs: (await pool.query('SELECT kind,state,workflow_step FROM jobs ORDER BY created_at')).rows, health: await store.health() }));
  } else app.emit('request', req, res);
});
server.listen(8092, '0.0.0.0');
process.on('SIGTERM', async () => { controller.stopping = true; server.close(); await controller.active; await pool.end(); process.exit(0); });
