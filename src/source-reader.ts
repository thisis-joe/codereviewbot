import { readdir, readFile, realpath, lstat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { safePath } from './contracts.js';
import { redact } from './redact.js';
export class RepositoryReader {
  constructor(readonly root: string) {}
  async list(): Promise<string[]> {
    const result: string[] = [];
    const visit = async (dir: string, prefix = '') => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = prefix + entry.name;
        if (entry.isDirectory()) await visit(join(dir, entry.name), path + '/');
        else if (entry.isFile() && safePath(path)) result.push(path);
        if (result.length > 1500) throw new Error('Source inventory limit exceeded');
      }
    };
    await visit(this.root); return result.sort();
  }
  async read(path: string, start = 1, limit = 200): Promise<{ path: string; totalLines: number; lines: { line: number; text: string }[] }> {
    if (!safePath(path) || !Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('Invalid source read');
    const root = await realpath(this.root), dest = join(root, path), metadata = await lstat(dest);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 200000 || !(await realpath(dest)).startsWith(root + sep)) throw new Error('Source access refused');
    const text = redact(await readFile(dest, 'utf8')); const lines = text.split('\n');
    return { path, totalLines: lines.length, lines: lines.slice(start - 1, start - 1 + limit).map((text, i) => ({ line: start + i, text: text.slice(0, 3000) })) };
  }
  async search(term: string): Promise<{ path: string; line: number; text: string }[]> {
    if (!term || term.length > 200) throw new Error('Invalid search');
    const result: { path: string; line: number; text: string }[] = [];
    for (const path of await this.list()) {
      const file = await this.read(path, 1, 500);
      // Read all pages; a match beyond the first 500 lines must remain discoverable.
      for (let start = 1; start <= file.totalLines; start += 500) {
        const page = start === 1 ? file : await this.read(path, start, 500);
        for (const line of page.lines) if (line.text.includes(term)) { result.push({ path, ...line }); if (result.length >= 50) return result; }
      }
    }
    return result;
  }
}
