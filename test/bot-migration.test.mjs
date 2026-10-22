import test from 'node:test';
import assert from 'node:assert/strict';
import { RepositorySchema, isBotLogin } from '../dist/config.js';
import { normalize } from '../dist/webhooks.js';
import { Platform } from '../dist/platform.js';
const config = { platform: 'gitlab', instance: 'https://gitlab.example', repository: 'team/demo', botLogin: 'hey-bot', retiredBotLogins: ['old-bot'], webhookSecretEnv: 'HOOK_SECRET', webhookAuth: 'secret', tokenEnv: 'TOKEN' };
test('retired bot aliases are bounded, denied commands, and never writable ownership', async () => {
  assert.equal(RepositorySchema.safeParse(config).success, true);
  assert.equal(RepositorySchema.safeParse({ ...config, retiredBotLogins: Array(11).fill('old-bot') }).success, false);
  const platform = new Platform(config, { get: async () => assert.fail('no credential lookup needed') });
  for (const login of ['hey-bot', 'old-bot']) { assert.equal(isBotLogin(config, login), true); assert.equal(await platform.permission(login), 'none');
    assert.deepEqual(normalize({ repo: config, deliveryId: 'd', body: { object_kind: 'note', user: { username: login }, merge_request: { iid: 1 }, object_attributes: { noteable_type: 'MergeRequest', id: 1, note: '/hey help' } } }), []);
  }
  assert.equal(platform.owned({ author: 'old-bot' }), false); assert.equal(platform.owned({ author: 'hey-bot' }), true);
});

test('retired bot notes cannot leak internal markers into Mattermost notifications', async () => {
  const { Mattermost } = await import('../dist/mattermost.js');
  const repo = { ...config, enabled: true, mattermostWebhookEnv: 'MM_URL' };
  const mm = new Mattermost({ pool: { query: async () => assert.fail('retired notes must never queue notifications') } }, [{ config: repo }], { MM_URL: 'https://mm.example/hooks/test' });
  assert.equal(await mm.capture({ repo, deliveryId: 'old-note', body: { object_kind: 'note', user: { username: 'old-bot' }, merge_request: { iid: 1, title: '이전 질문' }, object_attributes: { id: 42, noteable_type: 'MergeRequest', action: 'create', note: '<!-- codereviewbot:question:Q-abc -->' } } }), false);
});
