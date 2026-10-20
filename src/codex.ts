import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AnalysisSchema, VerificationSchema, AnswerSchema, QuestionBatchSchema, GradeSchema } from './contracts.js';
import { execute } from './process.js';
import type { Model, ModelPhase } from './review.js';
import { redact } from './redact.js';

export class Codex implements Model {
  constructor(readonly root: string, readonly home: string, readonly binary = 'codex', readonly model = '') {}
  async run(phase: ModelPhase, prompt: string, id: string, timeoutMs = 600000): Promise<unknown> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid workspace ID');
    const source = await realpath(join(this.root, 'jobs', id, 'source'));
    const root = await realpath(join(this.root, 'jobs'));
    if (!source.startsWith(root + sep)) throw new Error('Workspace escaped root');
    const dir = await mkdtemp(join(tmpdir(), 'codereviewbot-run-'));
    await mkdir(this.home, { recursive: true, mode: 0o700 });
    const schema = { review: AnalysisSchema, verify: VerificationSchema, answer: AnswerSchema, questions: QuestionBatchSchema, grade: GradeSchema }[phase];
    const schemaFile = join(dir, 'schema.json'), output = join(dir, 'answer.json');
    await writeFile(schemaFile, JSON.stringify(z.toJSONSchema(schema, { unrepresentable: 'any' })), { mode: 0o600 });
    try {
      await execute(this.binary, ['exec', '--sandbox', 'read-only', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--json',
        ...['shell_tool', 'multi_agent', 'apps', 'hooks', 'browser_use', 'computer_use', 'view_image', 'image_generation'].flatMap(feature => ['--disable', feature]),
        '-c', 'web_search="disabled"',
        '-c', 'approval_policy="never"',
        '-c', 'mcp_servers.review_source.command="node"', '-c', `mcp_servers.review_source.args=${JSON.stringify([fileURLToPath(new URL('./source-mcp.js', import.meta.url)), source])}`,
        '-c', 'mcp_servers.review_source.required=true',
        '--output-schema', schemaFile, '-o', output, '-C', dir,
        ...(this.model ? ['--model', this.model] : []), '-'], {
        cwd: dir, input: redact(prompt), timeoutMs,
        env: { PATH: process.env.PATH, HOME: this.home, CODEX_HOME: this.home, LANG: 'C.UTF-8', ...(process.env.CODEX_API_KEY ? { CODEX_API_KEY: process.env.CODEX_API_KEY } : {}) },
        maxBytes: 16 * 1024 * 1024,
      });
      const bytes = await readFile(output); if (bytes.length > 512000) throw new Error('Model result exceeds limit');
      return schema.parse(JSON.parse(bytes.toString('utf8')));
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
}
export class HttpModel implements Model {
  constructor(readonly url: string, readonly token: string) {}
  async run(phase: ModelPhase, prompt: string, workspaceId: string, timeoutMs = 600000): Promise<unknown> {
    const response = await fetch(`${this.url}/run`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs + 5000), headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ phase, prompt, workspaceId, timeoutMs }) });
    if (!response.ok) throw new Error(`Isolated runner failed (${response.status})`);
    return response.json();
  }
}
