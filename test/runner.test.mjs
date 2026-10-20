import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Codex } from '../dist/codex.js';
import { ClaudeCode } from '../dist/claude.js';
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

test('isolated CLI validates question generation and grading against their own schemas', async t => {
  const root = await mkdtemp(join(tmpdir(), 'crb-learning-cli-')); t.after(() => rm(root, { recursive: true, force: true }));
  const id = '33333333-3333-4333-8333-333333333333'; await mkdir(join(root, 'jobs', id, 'source'), { recursive: true });
  const binary = join(root, 'fake-codex');
  for (const [phase, value] of [['questions', { questions: [...analysis().questions, ...analysis().questions.slice(0, 2).map(q => ({ ...q, question: q.question + ' (심화)' }))] }], ['grade', { verdict: 'partial', explanation: '누락된 경계 조건이 있습니다.', expectedAnswer: '동시 요청도 다뤄야 합니다.', optionExplanations: [], evidence: [] }]]) {
    await writeFile(binary, `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst args=process.argv.slice(2);\nconst schema=JSON.parse(fs.readFileSync(args[args.indexOf('--output-schema')+1]));\nif(!schema.properties.${phase === 'questions' ? 'questions' : 'verdict'}) process.exit(42);\nfs.writeFileSync(args[args.indexOf('-o')+1], ${JSON.stringify(JSON.stringify(value))});\n`, { mode: 0o755 });
    const result = await new Codex(root, join(root, 'auth'), binary).run(phase, 'read pinned code', id, 5000);
    assert.equal(phase === 'questions' ? result.questions.length : result.verdict, phase === 'questions' ? 5 : 'partial');
  }
});

test('Codex points the OpenAI provider at a proxy only when a base URL is configured', async t => {
  const root = await mkdtemp(join(tmpdir(), 'crb-codex-url-')); t.after(() => rm(root, { recursive: true, force: true }));
  const id = '55555555-5555-4555-8555-555555555555'; await mkdir(join(root, 'jobs', id, 'source'), { recursive: true });
  const binary = join(root, 'fake-codex'), seen = join(root, 'seen-url');
  await writeFile(binary, `#!/usr/bin/env node\nimport fs from 'node:fs';\nconst args=process.argv.slice(2);\nfs.writeFileSync(${JSON.stringify(seen)}, args.find(a=>a.startsWith('openai_base_url=')) ?? 'none');\nfs.writeFileSync(args[args.indexOf('-o')+1], ${JSON.stringify(JSON.stringify(analysis()))});\n`, { mode: 0o755 });
  await new Codex(root, join(root, 'auth'), binary).run('review', 'read', id, 5000);
  assert.equal(await readFile(seen, 'utf8'), 'none');
  await new Codex(root, join(root, 'auth'), binary, '', 'https://proxy.example.test/v1').run('review', 'read', id, 5000);
  assert.equal(await readFile(seen, 'utf8'), 'openai_base_url="https://proxy.example.test/v1"');
});

test('Claude runs headless with only snapshot tools, passes model credentials and validates structured output', async t => {
  const root = await mkdtemp(join(tmpdir(), 'crb-claude-')); t.after(() => rm(root, { recursive: true, force: true }));
  const id = '66666666-6666-4666-8666-666666666666'; await mkdir(join(root, 'jobs', id, 'source'), { recursive: true });
  const binary = join(root, 'fake-claude');
  const reply = value => `#!/usr/bin/env node\nconst args=process.argv.slice(2), at=f=>args[args.indexOf(f)+1];\nconst schema=JSON.parse(at('--json-schema')), mcp=JSON.parse(at('--mcp-config'));\nif(process.env.GITHUB_TOKEN || process.env.ANTHROPIC_API_KEY !== 'test-key' || at('--tools') !== '' || at('--permission-mode') !== 'dontAsk' || !args.includes('--strict-mcp-config') || schema.$schema || !mcp.mcpServers.review_source.args[1].endsWith('/source') || at('--allowedTools').split(',').some(t=>!t.startsWith('mcp__review_source__'))) process.exit(42);\nprocess.stdout.write(JSON.stringify(${JSON.stringify(value)}));\n`;
  process.env.GITHUB_TOKEN = 'must-not-reach-child'; process.env.ANTHROPIC_API_KEY = 'test-key';
  t.after(() => { delete process.env.GITHUB_TOKEN; delete process.env.ANTHROPIC_API_KEY; });
  await writeFile(binary, reply({ type: 'result', subtype: 'success', is_error: false, structured_output: analysis() }), { mode: 0o755 });
  const model = new ClaudeCode(root, join(root, 'auth'), binary);
  assert.equal((await model.run('review', 'read code', id, 5000)).summary, '결제 재시도 처리 변경');
  await writeFile(binary, reply({ type: 'result', subtype: 'error_max_structured_output_retries', is_error: true }), { mode: 0o755 });
  await assert.rejects(() => model.run('review', 'read code', id, 5000), /no structured output/);
  await assert.rejects(() => model.run('review', 'read code', '../escape', 5000));
});
