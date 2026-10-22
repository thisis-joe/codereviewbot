import test from 'node:test';
import assert from 'node:assert/strict';
import { givenName, renderNotification, Mattermost } from '../dist/mattermost.js';

const target = { platform: 'gitlab', instance: 'https://gitlab.example', repository: 'team/project', number: 15 };

test('MM uses given names without surnames, team labels or login IDs', () => {
  for (const [display, expected] of [['박찬형[부울경_1반_E102]팀원', '찬형'], ['우동균', '동균'], ['남궁민', '민'], ['김 민수', '민수'], ['Joseph Kim', 'Joseph'], ['', '작성자']])
    assert.equal(givenName(display), expected);
});

test('MR lifecycle notifications use one author-attributed sentence and one bold MR-title link', () => {
  const expected = { opened: '찬형님의 새 MR이 열렸어요. 📬', reopened: '찬형님의 MR이 다시 열렸어요. 🔄', merged: '찬형님의 MR 머지가 완료됐어요! 🎉', closed: '찬형님의 MR이 닫혔어요. 🚪' };
  for (const [kind, first] of Object.entries(expected)) {
    const text = renderNotification(target, { kind, title: 'docs(data): 대금 자료 조사' }, '박찬형[소속]팀원');
    assert.equal(text, `${first}\n[**MR !15 - docs\\(data\\): 대금 자료 조사**](https://gitlab.example/team/project/-/merge_requests/15)`);
    assert.equal(text.split('\n').length, 2);
    assert.doesNotMatch(text, /project_\d+_bot|codereviewbot|\[소속\]|박찬형/);
  }
});

test('question notices omit counts and partial-scope status while linking the full MR title to the questions', () => {
  const text = renderNotification(target, { kind: 'questions', title: '@channel [링크](https://evil.example)', count: 4, noteId: '321' }, '박찬형');
  assert.ok(text.startsWith('찬형님의 새 질문이 준비됐어요. 😏\n[**MR !15 - '));
  assert.ok(text.endsWith('**](https://gitlab.example/team/project/-/merge_requests/15#note_321)'));
  assert.doesNotMatch(text, /@channel|<!--|summary:v|revision:|질문 4개|일부 변경 제외/);
  assert.ok(text.includes('@\u200bchannel'));
  assert.equal(renderNotification(target, { kind: 'questions', title: '@channel [링크](https://evil.example)', count: 9, noteId: '321', partial: true }, '박찬형'), text);
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
  assert.equal(text, `찬형님의 커밋 24개가 올라왔어요. 📦\n[**feature/data**](https://gitlab.example/team/project/-/compare/${before}...${after})`);
  const created = renderNotification({ ...target, number: 0 }, { kind: 'push', branch: 'feature/new', count: 3, author: '우동균', before: '0'.repeat(40), after }, '');
  assert.equal(created, '동균님의 새 브랜치가 생겼어요. 🌱\n[**feature/new**](https://gitlab.example/team/project/-/commits/feature%2Fnew)');
  const empty = renderNotification(target, { kind: 'push', branch: 'feature/data', count: 0, author: '박찬형', before, after }, '');
  assert.ok(empty.startsWith('찬형님의 커밋 0개가 올라왔어요. 📦\n'));
  assert.equal(text.split('\n').length, 2);
  assert.doesNotMatch(text, /변경 내용 보기/);
});

test('comment notices link the full MR title directly to the comment', () => {
  const text = renderNotification(target, { kind: 'commented', title: '대금 자료 조사', noteId: '123' }, '박찬형');
  assert.equal(text, '찬형님의 MR에 새 댓글이 달렸어요. 💬\n[**MR !15 - 대금 자료 조사**](https://gitlab.example/team/project/-/merge_requests/15#note_123)');
});

test('branch links preserve parentheses as URL data and keep mentions inert', () => {
  const text = renderNotification(target, { kind: 'push', branch: 'feat(ai)/close)@channel', count: 0, author: '우동균', before: '0'.repeat(40), after: 'a'.repeat(40) }, '');
  assert.ok(text.includes('/-/commits/feat%28ai%29%2Fclose%29%40channel)'));
  assert.doesNotMatch(text, /@channel/);
});
