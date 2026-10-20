import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../dist/commands.js';
import * as contracts from '../dist/contracts.js';
import { renderReport, renderGrade } from '../dist/render.js';
import { report, changeQuestions } from './fixtures.mjs';

test('learning commands require explicit intent and associate an answer with one question', () => {
  assert.deepEqual(parseCommand('더 알아보자'), { action: 'questions' });
  assert.deepEqual(parseCommand('@reviewbot 더 알아보자'), { action: 'questions' });
  assert.deepEqual(parseCommand('/reviewbot questions'), { action: 'questions' });
  assert.deepEqual(parseCommand('/reviewbot answer Q-0123456789ab B'), { action: 'answer', id: 'Q-0123456789ab', text: 'B' });
  assert.deepEqual(parseCommand('Q-0123456789ab: 멱등 키를 재사용해야 합니다.'), { action: 'answer', id: 'Q-0123456789ab', text: '멱등 키를 재사용해야 합니다.' });
  assert.equal(parseCommand('내일 더 알아보자고 했어요'), null);
  assert.equal(parseCommand('/reviewbot answer Q-0123456789ab'), null);
  assert.equal(parseCommand('/reviewbot answer CRB-0001 B'), null);
  assert.equal(parseCommand('/reviewbot answer Q-0123456789ab ' + '답'.repeat(7000)).text.length, 7000);
});

test('questions accept bounded choices and reject duplicate or incomplete option sets', () => {
  const q = changeQuestions()[0];
  const options = [{ id: 'A', text: '새 키 생성' }, { id: 'B', text: '같은 키 재사용' }];
  assert.equal(contracts.ChangeQuestionSchema.safeParse({ ...q, options }).success, true);
  assert.equal(contracts.ChangeQuestionSchema.safeParse({ ...q, options: options.slice(0, 1) }).success, false);
  assert.equal(contracts.ChangeQuestionSchema.safeParse({ ...q, options: [options[0], options[0]] }).success, false);
  assert.equal(contracts.ChangeQuestionSchema.safeParse({ ...q, options: [] }).success, true);
});

test('published questions expose revision-bound answer IDs and visible choices without solutions', () => {
  const questions = changeQuestions(); questions[0].options = [{ id: 'A', text: '새 키' }, { id: 'B', text: '같은 키' }];
  const first = renderReport(report({ questions }));
  const ids = [...first.matchAll(/codereviewbot:question:(Q-[a-f0-9]{12})/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, 3);
  assert.match(first, /A[.)] 새 키/); assert.match(first, /B[.)] 같은 키/);
  assert.match(first, /reviewbot answer/); assert.match(first, /더 알아보자/);
  const changed = renderReport(report({ questions, snapshot: { ...report().snapshot, headSha: 'c'.repeat(40) } }));
  assert.ok(!changed.includes(ids[0]));
  assert.ok(!first.includes('정답:'));
});

test('grading preserves question, verdict, all option explanations and valid links under the comment budget', () => {
  const q = { question: '&'.repeat(500), path: Array(5).fill('漢'.repeat(99)).join('/'), line: 1, side: 'RIGHT', options: ['A', 'B', 'C', 'D', 'E'].map(id => ({ id, text: '&'.repeat(299) + id })) };
  const grade = { verdict: 'partial', explanation: '&'.repeat(2000), expectedAnswer: '&'.repeat(2000), optionExplanations: q.options.map(o => ({ id: o.id, explanation: '&'.repeat(799) + o.id })), evidence: Array(6).fill({ path: q.path, line: 1, side: 'RIGHT', reason: '&'.repeat(6000) }) };
  assert.equal(contracts.ChangeQuestionSchema.safeParse(q).success, true); assert.equal(contracts.GradeSchema.safeParse(grade).success, true);
  const body = renderGrade(q, report().snapshot, grade, 'human1');
  assert.ok(body.length <= 60000, `got ${body.length}`); assert.match(body, /부분 정답/);
  for (const id of ['A', 'B', 'C', 'D', 'E']) assert.match(body, new RegExp(`^- ${id}\\.`, 'm'));
  assert.ok(body.includes('%E6%BC%A2'.repeat(99))); assert.ok(body.includes('&amp;'.repeat(500)));
});
