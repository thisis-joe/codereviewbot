import test from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../dist/controller.js';
import { snapshot, report } from './fixtures.mjs';

test('a push during contextual answer generation prevents publishing obsolete code advice', async () => {
  let snap = snapshot(), replies = 0;
  const platform = { config: { botLogin: 'bot' }, permission: async () => 'write', comments: async () => [], inlineComments: async () => [], snapshot: async () => ({ ...snap }), reply: async () => { replies++; } };
  const store = { getTarget: async () => ({ report: report() }), learnings: async () => [] };
  const workspaces = { prepare: async () => ({ context: { sourceDir: '/source' }, policy: {} }) };
  const model = { run: async () => { snap = { ...snap, headSha: 'c'.repeat(40) }; return { answer: 'old code advice', evidence: [], next: 'check code' }; } };
  const controller = new Controller(store, [], workspaces, model);
  const job = { id: 'job', body: { target: snapshot(), comment: { id: 'q1', author: 'joe', body: '@reviewbot explain behavior', parentId: null, discussionId: null } } };
  await assert.rejects(() => controller.command(job, platform, async () => {}), /Answer snapshot changed/);
  assert.equal(replies, 0);
});
