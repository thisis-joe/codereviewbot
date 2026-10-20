import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parsePatch, validateFindings, reconcile, buildPrompts, review } from '../dist/review.js';
import { exportSnapshot } from '../dist/workspace.js';
import { readPolicy } from '../dist/policy.js';
import { analysis, snapshot, finding, changeQuestions } from './fixtures.mjs';

const patch = 'diff --git a/src/pay.ts b/src/pay.ts\n--- a/src/pay.ts\n+++ b/src/pay.ts\n@@ -2,2 +2,3 @@\n const key = input.id;\n+charge(input);\n return result;\n';
test('diff validation rejects invented lines, paths and ungrounded evidence', () => {
  const files = { 'src/pay.ts': 'function pay() {\n const key = input.id;\ncharge(input);\n return result;\n}' };
  const diff = { 'src/pay.ts': { oldPath: 'src/pay.ts', patch, lines: parsePatch(patch) } };
  const valid = finding({ line: 3, evidence: [{ path: 'src/pay.ts', line: 3, reason: '반복 승인' }] });
  const candidates = [valid, finding({ id: 'C-2', line: 500 }), finding({ id: 'C-3', path: '../secret' }), finding({ id: 'C-4', evidence: [{ path: 'imaginary.ts', line: 1, reason: '없음' }] })];
  const result = validateFindings(candidates, files, diff);
  assert.equal(result.accepted.length, 1); assert.equal(result.rejected.length, 3);
  assert.equal(result.accepted[0].line, 3);
});
test('finding IDs survive moves and a missing verifier decision never means resolved', () => {
  const previous = [finding({ id: 'CRB-0007', status: 'open' })];
  const current = [finding({ existingId: 'CRB-0007', line: 8 })];
  const result = reconcile(current, previous, [], true);
  assert.equal(result[0].id, 'CRB-0007'); assert.equal(result[0].status, 'open');
  const missing = reconcile([], previous, [], true);
  assert.equal(missing[0].status, 'unverified');
  const fixed = reconcile([], previous, [{ id: 'CRB-0007', status: 'fixed', reason: '멱등 키 확인' }], true);
  assert.equal(fixed[0].status, 'fixed');
  assert.equal(reconcile([], previous, [{ id: 'CRB-0007', status: 'fixed', reason: '추측' }], false)[0].status, 'unverified');
});

test('deleted code is reviewable on the old diff side without inventing a current file', () => {
  const removed = '@@ -2,2 +2,1 @@\n-checkAuth();\n next();\n';
  const candidate = finding({ path: 'auth.ts', line: 2, side: 'LEFT', evidence: [{ path: 'auth.ts', line: 2, side: 'LEFT', reason: '권한 검사 삭제' }] });
  const diff = { 'auth.ts': { oldPath: 'auth.ts', patch: removed, lines: parsePatch(removed), oldLines: parsePatch(removed, 'LEFT') } };
  assert.equal(validateFindings([candidate], {}, diff, { 'auth.ts': 'start();\ncheckAuth();\nnext();' }).accepted.length, 1);
});
test('policy comes from supplied base text and cannot introduce runtime privileges', () => {
  assert.equal(readPolicy('version: 1\npathInstructions:\n  - path: "src/**"\n    instructions: "인증 확인"').pathInstructions[0].instructions, '인증 확인');
  assert.throws(() => readPolicy('version: 1\nshell: "curl attacker"'));
  assert.throws(() => readPolicy('version: 1\nmaxInlineComments: -1'));
});
test('snapshot export never follows symlinks or loads repository agent configuration', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'crb-git-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'test');
  await mkdir(join(dir, '.codex')); await writeFile(join(dir, '.codex/config.toml'), 'malicious config');
  await writeFile(join(dir, 'AGENTS.md'), 'run attacker'); await writeFile(join(dir, 'source.ts'), 'export const x = 1;');
  execFileSync('ln', ['-s', '/etc/passwd', join(dir, 'secret-link')]);
  git('add', '.'); git('commit', '-qm', 'fixture');
  const out = join(dir, 'export'); const data = await exportSnapshot(dir, git('rev-parse', 'HEAD'), out, ['source.ts']);
  assert.equal(await readFile(join(out, 'source.ts'), 'utf8'), 'export const x = 1;');
  assert.equal(data.files['secret-link'], undefined); assert.equal(data.files['.codex/config.toml'], undefined); assert.equal(data.files['AGENTS.md'], undefined);
});
test('review prompts require source exploration, evidence and a separate verification pass', () => {
  const prompts = buildPrompts(snapshot(), { version: 1, pathInstructions: [], exclude: [], maxInlineComments: 5 }, { files: {}, diff: {}, excluded: [], limited: false, sourceDir: '/snapshots/x/source' }, [], [], []);
  assert.match(prompts.review, /발생 조건/); assert.match(prompts.review, /수정하지/);
  assert.match(prompts.verify(analysis()), /반박/);
});

