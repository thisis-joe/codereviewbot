import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
test('real MCP transport exposes only source readers and refuses host paths', async t => {
  const root = await mkdtemp(join(tmpdir(), 'crb-mcp-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'main.ts'), 'call();');
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('dist/source-mcp.js'), root] }));
  t.after(() => client.close());
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(t => t.name).sort(), ['list_files','read_base_file','read_file','search_text']);
  const result = await client.callTool({ name: 'read_file', arguments: { path: 'main.ts', start: 1, limit: 10 } });
  assert.match(result.content[0].text, /call\(\);/);
  assert.equal((await client.callTool({ name: 'read_file', arguments: { path: '/etc/passwd' } })).isError, true);
});
