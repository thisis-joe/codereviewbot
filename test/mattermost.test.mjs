import test from 'node:test';
import assert from 'node:assert/strict';
import { givenName, renderNotification, Mattermost } from '../dist/mattermost.js';

const target = { platform: 'gitlab', instance: 'https://gitlab.example', repository: 'team/project', number: 15 };

test('MM uses given names without surnames, team labels or login IDs', () => {
  for (const [display, expected] of [['박찬형[부울경_1반_E102]팀원', '찬형'], ['우동균', '동균'], ['남궁민', '민'], ['김 민수', '민수'], ['Joseph Kim', 'Joseph'], ['', '작성자']])
    assert.equal(givenName(display), expected);
});

test('MR lifecycle notifications use one author-attributed sentence and one bold MR-title link', () => {
  const expected = { opened: '**찬형**님이 **새 MR**을 열었어요. 📬', reopened: '**찬형**님이 **MR을 다시 열었어요.** 🔄', merged: '**찬형**님의 **MR이 머지됐어요!** 🎉', closed: '**찬형**님의 **MR이 닫혔어요.** 🗃️' };
  for (const [kind, first] of Object.entries(expected)) {
    const text = renderNotification(target, { kind, title: 'docs(data): 대금 자료 조사' }, '박찬형[소속]팀원');
    assert.equal(text, `${first}\n[**MR !15 · docs\\(data\\): 대금 자료 조사**](https://gitlab.example/team/project/-/merge_requests/15)`);
    assert.equal(text.split('\n').length, 2);
    assert.doesNotMatch(text, /project_\d+_bot|codereviewbot|\[소속\]|박찬형/);
  }
});

test('question notices omit counts and partial-scope status while linking the full MR title to the questions', () => {
  const text = renderNotification(target, { kind: 'questions', title: '@channel [링크](https://evil.example)', count: 4, noteId: '321' }, '박찬형');
  assert.ok(text.startsWith('**찬형**님의 MR에 **질문이 준비됐어요.** 🧩\n[**MR !15 · '));
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
  assert.equal(text, `**찬형**님의 **전체 커밋 24개 · 분류 미확인**가 올라왔어요. 🚀\n[**feature/data**](https://gitlab.example/team/project/-/compare/${before}...${after})`);
  const created = renderNotification({ ...target, number: 0 }, { kind: 'push', branch: 'feature/new', count: 3, author: '우동균', before: '0'.repeat(40), after }, '');
  assert.equal(created, '**동균**님의 **새 브랜치가 생겼어요.** 🌱\n[**feature/new**](https://gitlab.example/team/project/-/commits/feature%2Fnew)');
  const empty = renderNotification(target, { kind: 'push', branch: 'feature/data', count: 0, author: '박찬형', before, after }, '');
  assert.ok(empty.startsWith('**찬형**님의 **변경 커밋 0개 · 병합 커밋 0개**가 올라왔어요. 🚀\n'));
  assert.equal(text.split('\n').length, 2);
  assert.doesNotMatch(text, /변경 내용 보기/);
});

test('comment notices link the full MR title directly to the comment', () => {
  const text = renderNotification(target, { kind: 'commented', title: '대금 자료 조사', noteId: '123' }, '박찬형');
  assert.equal(text, '**찬형**님이 MR에 **댓글을 남겼어요.** 💬\n[**MR !15 · 대금 자료 조사**](https://gitlab.example/team/project/-/merge_requests/15#note_123)');
});

test('branch links preserve parentheses as URL data and keep mentions inert', () => {
  const text = renderNotification(target, { kind: 'push', branch: 'feat(ai)/close)@channel', count: 0, author: '우동균', before: '0'.repeat(40), after: 'a'.repeat(40) }, '');
  assert.ok(text.includes('/-/commits/feat%28ai%29%2Fclose%29%40channel)'));
  assert.doesNotMatch(text, /@channel/);
});

