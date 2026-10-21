import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Platform } from '../dist/platform.js';

test('notice edits and deletes use the native GitHub comment surface and GitLab note APIs', async t => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    requests.push({ method: req.method, path: req.url, body: body ? JSON.parse(body) : null });
    res.setHeader('content-type', 'application/json'); res.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const config = { instance: `http://127.0.0.1:${server.address().port}`, repository: 'joe/demo', botLogin: 'bot' };
  const gh = new Platform({ ...config, platform: 'github' }, async () => 'fixture-token');
  for (const surface of ['issue', 'review']) {
    await gh.editComment(1, { id: '42', surface }, '실패 안내');
    await gh.deleteComment(1, { id: '42', surface });
  }
  const gl = new Platform({ ...config, platform: 'gitlab' }, async () => 'fixture-token');
  await gl.editComment(1, { id: '42', surface: 'note' }, '실패 안내');
  await gl.deleteComment(1, { id: '42', surface: 'note' });
  assert.deepEqual(requests, [
    { method: 'PATCH', path: '/repos/joe/demo/issues/comments/42', body: { body: '실패 안내' } },
    { method: 'DELETE', path: '/repos/joe/demo/issues/comments/42', body: null },
    { method: 'PATCH', path: '/repos/joe/demo/pulls/comments/42', body: { body: '실패 안내' } },
    { method: 'DELETE', path: '/repos/joe/demo/pulls/comments/42', body: null },
    { method: 'PUT', path: '/api/v4/projects/joe%2Fdemo/merge_requests/1/notes/42', body: { body: '실패 안내' } },
    { method: 'DELETE', path: '/api/v4/projects/joe%2Fdemo/merge_requests/1/notes/42', body: null },
  ]);
});
