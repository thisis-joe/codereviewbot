import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Codex } from '../dist/codex.js';
import { analysis } from './fixtures.mjs';

test('CLI runs a real bounded subprocess with isolated settings and does not inherit platform credentials', async t => {
  const root = await mkdtemp(join(tmpdir(), 'crb-cli-')); t.after(() => rm(root, { recursive: true, force: true }));
  const id = '11111111-1111-4111-8111-111111111111'; await mkdir(join(root, 'jobs', id, 'source'), { recursive: true });
  const binary = join(root, 'fake-codex');
  await writeFile(binary, `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst args=process.argv.slice(2);\nif(process.env.GITHUB_TOKEN || args[args.indexOf('--sandbox')+1] !== 'read-only' || !args.includes('--ignore-user-config')) process.exit(42);\nfs.writeFileSync(args[args.indexOf('-o')+1], ${JSON.stringify(JSON.stringify(analysis()))});\n`, { mode: 0o755 });
  process.env.GITHUB_TOKEN = 'must-not-reach-child'; t.after(() => delete process.env.GITHUB_TOKEN);
  const model = new Codex(root, join(root, 'auth'), binary);
  const result = await model.run('review', 'read code', id, 5000);
  assert.equal(result.summary, '결제 재시도 처리 변경');
  await assert.rejects(() => model.run('review', 'read code', '../escape', 5000));
});
test('CLI timeout terminates work instead of reporting a successful empty review', async t => {
  const root = await mkdtemp(join(tmpdir(), 'crb-timeout-')); t.after(() => rm(root, { recursive: true, force: true }));
  const id = '22222222-2222-4222-8222-222222222222'; await mkdir(join(root, 'jobs', id, 'source'), { recursive: true });
  const binary = join(root, 'fake-codex'); await writeFile(binary, '#!/usr/bin/env node\nsetInterval(() => {}, 1000);', { mode: 0o755 });
  await assert.rejects(() => new Codex(root, join(root, 'auth'), binary).run('review', 'read', id, 100), /time budget/);
});