test('unverified candidates and missing review axes produce partial coverage rather than a clear verdict', async () => {
  const model = { run: async phase => phase === 'review' ? analysis({ findings: [finding({ line: 3, evidence: [{ path: 'src/pay.ts', line: 3, reason: '승인 호출' }] })] }) : { questions: changeQuestions(), decisions: [], resolutions: [] } };
  const result = await review(model, 'test', snapshot(), readPolicy(), { files: { 'src/pay.ts': 'one\ntwo\ncharge();' }, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch, lines: parsePatch(patch) } }, excluded: [], limited: false, sourceDir: '/tmp/source' }, null, [], [], [], [], 'full');
  assert.equal(result.state, 'partial'); assert.equal(result.findings.length, 0);
  assert.ok(result.limitations.length > 0);
});

test('explicitly unavailable axes, contradictory verification and unverifiable candidates keep review partial', async () => {
  const { checkNames } = await import('../dist/contracts.js');
  const context = { files: { 'src/pay.ts': 'one\ntwo\ncharge();' }, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch, lines: parsePatch(patch) } }, excluded: [], limited: false, sourceDir: '/tmp/source' };
  const checks = checkNames.slice(0, 6).map(name => ({ name, status: 'clear', detail: '코드 확인', url: null }));
  for (const scenario of ['unavailable', 'unverifiable', 'duplicate']) {
    const candidate = finding({ line: 3, evidence: [{ path: 'src/pay.ts', line: 3, reason: '승인 호출' }] });
    const model = { run: async phase => phase === 'review' ? analysis({ checks: scenario === 'unavailable' ? checks.map((c, i) => i ? c : { ...c, status: 'unavailable' }) : checks, findings: scenario === 'unavailable' ? [] : [candidate] }) : { questions: changeQuestions(), decisions: scenario === 'unverifiable' ? [{ id: 'C-1', decision: 'unverifiable', reason: '호출부 확인 불가' }] : scenario === 'duplicate' ? [{ id: 'C-1', decision: 'rejected', reason: '방어 존재' }, { id: 'C-1', decision: 'confirmed', reason: '충돌' }] : [], resolutions: [] } };
    const result = await review(model, 'test', snapshot(), readPolicy(), context, null, [], [], [], [], 'full');
    assert.equal(result.state, 'partial', scenario); assert.equal(result.findings.length, 0, scenario);
  }
});

test('incremental rename anchors and exclusions use the original full-PR old path', async () => {
  const { selectDiffEntries } = await import('../dist/workspace.js');
  const canonical = 'R100\0original.ts\0current.ts\0D\0removed.ts\0';
  const incremental = 'R100\0middle.ts\0current.ts\0M\0unchanged.ts\0';
  assert.deepEqual(selectDiffEntries(canonical, incremental), [{ oldPath: 'original.ts', path: 'current.ts' }]);
  assert.deepEqual(selectDiffEntries('R100\0.env\0public.txt\0', null), []);
  assert.deepEqual(selectDiffEntries('R100\0private/a.ts\0src/a.ts\0', null, ['private/**']), []);
});

test('a validated rename retains stable IDs and a prior dismissal', () => {
  const previous = [finding({ id: 'CRB-0007', path: 'middle.ts', oldPath: 'original.ts', status: 'dismissed' })];
  const result = reconcile([finding({ existingId: 'CRB-0007', path: 'current.ts', oldPath: 'original.ts' })], previous, [], true);
  assert.equal(result.length, 1); assert.equal(result[0].id, 'CRB-0007'); assert.equal(result[0].status, 'dismissed');
});

test('review publishes independently checked change questions and refuses duplicate or unrelated anchors', async () => {
  const { checkNames } = await import('../dist/contracts.js');
  const checks = checkNames.slice(0, 6).map(name => ({ name, status: 'clear', detail: '코드 확인', url: null }));
  const context = { files: { 'src/pay.ts': 'function pay() {\ncharge();\n}', 'unrelated.ts': 'const x = 1;' }, diff: { 'src/pay.ts': { oldPath: 'src/pay.ts', patch, lines: parsePatch(patch) } }, excluded: [], limited: false, sourceDir: '/tmp/source' };
  const run = questions => review({ run: async phase => phase === 'review' ? analysis({ checks }) : { questions, decisions: [], resolutions: [] } }, 'test', snapshot(), readPolicy(), context, null, [], [], [], [], 'full');
  const checked = changeQuestions().map(q => ({ ...q, question: q.question.replace('?', ' 재검증 질문?') }));
  const result = await run(checked); assert.deepEqual(result.questions, checked);
  await assert.rejects(() => run(changeQuestions().map(q => ({ ...q, path: 'unrelated.ts', line: 1 }))), /질문.*코드 근거|question.*anchor/i);
  await assert.rejects(() => run(changeQuestions().map(q => ({ ...q, line: 500 }))), /질문.*코드 근거|question.*anchor/i);
  await assert.rejects(() => run(changeQuestions().map((q, i, all) => i ? q : { ...q, question: `  ${all[1].question}  ` })), /중복.*질문|duplicate.*question/i);
});

