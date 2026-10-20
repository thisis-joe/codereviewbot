import { createServer } from 'node:http';
import { z } from 'zod';
import { Codex } from './codex.js';
import { readBody, send } from './application.js';
import { equal } from './webhooks.js';

if ((process.env.RUNNER_TOKEN?.length ?? 0) < 32) throw new Error('RUNNER_TOKEN must contain at least 32 characters');
const model = new Codex(process.env.DATA_ROOT ?? '/data', process.env.CODEX_HOME ?? '/codex', process.env.CODEX_BINARY ?? 'codex', process.env.CODEX_MODEL ?? '');
const Input = z.strictObject({ phase: z.enum(['review','verify','answer','questions','grade']), prompt: z.string().min(1).max(500000), workspaceId: z.string().uuid(), timeoutMs: z.int().min(1).max(600000) });
let busy = false;
const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') { send(res, 200, { ok: true, busy }); return; }
  if (!equal(String(req.headers.authorization ?? ''), `Bearer ${process.env.RUNNER_TOKEN}`)) { send(res, 401, { error: 'Unauthorized' }); return; }
  if (req.method !== 'POST' || req.url !== '/run') { send(res, 404, { error: 'Not found' }); return; }
  if (busy) { send(res, 409, { error: 'Runner busy' }); return; }
  // Set before awaiting request data: concurrent callers cannot both acquire the runner.
  busy = true;
  try { const input = Input.parse(JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8'))); send(res, 200, await model.run(input.phase, input.prompt, input.workspaceId, input.timeoutMs)); }
  catch { send(res, 422, { error: 'Codex execution or structured output validation failed' }); }
  finally { busy = false; }
});
server.requestTimeout = 30000; server.headersTimeout = 10000;
server.listen(Number(process.env.PORT ?? 8091), '0.0.0.0', () => console.log('{"service":"runner","ready":true}'));
