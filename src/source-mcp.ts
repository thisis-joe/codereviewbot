import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { RepositoryReader } from './source-reader.js';
import { dirname, join } from 'node:path';
if (!process.argv[2]) throw new Error('Source root required');
const reader = new RepositoryReader(process.argv[2]);
const base = new RepositoryReader(join(dirname(process.argv[2]), 'base'));
const server = new McpServer({ name: 'hey-source', version: '1.0.0' });
const output = async (fn: () => Promise<unknown>) => {
  try { return { content: [{ type: 'text' as const, text: JSON.stringify(await fn()) }] }; }
  catch { return { isError: true, content: [{ type: 'text' as const, text: 'Source request refused or unavailable' }] }; }
};
server.registerTool('list_files', { description: 'List repository source files in this fixed review snapshot.', inputSchema: {}, annotations: { readOnlyHint: true } }, async () => output(() => reader.list()));
server.registerTool('read_file', { description: 'Read line-numbered source. No host paths or symlinks allowed.', inputSchema: { path: z.string(), start: z.int().min(1).default(1), limit: z.int().min(1).max(500).default(200) }, annotations: { readOnlyHint: true } }, async ({ path, start, limit }) => output(() => reader.read(path, start, limit)));
server.registerTool('search_text', { description: 'Literal text search across this snapshot to find definitions, callers, types and tests. At most 50 results.', inputSchema: { term: z.string().min(1).max(200) }, annotations: { readOnlyHint: true } }, async ({ term }) => output(() => reader.search(term)));
server.registerTool('read_base_file', { description: 'Read a changed file from the base commit, before this PR/MR. Use for deleted/renamed code; paths are the old paths in the diff.', inputSchema: { path: z.string(), start: z.int().min(1).default(1), limit: z.int().min(1).max(500).default(200) }, annotations: { readOnlyHint: true } }, async ({ path, start, limit }) => output(() => base.read(path, start, limit)));
await server.connect(new StdioServerTransport());
