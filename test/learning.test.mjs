import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../dist/commands.js';
import * as contracts from '../dist/contracts.js';
import { renderReport, renderGrade, renderQuestionBatch } from '../dist/render.js';
import { questionId } from '../dist/learning.js';
import { report, changeQuestions, choices, answerKey } from './fixtures.mjs';

test('learning commands require explicit intent and associate an answer with one question', () => {
  assert.deepEqual(parseCommand('/reviewbot morequestion'), { action: 'questions' });
  assert.equal(parseCommand('/reviewbot morequestion 지금'), null);
  for (const removed of ['더 알아보자', '@reviewbot 더 알아보자', '/reviewbot questions']) assert.notDeepEqual(parseCommand(removed), { action: 'questions' });
  assert.deepEqual(parseCommand('/reviewbot answer Q1 B Q2. C Q3:A'), { action: 'answer', id: 'Q1', text: 'B', more: [{ id: 'Q2', text: 'C' }, { id: 'Q3', text: 'A' }] });
  assert.deepEqual(parseCommand('/reviewbot answer Q1 B Q2와 같은 이유'), { action: 'answer', id: 'Q1', text: 'B Q2와 같은 이유' });
  assert.equal(parseCommand('/reviewbot answer Q1 B Q2'), null);
  for (const short of ['심화1 B', '심화1. B', '심화 1 B', '심화1:b', '심화01 B']) assert.deepEqual(parseCommand(`/reviewbot answer ${short}`), { action: 'answer', id: '심화1', text: short.slice(-1) });
  assert.deepEqual(parseCommand('/reviewbot answer Q1 B 심화2 C 심화3. A'), { action: 'answer', id: 'Q1', text: 'B', more: [{ id: '심화2', text: 'C' }, { id: '심화3', text: 'A' }] });
  assert.deepEqual(parseCommand('/reviewbot answer 심화1 B 심화학습 관점에서'), { action: 'answer', id: '심화1', text: 'B 심화학습 관점에서' });
  assert.equal(parseCommand('/reviewbot answer 심화 B'), null);
  assert.equal(parseCommand('/reviewbot answer ' + Array.from({ length: 11 }, (_, i) => `Q${i + 1} A`).join(' ')), null);
  assert.deepEqual(parseCommand('/reviewbot answer Q-0123456789ab B'), { action: 'answer', id: 'Q-0123456789ab', text: 'B' });
  assert.deepEqual(parseCommand('/reviewbot answer q3 B 같은 키'), { action: 'answer', id: 'Q3', text: 'B 같은 키' });
  assert.deepEqual(parseCommand('/reviewbot answer Q12. A'), { action: 'answer', id: 'Q12', text: 'A' });
  for (const short of ['Q1 B', 'Q1. B', 'Q1.B', 'q1:b', 'Q1) B', 'Q01 B']) assert.deepEqual(parseCommand(`/reviewbot answer ${short}`), { action: 'answer', id: 'Q1', text: short.slice(-1) });
  for (const missing of ['Q1', 'Q1.', 'Q1234 B']) assert.equal(parseCommand(`/reviewbot answer ${missing}`), null);
  assert.equal(parseCommand('Q1: B'), null);
  assert.deepEqual(parseCommand('Q-0123456789ab: 멱등 키를 재사용해야 합니다.'), { action: 'answer', id: 'Q-0123456789ab', text: '멱등 키를 재사용해야 합니다.' });
  assert.equal(parseCommand('/reviewbot answer Q-0123456789ab'), null);
  assert.equal(parseCommand('/reviewbot answer CRB-0001 B'), null);
  assert.equal(parseCommand('/reviewbot answer Q-0123456789ab ' + '답'.repeat(7000)).text.length, 7000);
});

test('questions are multiple choice with exactly four distinct options A–D in order', () => {
  const q = changeQuestions()[0], options = choices('새 키 생성', '같은 키 재사용', '키 없이 재시도', '재시도 금지');
  assert.equal(contracts.ChangeQuestionSchema.safeParse({ ...q, options }).success, true);
  assert.equal(contracts.ChangeQuestionSchema.safeParse({ ...q, options, key: { ...answerKey(), options: answerKey().options.slice(0, 3) } }).success, false);
  assert.equal(contracts.ChangeQuestionSchema.safeParse({ ...q, options, key: answerKey('E') }).success, false);
  assert.equal(contracts.ChangeQuestionSchema.safeParse({ ...q, options, level: 'hard' }).success, false);
  for (const bad of [[], options.slice(0, 3), [...options, { id: 'E', text: '기타' }], [options[1], options[0], ...options.slice(2)], [...options.slice(0, 3), { id: 'D', text: '새 키 생성' }]])
    assert.equal(contracts.ChangeQuestionSchema.safeParse({ ...q, options: bad }).success, false);
  for (const missing of ['options', 'key', 'level']) { const { [missing]: _, ...rest } = { ...q, options }; assert.equal(contracts.ChangeQuestionSchema.safeParse(rest).success, false); }
  assert.equal(contracts.QuestionBatchSchema.safeParse({ questions: Array(4).fill(q) }).success, false);
});

