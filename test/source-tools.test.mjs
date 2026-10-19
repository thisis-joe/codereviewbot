import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RepositoryReader } from '../dist/source-reader.js';

test('read-only source tools enforce root, reject symlinks and return bounded line-numbered context', async t => {
  const root = await mkdtemp(join(tmpdir(), 'crb-source-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'pay.ts'), 'first\ncharge(input);\nthird'); await symlink('/etc/passwd', join(root, 'outside'));
  const reader = new RepositoryReader(root);
  assert.deepEqual(await reader.list(), ['pay.ts']);
  assert.deepEqual(await reader.read('pay.ts', 2, 1), { path: 'pay.ts', totalLines: 3, lines: [{ line: 2, text: 'charge(input);' }] });
  assert.equal((await reader.search('charge'))[0].line, 2);
  await assert.rejects(() => reader.read('../etc/passwd'));
  await assert.rejects(() => reader.read('outside'));
});
