import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { HttpModel } from '../dist/codex.js';
import { ModelFailure } from '../dist/model-failure.js';
import { renderReport } from '../dist/render.js';
import { report } from './fixtures.mjs';

test('failed comments explain quota, authentication and timeout separately without blaming the runner', () => {
  for (const [code, word] of [['rate_limit', '사용량 제한'], ['authentication', '인증'], ['timeout', '시간']]) {
    const body = renderReport(report({ state: 'failed', questions: [], failure: { code, provider: 'claude', ...(code === 'rate_limit' ? { apiStatus: 429, retryAt: '2026-10-22T07:00:00.000Z' } : {}) } }));
    assert.ok(body.includes(word)); assert.doesNotMatch(body, /실행기 상태를 확인/);
    if (code === 'rate_limit') { assert.ok(body.includes('429')); assert.ok(body.includes('자동 재시도')); }
  }
});

test('Claude API failures survive the real CLI and authenticated runner HTTP boundaries without leaking model text', { timeout: 20000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'hey-failure-')); t.after(() => rm(root, { recursive: true, force: true }));
  const id = '88888888-8888-4888-8888-888888888888'; await mkdir(join(root, 'jobs', id, 'source'), { recursive: true });
  const binary = join(root, 'fake-claude');
  const listener = createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening'); const { port } = listener.address(); await new Promise(resolve => listener.close(resolve));
  const token = 'failure-runner-test-token-00000000', logs = [];
  const child = spawn(process.execPath, [new URL('../dist/runner-server.js', import.meta.url).pathname], { env: { PATH: process.env.PATH, PORT: String(port), RUNNER_TOKEN: token, MODEL_PROVIDER: 'claude', DATA_ROOT: root, CLAUDE_CONFIG_DIR: join(root, 'auth'), CLAUDE_BINARY: binary }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const closed = once(child, 'close'); child.kill('SIGKILL'); await closed; } });
  child.stderr.on('data', chunk => logs.push(chunk.toString()));
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Runner not ready')), 5000); child.stdout.on('data', chunk => { if (chunk.toString().includes('"ready":true')) { clearTimeout(timer); resolve(); } }); child.once('error', reject); });
  const model = new HttpModel(`http://127.0.0.1:${port}`, token);
  for (const [status, code] of [[429, 'rate_limit'], [401, 'authentication'], [503, 'unavailable']]) {
    await writeFile(binary, `#!/usr/bin/env node\nconsole.log(JSON.stringify({type:'result',subtype:'success',is_error:true,api_error_status:${status},result:'private model text ghp_aaaaaaaaaaaaaaaaaaaaaaaa'}));process.exitCode=1;`, { mode: 0o755 });
    await assert.rejects(() => model.run('initial_questions', 'private prompt', id, 5000), error => {
      assert.ok(error instanceof ModelFailure); assert.equal(error.failure.code, code); assert.equal(error.failure.apiStatus, status);
      assert.doesNotMatch(String(error), /private model text|ghp_/); return true;
    });
  }
  assert.doesNotMatch(logs.join(''), /private model text|private prompt|ghp_/);
});
