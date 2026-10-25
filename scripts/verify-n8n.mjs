import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHmac } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

// Disposable real n8n + PostgreSQL + application; no production configuration or accounts.
const suffix = randomBytes(4).toString('hex'), prefix = `hey-flow-test-${suffix}`;
const names = { network: prefix, postgres: prefix + '-postgres', controller: prefix + '-controller', n8n: prefix + '-n8n' };
const image = 'docker.n8n.io/n8nio/n8n:2.43.8', token = 'n8n-fixture-internal-token-32-chars';
const temporary = await mkdtemp(join(tmpdir(), 'hey-n8n-'));
const created = [];
const docker = args => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 32 * 1024 ** 2, timeout: 60000 }).trim();
const sql = (db, query) => docker(['exec', names.postgres, 'psql', '-U', 'postgres', '-d', db, '-Atc', query]);
const fetchInside = (url, options = {}) => JSON.parse(docker(['exec', names.controller, 'node', '-e', `const r=await fetch(${JSON.stringify(url)},${JSON.stringify(options)});console.log(JSON.stringify({status:r.status,body:await r.text()}));`]));
async function until(probe, description) {
  for (let i = 0; i < 120; i++) { try { const value = probe(); if (value) return value; } catch {} await setTimeout(500); }
  throw new Error(`Timed out: ${description}`);
}
try {
  docker(['image', 'inspect', image]); docker(['image', 'inspect', 'postgres:17-alpine']);
  docker(['network', 'create', '--internal', names.network]);
  docker(['run', '-d', '--name', names.postgres, '--network', names.network, '--network-alias', 'postgres', '--memory', '256m', '-e', 'POSTGRES_PASSWORD=fixture-only', '-e', 'POSTGRES_DB=hey_n8n_test', 'postgres:17-alpine']); created.push(names.postgres);
  await until(() => docker(['exec', names.postgres, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).includes('accepting'), 'PostgreSQL ready');
  sql('postgres', 'CREATE DATABASE n8n;');
  docker(['run', '-d', '--name', names.controller, '--network', names.network, '--network-alias', 'controller', '--memory', '512m', '--entrypoint', 'node', '--mount', `type=bind,src=${process.cwd()},dst=/app,readonly`, '--workdir', '/app', '--tmpfs', '/data:rw,uid=1000,gid=1000,mode=700', '-e', 'TEST_DATABASE_URL=postgres://postgres:fixture-only@postgres:5432/hey_n8n_test', image, 'test/n8n-fixture.mjs']); created.push(names.controller);
  docker(['run', '-d', '--name', names.n8n, '--network', names.network, '--network-alias', 'n8n', '--memory', '768m', '-e', 'DB_TYPE=postgresdb', '-e', 'DB_POSTGRESDB_HOST=postgres', '-e', 'DB_POSTGRESDB_DATABASE=n8n', '-e', 'DB_POSTGRESDB_USER=postgres', '-e', 'DB_POSTGRESDB_PASSWORD=fixture-only', '-e', 'N8N_ENCRYPTION_KEY=fixture-only-encryption-key-32-chars', '-e', 'N8N_SECURE_COOKIE=false', '-e', 'N8N_DIAGNOSTICS_ENABLED=false', '-e', 'N8N_VERSION_NOTIFICATIONS_ENABLED=false', '-e', 'N8N_RUNNERS_ENABLED=false', '-e', 'EXECUTIONS_DATA_SAVE_ON_SUCCESS=all', '-e', 'EXECUTIONS_DATA_SAVE_ON_ERROR=all', '-e', 'GENERIC_TIMEZONE=Asia/Seoul', image]); created.push(names.n8n);
  await until(() => fetchInside('http://controller:8092/healthz').status === 200, 'Controller ready');
  await until(() => fetchInside('http://n8n:5678/healthz').status === 200, 'n8n ready');
  const workflows = JSON.parse(await readFile('n8n/workflows.json', 'utf8'));
  for (const workflow of workflows) for (const node of workflow.nodes) if (node.type.endsWith('.scheduleTrigger')) node.disabled = true;
  // The recovery graph is unchanged after its fixture-only authenticated trigger.
  workflows[1].nodes.push({ id: 'Recovery probe', name: 'Recovery probe', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 200], webhookId: 'fixture-recovery-probe', parameters: { httpMethod: 'POST', path: 'recovery-probe', authentication: 'headerAuth', responseMode: 'onReceived', options: {} }, credentials: { httpHeaderAuth: { id: 'crbInternalAuth', name: 'hey Internal' } } });
  workflows[1].connections['Recovery probe'] = { main: [[{ node: 'Reconcile answer gates', type: 'main', index: 0 }]] };
  await writeFile(join(temporary, 'workflows.json'), JSON.stringify(workflows));
  await writeFile(join(temporary, 'credentials.json'), JSON.stringify([{ id: 'crbInternalAuth', name: 'hey Internal', type: 'httpHeaderAuth', data: { name: 'Authorization', value: `Bearer ${token}` } }]));
  for (const file of ['workflows.json', 'credentials.json']) docker(['cp', join(temporary, file), `${names.n8n}:/tmp/${file}`]);
  docker(['exec', names.n8n, 'n8n', 'import:credentials', '--input=/tmp/credentials.json']);
  docker(['exec', names.n8n, 'n8n', 'import:workflow', '--input=/tmp/workflows.json']);
  for (const id of ['crbDispatch', 'crbRecovery']) docker(['exec', names.n8n, 'n8n', 'publish:workflow', `--id=${id}`]);
  docker(['restart', names.n8n]);
  await until(() => fetchInside('http://n8n:5678/webhook/review-wakeup', { method: 'POST' }).status === 403, 'published authenticated webhook');
  const raw = JSON.stringify({ action: 'closed', repository: { full_name: 'joe/demo' }, pull_request: { number: 1, merged: true, head: { sha: 'b'.repeat(40) } } });
  const signedHeaders = { 'content-type': 'application/json', 'x-github-event': 'pull_request', 'x-github-delivery': 'n8n-real-merge', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'n8n-fixture-hook-secret').update(raw).digest('hex') };
  assert.equal(fetchInside('http://controller:8092/webhooks/github', { method: 'POST', headers: signedHeaders, body: raw }).status, 202);
  assert.equal(JSON.parse(fetchInside('http://controller:8092/fixture').body).calls.length, 0);
  assert.equal(fetchInside('http://n8n:5678/webhook/review-wakeup', { method: 'POST', headers: { authorization: `Bearer ${token}` } }).status, 202);
  await until(() => sql('hey_n8n_test', "SELECT count(*) FROM jobs WHERE kind='review' AND state='completed'") === '1', 'all review phases completed');
  let fixture = JSON.parse(fetchInside('http://controller:8092/fixture').body);
  assert.deepEqual(fixture.calls, ['initial_questions']); assert.equal(fixture.comments.length, 1);
  assert.match(fixture.comments[0].body, /codereviewbot:question:/);
  const command = JSON.stringify({ action: 'created', repository: { full_name: 'joe/demo' }, issue: { number: 1, pull_request: {} }, comment: { id: 100, body: '/hey help', user: { login: 'human', type: 'User' } } });
  assert.equal(fetchInside('http://controller:8092/webhooks/github', { method: 'POST', headers: { ...signedHeaders, 'x-github-event': 'issue_comment', 'x-github-delivery': 'n8n-real-command', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'n8n-fixture-hook-secret').update(command).digest('hex') }, body: command }).status, 202);
  fetchInside('http://n8n:5678/webhook/review-wakeup', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  await until(() => sql('hey_n8n_test', "SELECT count(*) FROM jobs WHERE kind='command' AND state='completed'") === '1', 'command branch completed');
  fetchInside('http://n8n:5678/webhook/recovery-probe', { method: 'POST', headers: { authorization: `Bearer ${token}` } });
  await until(() => sql('n8n', "SELECT count(*) FROM execution_entity WHERE \"workflowId\"='crbRecovery' AND status='success'") === '1', 'recovery graph completed');
  await until(() => sql('n8n', "SELECT count(*) FROM execution_entity WHERE status IN ('running','new','waiting') AND \"deletedAt\" IS NULL") === '0', 'n8n executions settled');
  assert.equal(sql('n8n', "SELECT count(*) FROM execution_entity WHERE status='error'"), '0');
  const rows = JSON.parse(sql('n8n', "SELECT json_agg(json_build_object('workflow',e.\"workflowId\",'status',e.status,'data',d.data)) FROM execution_entity e JOIN execution_data d ON d.\"executionId\"=e.id WHERE e.status='success'"));
  const visited = [...new Set(rows.flatMap(row => JSON.parse(row.data).filter(x => x && typeof x === 'object' && !Array.isArray(x)).flatMap(Object.keys)))];
  const phases = ['Prepare source','Generate questions','Validate revision','Publish questions','Sync answer gate','Queue question notification','Handle command','Complete job','Wait for phase','Read phase status','Reconcile answer gates','Schedule eligible retries','Clean expired source snapshots'];
  for (const phase of phases) assert.ok(visited.includes(phase), `n8n did not execute ${phase}`);
  fixture = JSON.parse(fetchInside('http://controller:8092/fixture').body);
  assert.deepEqual(fixture.calls, ['initial_questions']); assert.equal(fixture.comments.length, 2);
  const evidence = { runId: suffix, verifiedAt: new Date().toISOString(), n8n: '2.43.8', postgres: '17', result: 'passed', executedNodes: phases, jobs: fixture.jobs, modelCalls: fixture.calls.length, visibleComments: fixture.comments.length, errors: 0, limits: 'Signed HTTP admission, real application/PostgreSQL/n8n; external platform and AI are fixtures. Schedules are disabled in this isolated probe and recovery uses a fixture-only trigger. Success execution data is retained here for verification only.' };
  await mkdirEvidence(evidence);
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  for (const name of created.filter(x => x !== names.postgres)) { try { console.error(docker(['logs', '--tail', '35', name])); } catch {} }
  throw error;
} finally {
  for (const name of created.reverse()) { try { docker(['rm', '-f', '-v', name]); } catch {} }
  try { docker(['network', 'rm', names.network]); } catch {}
  await rm(temporary, { recursive: true, force: true });
}
async function mkdirEvidence(value) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir('.local/n8n-orchestration', { recursive: true });
  await writeFile(`.local/n8n-orchestration/runtime-${suffix}.json`, JSON.stringify(value, null, 2) + '\n');
  await writeFile('.local/n8n-orchestration/runtime.json', JSON.stringify(value, null, 2) + '\n');
}