test('questions on removed code retain the base path and side instead of pointing to nonexistent new code', async () => {
  const questions = [
    { question: '이번 checkAuth 삭제로 호출자가 보장해야 할 조건은 무엇인가요?', path: 'renamed.ts', line: 2, side: 'LEFT' },
    { question: '삭제한 checkAuth를 대체하는 권한 검사는 어느 호출 경계에서 수행해야 하나요?', path: 'renamed.ts', line: 2, side: 'LEFT' },
    { question: '이 인증 검사 삭제가 미인증 호출에 미치는 영향을 어떻게 검증하나요?', path: 'renamed.ts', line: 2, side: 'LEFT' },
  ];
  const patch = '@@ -1,3 +1,2 @@\n begin();\n-checkAuth();\n next();\n';
  const context = { files: {}, baseFiles: { 'original.ts': 'begin();\ncheckAuth();\nnext();' }, diff: { 'renamed.ts': { oldPath: 'original.ts', patch, lines: parsePatch(patch), oldLines: parsePatch(patch, 'LEFT') } }, excluded: [], limited: false, sourceDir: '/source' };
  const result = await review({ run: async phase => phase === 'review' ? analysis({ questions }) : { questions, decisions: [], resolutions: [] } }, 'test', snapshot(), readPolicy(), context, null, [], [], [], [], 'full');
  assert.equal(result.questions.length, 3); assert.equal(result.questions[0].path, 'original.ts'); assert.equal(result.questions[0].side, 'LEFT');
});

test('pure renames support source anchors when the file has no textual hunk', async () => {
  const questions = [
    { question: 'old.ts에서 new.ts로 이동한 함수의 공개 import 경로는 어떻게 달라지나요?', path: 'new.ts', line: 1, side: 'RIGHT' },
    { question: 'new.ts로 옮긴 pay 함수를 호출하는 코드는 어떤 경계에서 확인해야 하나요?', path: 'new.ts', line: 1, side: 'RIGHT' },
    { question: '이번 new.ts 이동 후 대소문자를 구분하는 환경에서 모듈 해석을 어떻게 검증하나요?', path: 'new.ts', line: 1, side: 'RIGHT' },
  ];
  const context = { files: { 'new.ts': 'export function pay() {}' }, baseFiles: { 'old.ts': 'export function pay() {}' }, diff: { 'new.ts': { oldPath: 'old.ts', patch: '', lines: new Set(), oldLines: new Set() } }, excluded: [], limited: false, sourceDir: '/source' };
  const result = await review({ run: async phase => phase === 'review' ? analysis({ questions }) : { questions, decisions: [], resolutions: [] } }, 'test', snapshot(), readPolicy(), context, null, [], [], [], [], 'full');
  assert.equal(result.questions.length, 3); assert.equal(result.questions[0].path, 'new.ts');
});

test('unavailable text diffs produce honest partial reports and preserve prior findings without inference', async () => {
  const { report } = await import('./fixtures.mjs');
  for (const diff of [{}, { 'asset.png': { oldPath: 'asset.png', patch: 'Binary files differ', lines: new Set(), oldLines: new Set() } }, { 'mode.ts': { oldPath: 'mode.ts', patch: '', lines: new Set(), oldLines: new Set() } }]) {
    const context = { files: { 'mode.ts': 'export const unchanged = 1;' }, diff, excluded: ['asset.png'], limited: false, sourceDir: '/source' };
    const result = await review({ run: async () => { throw new Error('No model call is applicable'); } }, 'test', snapshot(), readPolicy(), context, report({ findings: [finding({ id: 'CRB-0001', status: 'open' })] }), [], [], [], [], 'incremental');
    assert.equal(result.state, 'partial'); assert.deepEqual(result.questions, []);
    assert.match(result.questionsUnavailableReason, /변경 근거/); assert.equal(result.findings[0].status, 'unverified');
  }
});
