import { createHash } from 'node:crypto';
import { mkdir, writeFile, mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execute } from './process.js';
import { safePath, Sha, type Snapshot } from './contracts.js';
import { globMatch, readPolicy, policyVersion, type Policy } from './policy.js';
import { parsePatch, parsePositions, type ReviewContext } from './review.js';
import type { Platform } from './platform.js';
import { redact } from './redact.js';

const defaults = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/vendor/**', '**/generated/**', '**/*.min.js', '**/*.map', '**/*.lock', '**/package-lock.json', '**/pnpm-lock.yaml', '**/yarn.lock'];
const control = /(^|\/)(?:\.git|\.codex|\.claude|\.cursor|\.mcp\.json)(?:\/|$)|(^|\/)AGENTS(?:\.override)?\.md$|(^|\/)(?:\.env(?:\..*)?|id_rsa|id_ed25519)$|\.(pem|key|p12|pfx)$/i;
function blocked(path: string, excludes: string[]): boolean { return !safePath(path) || control.test(path) || [...defaults, ...excludes].some(p => globMatch(p, path)); }
function diffEntries(names: string): { oldPath: string; path: string }[] {
  const values = names.split('\0').filter(Boolean), entries = [];
  for (let i = 0; i < values.length;) { const status = values[i++]!, oldPath = values[i++]!; entries.push({ oldPath, path: /^[RC]/.test(status) ? values[i++]! : oldPath }); }
  return entries;
}
export function selectDiffEntries(canonical: string, incremental: string | null, excludes: string[] = []): { oldPath: string; path: string }[] {
  const selected = incremental === null ? null : new Set(diffEntries(incremental).flatMap(e => [e.oldPath, e.path]));
  return diffEntries(canonical).filter(e => !blocked(e.path, excludes) && !blocked(e.oldPath, excludes) && (!selected || selected.has(e.path) || selected.has(e.oldPath)));
}
function gitEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH, HOME: '/nonexistent', LANG: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_LITERAL_PATHSPECS: '1', ...extra };
}
async function git(repo: string, args: string[], extra: NodeJS.ProcessEnv = {}, allowFailure = false): Promise<Buffer> {
  return (await execute('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', '-C', repo, ...args], { env: gitEnv(extra), allowFailure, timeoutMs: 120000, maxBytes: 24 * 1024 * 1024 })).stdout;
}
export async function exportSnapshot(repo: string, sha: string, out: string, priority: string[], excludes: string[] = [], denied: string[] = []): Promise<{ files: Record<string, string>; excluded: string[]; limited: boolean }> {
  Sha.parse(sha); await mkdir(out, { recursive: true, mode: 0o700 });
  const tree = (await git(repo, ['ls-tree', '-r', '-l', '-z', sha])).toString('utf8').split('\0').filter(Boolean);
  const entries = tree.map(line => { const tab = line.indexOf('\t'); const [mode, , blob, size] = line.slice(0, tab).trim().split(/\s+/); return { mode, blob: blob!, size: Number(size), path: line.slice(tab + 1) }; });
  const wanted = new Set(priority); entries.sort((a, b) => Number(wanted.has(b.path)) - Number(wanted.has(a.path)) || a.path.localeCompare(b.path));
  const files: Record<string, string> = Object.create(null), excluded: string[] = []; let total = 0, limited = false;
  for (const item of entries) {
    if (denied.includes(item.path) || !['100644', '100755'].includes(item.mode ?? '') || blocked(item.path, excludes)) { excluded.push(item.path); continue; }
    if (item.size > 200000 || total + item.size > 12 * 1024 * 1024 || Object.keys(files).length >= 1500) { excluded.push(item.path); limited = true; continue; }
    const bytes = await git(repo, ['cat-file', 'blob', item.blob]);
    if (bytes.includes(0)) { excluded.push(item.path); continue; }
    const value = redact(bytes.toString('utf8'));
    files[item.path] = value; total += bytes.length;
    const dest = join(out, item.path); await mkdir(dirname(dest), { recursive: true, mode: 0o700 }); await writeFile(dest, value, { mode: 0o444 });
  }
  return { files, excluded, limited };
}
export class Workspaces {
  constructor(readonly root: string) {}
  async prepare(provider: Platform, snapshot: Snapshot, id: string, previous: Snapshot | null, learnings: string[]): Promise<{ context: ReviewContext; policy: Policy; guidelines: string[]; mode: 'full' | 'incremental' }> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid workspace ID');
    const key = createHash('sha256').update(`${snapshot.instance}:${snapshot.repository}`).digest('hex');
    const cache = join(this.root, 'cache', key); await mkdir(cache, { recursive: true, mode: 0o700 });
    await git(cache, ['init', '--bare', '-q']);
    const instance = new URL(provider.config.instance);
    const origin = instance.hostname === 'api.github.com' ? 'https://github.com' : `${instance.origin}${provider.config.platform === 'github' ? '' : instance.pathname.replace(/\/$/, '')}`;
    const remote = `${origin}/${snapshot.repository}.git`;
    const basic = Buffer.from(`${snapshot.platform === 'github' ? 'x-access-token' : 'oauth2'}:${await provider.token()}`).toString('base64');
    const sourceRef = snapshot.platform === 'github' ? `refs/pull/${snapshot.number}/head` : `refs/merge-requests/${snapshot.number}/head`;
    await git(cache, ['-c', 'protocol.file.allow=never', 'fetch', '--no-tags', '--no-recurse-submodules', remote, sourceRef, snapshot.headSha, snapshot.startSha, snapshot.baseSha], {
      GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.extraHeader', GIT_CONFIG_VALUE_0: `Authorization: Basic ${basic}`,
    });
    let policyText: string | undefined;
    try { policyText = (await git(cache, ['show', `${snapshot.startSha}:.codereviewbot.yaml`])).toString('utf8'); } catch { /* no base policy */ }
    const policy = readPolicy(policyText);
    const guidelines: string[] = [];
    for (const path of ['AGENTS.md', 'docs/coding-standards.md']) {
      try { const text = (await git(cache, ['show', `${snapshot.startSha}:${path}`])).toString('utf8'); if (text.length <= 12000) guidelines.push(`${path}\n${text}`); } catch { /* optional */ }
    }
    snapshot.policyVersion = policyVersion(policy, guidelines, learnings);
    let mode: 'full' | 'incremental' = 'full';
    if (previous && previous.baseSha === snapshot.baseSha && previous.startSha === snapshot.startSha && previous.policyVersion === snapshot.policyVersion) {
      const ancestry = await execute('git', ['-C', cache, 'merge-base', '--is-ancestor', previous.headSha, snapshot.headSha], { env: gitEnv(), allowFailure: true });
      if (ancestry.code === 0) { mode = 'incremental'; snapshot.previousSha = previous.headSha; }
    }
    const diffBase = mode === 'incremental' ? snapshot.previousSha! : snapshot.baseSha;
    const names = (await git(cache, ['diff', '--no-ext-diff', '--no-textconv', '--name-status', '-z', '-M', snapshot.baseSha, snapshot.headSha])).toString('utf8');
    const incremental = mode === 'incremental' ? (await git(cache, ['diff', '--no-ext-diff', '--no-textconv', '--name-status', '-z', '-M', diffBase, snapshot.headSha])).toString('utf8') : null;
    const denied = diffEntries(names).filter(e => blocked(e.path, policy.exclude) || blocked(e.oldPath, policy.exclude)).flatMap(e => [e.oldPath, e.path]);
    const emptyBlob = (await execute('git', ['-C', cache, 'hash-object', '-w', '--stdin'], { env: gitEnv(), input: '' })).stdout.toString('utf8').trim();
    const diff: ReviewContext['diff'] = Object.create(null);
    for (const { oldPath, path } of selectDiffEntries(names, incremental, policy.exclude)) {
      // Compare exact blobs so a reused old filename cannot mix a second file's hunks.
      const blob = async (sha: string, file: string) => {
        const entry = (await git(cache, ['ls-tree', '-z', sha, '--', file])).toString('utf8');
        return entry ? entry.match(/^(?:100644|100755) blob ([a-f0-9]+)\t/)?.[1] ?? null : emptyBlob;
      };
      const oldBlob = await blob(snapshot.baseSha, oldPath), newBlob = await blob(snapshot.headSha, path);
      if (!oldBlob || !newBlob) { denied.push(oldPath, path); continue; }
      const patch = (await git(cache, ['diff', '--no-ext-diff', '--no-textconv', '--unified=3', oldBlob, newBlob])).toString('utf8');
      diff[path] = { oldPath, patch: redact(patch), lines: parsePatch(patch), oldLines: parsePatch(patch, 'LEFT'), positions: parsePositions(patch) };
    }
    const allNames = (await git(cache, ['diff', '--no-ext-diff', '--name-only', '-z', snapshot.baseSha, snapshot.headSha])).toString('utf8').split('\0').filter(safePath);
    const sourceDir = join(this.root, 'jobs', id, 'source');
    await rm(join(this.root, 'jobs', id), { recursive: true, force: true });
    const exported = await exportSnapshot(cache, snapshot.headSha, sourceDir, [...Object.keys(diff), ...allNames], policy.exclude, denied);
    exported.excluded.push(...denied.filter(p => !exported.excluded.includes(p)));
    const baseFiles: Record<string, string> = Object.create(null);
    for (const [path, entry] of Object.entries(diff)) {
      try {
        const old = await git(cache, ['show', `${snapshot.baseSha}:${entry.oldPath}`]);
        if (old.length <= 200000 && !old.includes(0)) { baseFiles[entry.oldPath] = redact(old.toString('utf8')); const dest = join(this.root, 'jobs', id, 'base', entry.oldPath); await mkdir(dirname(dest), { recursive: true }); await writeFile(dest, baseFiles[entry.oldPath]!, { mode: 0o444 }); }
      } catch { /* added file has no base version */ }
      if (!(path in exported.files) && !(entry.oldPath in baseFiles)) { delete diff[path]; exported.excluded.push(path); exported.limited = true; }
    }
    const context: ReviewContext = { ...exported, baseFiles, sourceDir, diff };
    const bytes = Object.values(diff).reduce((n, d) => n + Buffer.byteLength(d.patch), 0);
    if (bytes > 150000) {
      let used = 0; for (const path of Object.keys(diff)) { used += Buffer.byteLength(diff[path]!.patch); if (used > 150000) { context.excluded.push(path); delete diff[path]; } }
      context.limited = true;
    }
    await writeFile(join(this.root, 'jobs', id, 'context.json'), JSON.stringify({ snapshot, mode, excluded: context.excluded }), { mode: 0o600 });
    return { context, policy, guidelines, mode };
  }
  async cleanup(olderThanMs = 7 * 86400000): Promise<void> {
    const root = join(this.root, 'jobs'); await mkdir(root, { recursive: true });
    for (const name of await readdir(root)) if (/^[a-f0-9-]{36}$/.test(name)) { const path = join(root, name); if ((await stat(path)).mtimeMs < Date.now() - olderThanMs) await rm(path, { recursive: true, force: true }); }
  }
}
