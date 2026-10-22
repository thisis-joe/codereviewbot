import test from 'node:test';
import assert from 'node:assert/strict';
import { givenName, renderNotification, Mattermost } from '../dist/mattermost.js';

const target = { platform: 'gitlab', instance: 'https://gitlab.example', repository: 'team/project', number: 15 };

test('MM uses given names without surnames, team labels or login IDs', () => {
  for (const [display, expected] of [['박찬형[부울경_1반_E102]팀원', '찬형'], ['우동균', '동균'], ['남궁민', '민'], ['김 민수', '민수'], ['Joseph Kim', 'Joseph'], ['', '작성자']])
    assert.equal(givenName(display), expected);
});

test('MR lifecycle notifications distinguish events, identify the author and link the title', () => {
  const expected = { opened: '📬 찬형님의 MR !15이 열렸어요', reopened: '🔄 찬형님의 MR !15이 다시 열렸어요', merged: '🎉 찬형님의 MR !15 머지 완료', closed: '🚪 찬형님의 MR !15이 닫혔어요' };
  for (const [kind, first] of Object.entries(expected)) {
    const text = renderNotification(target, { kind, title: 'docs(data): 대금 자료 조사' }, '박찬형[소속]팀원');
    assert.equal(text, `**${first}**\n[docs\\(data\\): 대금 자료 조사](https://gitlab.example/team/project/-/merge_requests/15)`);
    assert.equal(text.split('\n').length, 2);
    assert.doesNotMatch(text, /project_\d+_bot|codereviewbot|\[소속\]|박찬형/);
  }
});

test('question notifications contain the count and exact question-comment link without tags or keys', () => {
  const text = renderNotification(target, { kind: 'questions', title: '@channel [링크](https://evil.example)', count: 4, noteId: '321' }, '박찬형');
  assert.match(text, /^\*\*😏 찬형님의 MR !15 · 질문 4개 준비됐어요\*\*/);
  assert.ok(text.endsWith('(https://gitlab.example/team/project/-/merge_requests/15#note_321)'));
  assert.doesNotMatch(text, /@channel|<!--|summary:v|revision:/);
  assert.ok(text.includes('@\u200bchannel'));
});

test('MM destinations are opt-in per repository and refuse unsafe configured URLs', () => {
  const config = { ...target, botLogin: 'bot', enabled: true, mattermostWebhookEnv: 'MM_URL' };
  const platform = { config };
  assert.doesNotThrow(() => new Mattermost({}, [platform], {}));
  for (const url of ['http://mm.example/hooks/abc', 'https://user:secret@mm.example/hooks/abc', 'https://mm.example/hooks/abc?leak=1', 'https://mm.example/not-a-hook'])
    assert.throws(() => new Mattermost({}, [platform], { MM_URL: url }), /Mattermost/);
  assert.doesNotThrow(() => new Mattermost({}, [platform], { MM_URL: 'https://mm.example/hooks/abc' }));
});

test('push notifications show the pusher given name, branch and full commit count with hashes only in the URL', () => {
  const after = 'a'.repeat(40), before = 'b'.repeat(40);
  const text = renderNotification({ ...target, number: 0 }, { kind: 'push', branch: 'feature/data', count: 24, author: '박찬형[소속]팀원', before, after }, '');
  assert.equal(text, `**📦 찬형님이 feature/data에 커밋 24개를 푸시했어요**\n[변경 내용 보기](https://gitlab.example/team/project/-/compare/${before}...${after})`);
  const created = renderNotification({ ...target, number: 0 }, { kind: 'push', branch: 'feature/new', count: 0, author: '우동균', before: '0'.repeat(40), after }, '');
  assert.match(created, /동균님이 feature\/new 브랜치를 올렸어요/);
  assert.ok(created.endsWith('/-/commits/feature%2Fnew)'));
});
