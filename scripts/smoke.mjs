import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const env = parseEnv(await readFile('.env', 'utf8'));
const controller = `http://127.0.0.1:${env.CONTROLLER_PORT || 18092}`;
const n8n = `http://127.0.0.1:${env.N8N_PORT || 5688}`;
const request = (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
// A CLI restart returns before n8n has registered its published webhooks.
for (let i = 0; i < 30; i++) {
  try { if ((await request(`${n8n}/webhook/review-wakeup`, { method: 'POST' })).status === 403) break; } catch {}
  await setTimeout(1000);
}
assert.equal((await request(`${controller}/healthz`)).status, 200);
assert.equal((await request(`${n8n}/healthz`)).status, 200);
assert.equal((await request(`${controller}/internal/tick`, { method: 'POST' })).status, 401);
assert.equal((await request(`${n8n}/webhook/review-wakeup`, { method: 'POST' })).status, 403);
function successes() {
  return Number(execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'n8n', '-Atc',
    `SELECT count(*) FROM execution_entity WHERE "workflowId"='crbDispatch' AND status='success'`], { encoding: 'utf8' }).trim());
}
const before = successes();
assert.equal((await request(`${n8n}/webhook/review-wakeup`, { method: 'POST', headers: { Authorization: `Bearer ${env.INTERNAL_TOKEN}` } })).status, 202);
for (let i = 0; i < 15 && successes() <= before; i++) await setTimeout(1000);
assert.ok(successes() > before, 'n8n dispatch did not complete successfully');
console.log('Local health, ingress authentication and real n8n → controller dispatch passed. No Git/model accounts used.');