test('push admission sorts commit messages chronologically and renders linked one-line subjects without visible dates or hashes', async () => {
  let payload;
  const config = { ...target, enabled: true, mattermostWebhookEnv: 'MM_URL' };
  const mm = new Mattermost({ pool: { query: async (_sql, values) => { payload = values[2]; return { rowCount: 1 }; } } }, [{ config }], { MM_URL: 'https://mm.example/hooks/test' });
  const commits = [
    { id: 'b'.repeat(40), timestamp: '2026-10-23T02:00:00Z', parent_ids: [], message: 'fix: 빈 배열 반환\n\n본문 제외' },
    { id: 'a'.repeat(40), timestamp: '2026-10-23T10:00:00+09:00', parent_ids: [], message: 'feat: 조회 API 추가' },
    { id: 'c'.repeat(40), timestamp: '2026-10-23T03:00:00Z', parent_ids: [], message: '일반 커밋 @channel [링크]' },
  ];
  await mm.capture({ repo: config, deliveryId: 'push', body: { object_kind: 'push', ref: 'refs/heads/feature/data', before: 'd'.repeat(40), after: 'c'.repeat(40), user_name: '박찬형', total_commits_count: 3, commits } });
  const text = renderNotification(target, payload, '');
  assert.match(text, /\n\n- \[\*feat:\* \*\*조회 API 추가\*\*\]/);
  assert.ok(text.indexOf('조회 API 추가') < text.indexOf('빈 배열 반환'));
  assert.ok(text.indexOf('빈 배열 반환') < text.indexOf('일반 커밋'));
  assert.equal(text.split('\n').filter(line => line.startsWith('- ')).length, 3);
  assert.ok(text.includes('/-/commit/' + 'a'.repeat(40)));
  const visible = text.replace(/\]\([^)]*\)/g, ']');
  assert.doesNotMatch(visible, /2026-|02:00|aaaaaaa|bbbbbbb|본문 제외|@channel/);
});

test('comment capture uses the commenter and an escaped italic first-line preview', async () => {
  let payload;
  const config = { ...target, enabled: true, mattermostWebhookEnv: 'MM_URL' };
  const mm = new Mattermost({ pool: { query: async (_sql, values) => { payload = values[2]; return { rowCount: 1 }; } } }, [{ config }], { MM_URL: 'https://mm.example/hooks/test' });
  await mm.capture({ repo: config, deliveryId: 'note', body: { object_kind: 'note', user: { username: 'human', name: '우동균' }, merge_request: { iid: 15, title: '조회 API' }, object_attributes: { id: 123, noteable_type: 'MergeRequest', note: '확인 *부탁* @channel\n둘째 줄 제외' } } });
  const text = renderNotification(target, payload, '박찬형');
  assert.ok(text.startsWith('**동균**님이 MR에 **댓글을 남겼어요.** 💬'));
  assert.ok(text.includes('\n\n*“확인 \\*부탁\\* @\u200bchannel”*'));
  assert.doesNotMatch(text, /둘째 줄 제외|@channel/);
});

test('push counts use parents, omit merge rows and never infer merges from subjects', async () => {
  let payload;
  const config = { ...target, enabled: true, mattermostWebhookEnv: 'MM_URL' };
  const mm = new Mattermost({ pool: { query: async (_sql, values) => { payload = values[2]; return { rowCount: 1 }; } } }, [{ config }], { MM_URL: 'https://mm.example/hooks/test' });
  await mm.capture({ repo: config, deliveryId: 'parents', body: { object_kind: 'push', ref: 'refs/heads/develop', before: 'd'.repeat(40), after: 'c'.repeat(40), user_name: '우동균', total_commits_count: 3, commits: [
    { id: 'a'.repeat(40), message: 'Merge is an ordinary subject', parent_ids: ['d'.repeat(40)] },
    { id: 'b'.repeat(40), message: 'chore: sync develop', parent_ids: ['a'.repeat(40), 'e'.repeat(40)] },
    { id: 'c'.repeat(40), message: 'land branch', parent_ids: ['b'.repeat(40), 'f'.repeat(40), 'e'.repeat(40)] },
  ] } });
  const text = renderNotification(target, payload, '');
  assert.match(text, /변경 커밋 1개 · 병합 커밋 2개/);
  assert.equal(text.split('\n').filter(x => x.startsWith('- ')).length, 1);
  assert.match(text, /Merge is an ordinary subject/);
  assert.doesNotMatch(text, /sync develop|land branch/);
});

