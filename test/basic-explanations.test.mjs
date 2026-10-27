import test from 'node:test';
import assert from 'node:assert/strict';
import { InitialQuestionsSchema, AnswerKeySchema, GradeSchema } from '../dist/contracts.js';
import { renderReport, renderGrade, renderReveal } from '../dist/render.js';
import { initialQuestions, report, snapshot, choices, answerKey } from './fixtures.mjs';
const basic = () => initialQuestions().map(q => ({ ...q, level: 'basic' }));
test('initial questions reject advanced content and never display difficulty tags', () => {
  assert.equal(InitialQuestionsSchema.safeParse({ questions: basic() }).success, true);
  assert.equal(InitialQuestionsSchema.safeParse({ questions: basic().map((q,i)=>i ? {...q,level:'advanced'} : q) }).success, false);
  assert.doesNotMatch(renderReport(report({ questions: basic().map(q=>({...q,level:'advanced'})) })), /\[심화\]/);
});
test('feedback uses the correct choice sentence and a separate indented explanation for each option', () => {
  const q = { ...basic()[0], options: choices('새 키를 만듭니다.', '같은 키로 요청을 식별합니다.', '승인을 생략합니다.', '재시도를 금지합니다.') };
  const explanation = '멱등성은 같은 요청을 반복해도 효과가 같은 성질입니다. pay는 같은 키로 기존 승인을 식별하므로 중복 결제를 막습니다.';
  const optionExplanations = q.options.map(o=>({id:o.id,explanation:'이 코드는 같은 키로 기존 요청을 식별합니다. 이 선택은 해당 동작과 일치하는지 확인해야 합니다.'}));
  const grade = { verdict:'correct', explanation:'이유가 코드와 일치합니다.', expectedAnswer:explanation, optionExplanations, evidence:[] };
  const revealQ = { ...q, key:{...q.key, explanation, options:optionExplanations} };
  for(const body of [renderGrade(q,snapshot(),grade,'grade','Q1','B'),renderReveal([{q:revealQ,label:'Q1'}],snapshot(),'reveal')]) {
    assert.doesNotMatch(body,/내 답:|정답:|\(내 답|\(정답\)| — /);
    assert.ok(body.includes('같은 키로 요청을 식별합니다'));
    assert.match(body, /- \*\*A\.\*\* 새 키를 만듭니다[^\n]*\n\n  > 이 코드는/);
    assert.match(body,/##### 해설\n\n멱등성은/);
  }
});
test('new answer keys and grading explanations require one to three sentences', () => {
  const short='같은 키를 사용합니다. 중복 요청을 식별합니다. 승인 부작용을 줄입니다.';
  const long=short+' 따라서 새 승인을 만들지 않습니다.';
  assert.equal(AnswerKeySchema.safeParse({...answerKey(),explanation:short}).success,true);
  assert.equal(AnswerKeySchema.safeParse({...answerKey(),explanation:long}).success,false);
  assert.equal(AnswerKeySchema.safeParse({...answerKey(),options:answerKey().options.map(o=>({...o,explanation:long}))}).success,false);
  const grade={verdict:'correct',explanation:short,expectedAnswer:short,optionExplanations:[],evidence:[]};
  assert.equal(GradeSchema.safeParse(grade).success,true);
  assert.equal(GradeSchema.safeParse({...grade,expectedAnswer:long}).success,false);
  assert.equal(GradeSchema.safeParse({...grade,optionExplanations:[{id:'A',explanation:long}]}).success,false);
  // Feedback credits, names the misreading and cites code, so it alone may run to four sentences.
  assert.equal(GradeSchema.safeParse({...grade,explanation:long}).success,true);
  assert.equal(GradeSchema.safeParse({...grade,explanation:long+' 그래서 D가 아닙니다.'}).success,false);
});