test('published questions expose revision-bound answer IDs and visible choices without solutions', () => {
  const questions = changeQuestions(); questions[0].options = choices('새 키', '같은 키');
  const first = renderReport(report({ questions }));
  const ids = [...first.matchAll(/codereviewbot:question:(Q-[a-f0-9]{12})/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, 3);
  // Readers see Q1..Q3 in bold with bold A–D labels on their own lines; hash IDs stay in hidden markers.
  assert.match(first, /^\*\*Q1\. \[기본\] 이번 pay .*\*\* — \[src\/pay\\\.ts:2\]\(.*\)\\\n(&nbsp;){4}\*\*A\.\*\* 새 키\\\n(&nbsp;){4}\*\*B\.\*\* 같은 키\\\n(&nbsp;){4}\*\*C\.\*\* 보기 C\\\n(&nbsp;){4}\*\*D\.\*\* 보기 D$/m);
  assert.match(first, /^\*\*Q3\. /m);
  assert.ok(first.split('\n').filter(l => !l.startsWith('<!--')).every(l => !/Q-[a-f0-9]{12}/.test(l)));
  assert.match(first, /^### CodeReviewBot 변경 이해 질문$/m); assert.doesNotMatch(first, /^#{1,2} /m);
  assert.match(first, /답변 0\/3/);
  assert.ok(!first.includes(answerKey().explanation) && !first.includes('보기 해설'));
  assert.match(first, /^명령어 안내: `\/reviewbot help`$/m);
  assert.doesNotMatch(first, /\| 명령어|\/reviewbot answer|\/reviewbot morequestion|더 알아보자/);
  const marked = renderReport(report({ questions }), new Map([[ids[0], 'correct'], [ids[1], 'incorrect']]));
  assert.match(marked, /^\*\*Q1\. .* · ✅ 정답\\$/m); assert.match(marked, /^\*\*Q2\. .* · ❌ 오답\\$/m); assert.doesNotMatch(marked, /^\*\*Q3\. .* · /m); assert.match(marked, /답변 2\/3/);
  const changed = renderReport(report({ questions, snapshot: { ...report().snapshot, headSha: 'c'.repeat(40) } }));
  assert.ok(!changed.includes(ids[0]));
  assert.ok(!first.includes('정답:'));
});

test('question and grading comments keep one help entry point without repeating command examples', () => {
  const r = report(), q = r.questions[0];
  const grade = { verdict: 'correct', explanation: '', expectedAnswer: '같은 키를 재사용합니다.', optionExplanations: answerKey().options, evidence: [{ path: q.path, line: q.line, side: q.side, reason: '호출' }] };
  for (const body of [renderReport(r), renderQuestionBatch(r.questions, r.snapshot, 'batch'), renderGrade(q, r.snapshot, grade, 'grade', 'Q1', 'B')]) {
    assert.equal((body.match(/명령어 안내: `\/reviewbot help`/g) ?? []).length, 1);
    assert.doesNotMatch(body, /\| 명령어|사용 예시|\/reviewbot (?!help)[a-z]+/);
  }
});

test('grading preserves question, verdict, all option explanations and valid links under the comment budget', () => {
  const q = { question: '&'.repeat(500), path: Array(5).fill('漢'.repeat(99)).join('/'), line: 1, side: 'RIGHT', level: 'advanced', options: ['A', 'B', 'C', 'D'].map(id => ({ id, text: '&'.repeat(299) + id })), key: { answer: 'D', explanation: '&'.repeat(1500), options: ['A', 'B', 'C', 'D'].map(id => ({ id, explanation: '&'.repeat(500) })) } };
  const grade = { verdict: 'partial', explanation: '&'.repeat(2000), expectedAnswer: '&'.repeat(2000), optionExplanations: q.options.map(o => ({ id: o.id, explanation: '&'.repeat(799) + o.id })), evidence: Array(6).fill({ path: q.path, line: 1, side: 'RIGHT', reason: '&'.repeat(6000) }) };
  assert.equal(contracts.ChangeQuestionSchema.safeParse(q).success, true); assert.equal(contracts.GradeSchema.safeParse(grade).success, true);
  const body = renderGrade(q, report().snapshot, grade, 'human1', 'Q2', 'C');
  assert.match(body, /^\*\*C\.\*\* &amp;.*C \(내 답\) — /m); assert.match(body, /^\*\*D\.\*\* &amp;.*D \(정답\) — /m); assert.doesNotMatch(body, /^\*\*A\.\*\* .*\(내 답\)/m);
  assert.ok(body.length <= 60000, `got ${body.length}`); assert.match(body, /^### Q2 · 🟡 부분 정답$/m); assert.match(body, /^\*\*Q2\. \[심화\] /m); assert.match(body, /^내 답: \*\*C\*\* · 정답: \*\*D\*\*$/m);
  for (const id of ['A', 'B', 'C', 'D']) assert.match(body, new RegExp(`^\\*\\*${id}\\.\\*\\* `, 'm'));
  assert.ok(body.includes('%E6%BC%A2'.repeat(99))); assert.ok(body.includes('&amp;'.repeat(500)));
});
