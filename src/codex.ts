import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AnalysisSchema, VerificationSchema, AnswerSchema, InitialQuestionsSchema, QuestionBatchSchema, CsInterviewBatchSchema, GradeSchema } from './contracts.js';
import { execute } from './process.js';
import { ModelFailure, RunnerFailureSchema } from './model-failure.js';
import type { Model, ModelPhase } from './review.js';
import { redact } from './redact.js';

export const phaseSchemas = { review: AnalysisSchema, verify: VerificationSchema, answer: AnswerSchema, initial_questions: InitialQuestionsSchema, questions: QuestionBatchSchema, csinterview: CsInterviewBatchSchema, grade: GradeSchema };
export const sourceServer = fileURLToPath(new URL('./source-mcp.js', import.meta.url));
export async function workspaceSource(dataRoot: string, id: string): Promise<string> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid workspace ID');
  const source = await realpath(join(dataRoot, 'jobs', id, 'source'));
  const root = await realpath(join(dataRoot, 'jobs'));
  if (!source.startsWith(root + sep)) throw new Error('Workspace escaped root');
  return source;
}

export class Codex implements Model {
  // baseUrl points the built-in OpenAI provider at an OpenAI-compatible proxy; it then authenticates with CODEX_API_KEY.
  constructor(readonly root: string, readonly home: string, readonly binary = 'codex', readonly model = '', readonly baseUrl = '') {}
  async run(phase: ModelPhase, prompt: string, id: string, timeoutMs = 600000): Promise<unknown> {
    const source = await workspaceSource(this.root, id);
    const dir = await mkdtemp(join(tmpdir(), 'hey-run-'));
    await mkdir(this.home, { recursive: true, mode: 0o700 });
    const schema = phaseSchemas[phase];
    const schemaFile = join(dir, 'schema.json'), output = join(dir, 'answer.json');
    await writeFile(schemaFile, JSON.stringify(z.toJSONSchema(schema, { unrepresentable: 'any' })), { mode: 0o600 });
    try {
      await execute(this.binary, ['exec', '--sandbox', 'read-only', '--ignore-user-config', '--ignore-rules', '--ephemeral', '--skip-git-repo-check', '--json',
        ...['shell_tool', 'multi_agent', 'apps', 'hooks', 'browser_use', 'computer_use', 'view_image', 'image_generation'].flatMap(feature => ['--disable', feature]),
        '-c', 'web_search="disabled"',
        '-c', 'approval_policy="never"',
        '-c', 'mcp_servers.review_source.command="node"', '-c', `mcp_servers.review_source.args=${JSON.stringify([sourceServer, source])}`,
        '-c', 'mcp_servers.review_source.required=true',
        ...(this.baseUrl ? ['-c', `openai_base_url=${JSON.stringify(this.baseUrl)}`] : []),
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
    if (!response.ok) {
      const text = await response.text();
      let parsed;
      try { parsed = text.length <= 4000 ? RunnerFailureSchema.safeParse(JSON.parse(text)) : undefined; } catch { /* legacy or invalid runner response */ }
      if (parsed?.success) throw new ModelFailure(parsed.data.failure);
      throw new ModelFailure({ code: response.status >= 500 || response.status === 409 ? 'unavailable' : [401, 403].includes(response.status) ? 'authentication' : 'unknown' });
    }
    return response.json();
  }
}
