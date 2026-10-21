import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { RepositoryConfig } from './config.js';
import { authenticate, normalize, equal } from './webhooks.js';
import type { Controller } from './controller.js';

export async function readBody(req: IncomingMessage, limit = 2 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0, failed = false; const chunks: Buffer[] = [];
    req.on('data', (part: Buffer) => { size += part.length; if (size > limit) { if (!failed) reject(new Error('Body limit exceeded')); failed = true; } else if (!failed) chunks.push(part); });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); }); req.on('error', reject);
  });
}
export function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value));
}
export function application(controller: Controller, repositories: RepositoryConfig[], env: NodeJS.ProcessEnv = process.env) {
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', 'http://internal').pathname;
      if (req.method === 'GET' && path === '/healthz') { await controller.store.pool.query('SELECT 1'); send(res, 200, { ok: true }); return; }
      const webhook = path.match(/^\/webhooks\/(github|gitlab)$/);
      if (req.method === 'POST' && webhook) {
        if (!req.headers['content-type']?.startsWith('application/json')) { send(res, 415, { error: 'JSON required' }); return; }
        const raw = await readBody(req); let events;
        try { events = normalize(authenticate(webhook[1] as 'github' | 'gitlab', req.headers, raw, repositories, env)); }
        catch { send(res, 401, { error: 'Invalid webhook' }); return; }
        const accepted: { event: (typeof events)[number]; id: string }[] = [];
        for (const event of events) { const id = await controller.store.enqueue(event); if (id) accepted.push({ event, id }); }
        const admitted = accepted.length;
        send(res, 202, { admitted });
        // Post the received notice before waking the queue so the command usually finds it to delete.
        for (const { event, id } of accepted) await controller.acknowledge(event, id).catch(() => console.error(JSON.stringify({ repository: event.target.repository, number: event.target.number, error: 'ack_failed' })));
        if (admitted && env.N8N_WAKE_URL && env.INTERNAL_TOKEN) void fetch(env.N8N_WAKE_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000), headers: { authorization: `Bearer ${env.INTERNAL_TOKEN}` } }).then(r => r.body?.cancel()).catch(() => {});
        return;
      }
      if (path.startsWith('/internal/')) {
        if (!equal(String(req.headers.authorization ?? ''), env.INTERNAL_TOKEN ? `Bearer ${env.INTERNAL_TOKEN}` : '')) { send(res, 401, { error: 'Unauthorized' }); return; }
        if (req.method === 'POST' && path === '/internal/tick') { send(res, 202, { jobId: await controller.tick() }); return; }
        if (req.method === 'POST' && path === '/internal/recover') { void controller.recover().catch(() => console.error('{"error":"recovery_failed"}')); send(res, 202, { accepted: true }); return; }
        if (req.method === 'GET' && path === '/internal/health') { send(res, 200, { ...(await controller.store.health()), active: Boolean(controller.active) }); return; }
        const job = path.match(/^\/internal\/jobs\/([a-f0-9-]{36})$/);
        if (req.method === 'GET' && job) { const value = await controller.store.getJob(job[1]!); send(res, value ? 200 : 404, value ? { id: value.id, state: value.state, attempts: value.attempts, headSha: value.result?.snapshot.headSha ?? null } : { error: 'Not found' }); return; }
        if (req.method === 'POST' && path === '/internal/retry') {
          const body = JSON.parse((await readBody(req, 2000)).toString('utf8'));
          if (!/^[a-f0-9-]{36}$/.test(body.id)) { send(res, 400, { error: 'Invalid job ID' }); return; }
          send(res, 200, { retried: await controller.store.retry(body.id) }); return;
        }
      }
      send(res, 404, { error: 'Not found' });
    } catch (error) { send(res, error instanceof SyntaxError ? 400 : 503, { error: 'Request could not be processed' }); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000; return server;
}
