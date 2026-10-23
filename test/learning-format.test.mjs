import test from 'node:test';
import assert from 'node:assert/strict';
import { renderReport, renderQuestionBatch, renderGrade, renderReveal } from '../dist/render.js';
import { initialQuestions, report, snapshot, answerKey } from './fixtures.mjs';
const commits = [{ sha: 'c'.repeat(40), title: 'GMS API 직접 호출 추가' }, { sha: 'b'.repeat(40), title: '핵심 CS 질문 두 개로 정리' }];
const s = snapshot({ commits });
test('initial and additional questions have H4 headings, blank lines and one bullet per commit title', () => {
  const questions = initialQuestions();
  for (const body of [renderReport(report({ snapshot: s, questions })), renderQuestionBatch(questions, s, 'extra')]) {
    assert.match(body, /^#### (?:Q|심화)1\. .*\n\n/m);
    for (const c of commits) assert.ok(body.includes(`- [${c.title}](`));
    assert.equal([...body.matchAll(/^- \[.*\]\(.*\/commit\//gm)].length, 2);
    assert.doesNotMatch(body, /기준 커밋.*\[bbbbbbbb\]/);
  }
});
test('grading and reveal use a simple explanation heading and space before its contents', () => {
 const q = initialQuestions()[0];
 const grade = { verdict: 'correct', explanation: '', expectedAnswer: '멱등성은 같은 요청의 반복에도 효과가 같은 성질입니다.', optionExplanations: answerKey().options, evidence: [] };
 for (const body of [renderGrade(q, s, grade, 'grade', 'Q1', 'B'), renderReveal([{q,label:'Q1'}],s,'reveal')]) {
  assert.match(body, /##### 해설\n\n/); assert.doesNotMatch(body,/CS 지식과 코드 적용/);
  assert.match(body,/^#### Q1\. .*\n\n/m);
  for (const c of commits) assert.ok(body.includes(`- [${c.title}](`));
 }
});

test('initial questions keep the hey greeting and follow-ups start directly with the first question', () => {
  const initial = renderReport(report({ questions: initialQuestions() })).split('\n').filter(l => !l.startsWith('<!--')).join('\n');
  assert.match(initial, /^#### hey! 이건 알고 머지하는거지\? 😏\n/);
  assert.doesNotMatch(initial, /핵심 CS 질문 \d+개/);
  const more = renderQuestionBatch(initialQuestions(), s, 'extra').split('\n').filter(l => !l.startsWith('<!--')).join('\n');
  assert.match(more, /^#### 심화1\./);
  assert.doesNotMatch(more, /^### 심화 질문/m);
});
