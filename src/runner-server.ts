import { createServer } from 'node:http';
import { z } from 'zod';
import { Codex } from './codex.js';
import { Gms } from './gms.js';
import { ClaudeCode } from './claude.js';
import { readBody, send } from './application.js';
import { equal } from './webhooks.js';
import { failureInfo } from './model-failure.js';

if ((process.env.RUNNER_TOKEN?.length ?? 0) < 32) throw new Error('RUNNER_TOKEN must contain at least 32 characters');
const provider = process.env.MODEL_PROVIDER || 'gms', data = process.env.DATA_ROOT ?? '/data';
if (provider !== 'codex' && provider !== 'claude' && provider !== 'gms') throw new Error('MODEL_PROVIDER must be gms, codex or claude');
const model = provider === 'gms'
  ? new Gms(data, process.env.GMS_RESPONSES_URL ?? 'https://gms.ssafy.io/gmsapi/api.openai.com/v1/responses', process.env.GMS_KEY ?? '', process.env.GMS_MODEL ?? 'gpt-6.1-sol')
  : provider === 'claude'
  ? new ClaudeCode(data, process.env.CLAUDE_CONFIG_DIR ?? '/claude', process.env.CLAUDE_BINARY ?? 'claude', process.env.CLAUDE_MODEL ?? '')
  : new Codex(data, process.env.CODEX_HOME ?? '/codex', process.env.CODEX_BINARY ?? 'codex', process.env.CODEX_MODEL ?? '', process.env.CODEX_BASE_URL ?? '');
const Input = z.strictObject({ phase: z.enum(['review','verify','answer','initial_questions','questions','csinterview','morecs','grade']), prompt: z.string().min(1).max(500000), workspaceId: z.string().uuid(), timeoutMs: z.int().min(1).max(600000) });
let busy = false;
const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') { send(res, 200, { ok: true, busy }); return; }
  if (!equal(String(req.headers.authorization ?? ''), `Bearer ${process.env.RUNNER_TOKEN}`)) { send(res, 401, { error: 'Unauthorized' }); return; }
  if (req.method !== 'POST' || req.url !== '/run') { send(res, 404, { error: 'Not found' }); return; }
  if (busy) { send(res, 409, { error: 'Runner busy' }); return; }
  // Set before awaiting request data: concurrent callers cannot both acquire the runner.
  busy = true;
  try { const input = Input.parse(JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8'))); send(res, 200, await model.run(input.phase, input.prompt, input.workspaceId, input.timeoutMs)); }
  catch (error) {
    // Messages are our own; parser errors are classified because theirs can quote model output.
    const reason = error instanceof z.ZodError ? 'structured output did not match the schema' : error instanceof SyntaxError ? 'invalid JSON output' : error instanceof Error ? error.message : 'unknown';
    console.error(JSON.stringify({ service: 'runner', provider, error: reason.slice(0, 200) }));
    send(res, 422, { error: 'model_failure', failure: failureInfo(error, provider) });
  }
  finally { busy = false; }
});
server.requestTimeout = 30000; server.headersTimeout = 10000;
server.listen(Number(process.env.PORT ?? 8091), '0.0.0.0', () => console.log(JSON.stringify({ service: 'runner', ready: true, provider })));