async function dispatchPush(payload, compare, detail) {
  const sent = [], reads = [], settled = [];
  const job = { key: 'job', target, payload, owner: 'owner', attempts: 1 };
  const store = { transaction: async action => action({ query: async sql => ({ rows: sql.startsWith('SELECT') || sql.includes('RETURNING') ? [job] : [] }) }), pool: { query: async (_sql, args) => { settled.push(args.slice(2)); } } };
  const config = { ...target, enabled: true, mattermostWebhookEnv: 'MM_URL' };
  const api = { request: async path => { reads.push(path); return path.includes('/compare?') ? compare : detail; } };
  const mm = new Mattermost(store, [{ config, root: '/projects/test', api }], { MM_URL: 'https://mm.example/hooks/test' }, async (_url, init) => { sent.push(JSON.parse(init.body)); return new Response('ok'); });
  mm.tick(); await mm.active;
  return { sent, reads, settled };
}
const pushPayload = (count, commits = []) => ({ kind: 'push', branch: 'develop', count, author: '우동균', before: 'd'.repeat(40), after: 'c'.repeat(40), commits });

test('old queued payload and truncated webhook are classified from the full straight comparison', async () => {
  const commits = Array.from({ length: 24 }, (_, i) => ({ id: (i + 1).toString(16).padStart(40, '0'), message: `change ${i}`, parent_ids: i < 7 ? [] : ['a'.repeat(40), 'b'.repeat(40)] }));
  const result = await dispatchPush(pushPayload(24, [{ id: 'a'.repeat(40), subject: 'old queued subject', timestamp: null }]), { commits });
  assert.equal(result.reads.length, 1);
  assert.match(result.reads[0], /straight=true$/);
  assert.match(result.sent[0].text, /변경 커밋 7개 · 병합 커밋 17개/);
  assert.equal(result.sent[0].text.split('\n').filter(x => x.startsWith('- ')).length, 7);
  assert.deepEqual(result.settled, [['sent', null]]);
});

test('missing parents require commit detail; incomplete comparisons never send false counts', async () => {
  const commit = { id: 'a'.repeat(40), message: 'not a merge-looking title' };
  const result = await dispatchPush(pushPayload(1), { commits: [commit] }, { ...commit, parent_ids: ['b'.repeat(40), 'c'.repeat(40)] });
  assert.equal(result.reads.length, 2);
  assert.match(result.sent[0].text, /변경 커밋 0개 · 병합 커밋 1개/);
  assert.equal(result.sent[0].text.split('\n').filter(x => x.startsWith('- ')).length, 0);
  for (const comparison of [{ commits: [] }, { commits: [commit], compare_timeout: true }, { commits: [commit, commit] }]) {
    const bad = await dispatchPush(pushPayload(2), comparison);
    assert.equal(bad.sent.length, 0);
    assert.deepEqual(bad.settled, [['queued', 'commits_lookup_failed']]);
  }
  const missing = await dispatchPush(pushPayload(1), { commits: [commit] }, commit);
  assert.equal(missing.sent.length, 0);
  assert.deepEqual(missing.settled, [['queued', 'commits_lookup_failed']]);
});

test('captured MR132, MR134 and MR44 Git parent ranges reproduce the reported counts', async () => {
  const { readFile } = await import('node:fs/promises');
  const ranges = JSON.parse(await readFile(new URL('../docs/verification/push-count-ranges-2026-10-29.json', import.meta.url), 'utf8'));
  for (const range of ranges) {
    const result = await dispatchPush({ ...pushPayload(range.commits.length), before: range.before, after: range.after }, { commits: range.commits });
    assert.ok(result.sent[0].text.includes(`변경 커밋 ${range.changes}개 · 병합 커밋 ${range.merges}개`), range.mr);
    assert.equal(result.sent[0].text.split('\n').filter(x => x.startsWith('- ')).length, range.changes);
  }
});
