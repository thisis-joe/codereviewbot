import test from 'node:test';
import assert from 'node:assert/strict';
import { InitialQuestionsSchema, hasChangeQuestions } from '../dist/contracts.js';
import { generateQuestions } from '../dist/review.js';
import { renderReport } from '../dist/render.js';
import { answerGate } from '../dist/answer-gate.js';
import { questionId } from '../dist/learning.js';
import { readPolicy } from '../dist/policy.js';
import { snapshot, report, changeQuestions } from './fixtures.mjs';

const questions = () => [changeQuestions()[0], changeQuestions()[2]].map(q=>({...q,level:'basic'}));
test('initial CS questions accept exactly two basic questions', () => {
 for (const level of ['basic', 'advanced']) assert.equal(InitialQuestionsSchema.safeParse({questions:questions().map(q=>({...q,level}))}).success,level === 'basic');
 for (const count of [0,1,3,4,5]) assert.equal(InitialQuestionsSchema.safeParse({questions:Array.from({length:count},()=>questions()[0])}).success,false);
});
test('generation assigns change-effect and principle-application goals in a single call', async()=>{
 const calls=[];
 const context={files:{'src/pay.ts':'function pay() {\ncharge();\n}'},diff:{'src/pay.ts':{oldPath:'src/pay.ts',patch:'@@ -1,3 +1,3 @@\n function pay() {\n+charge();\n }',lines:new Set([1,2,3])}},excluded:[],limited:false,sourceDir:'/snapshot/source'};
 const result=await generateQuestions({run:async(...args)=>{calls.push(args);return {questions:questions()};}},'workspace',snapshot(),readPolicy(),context,null,[],[],'full');
 assert.equal(result.questions.length,2);assert.equal(calls.length,1);
 const prompt = calls[0][1];
 assert.match(prompt,/Q1은 변경의 핵심 효과/);assert.match(prompt,/Q2는.*핵심 원리를 적용/);
 assert.match(prompt,/같은 개념을 다루더라도 Q1은 변경 효과, Q2는 원리 적용/);
 assert.match(prompt,/함수명을 반드시 질문에 넣을 필요는 없습니다/);
 assert.match(prompt,/단순한 값 조회나 실행 순서 추적만으로 평가가 끝나지 않는다/);
 assert.match(prompt,/선택지의 차이가 예외 처리 경로나 내부 규칙의 결과뿐이면/);
 assert.match(prompt,/key.explanation: 관련 원리의 뜻/);
 assert.match(prompt,/정확히 2개/);assert.match(prompt,/level은 모두 basic/);
 assert.doesNotMatch(prompt,/서로 다른 CS 원리 두 가지|나머지는 기존처럼 동작|정확히 4개|basic 3개/);
});
test('two questions are visible before short action hints and both count toward the answer gate', ()=>{
 const r=report({questions:questions(),requireAnswers:true}); assert.equal(hasChangeQuestions(r),true);
 const body=renderReport(r);
 assert.equal([...body.matchAll(/^#### Q\d+\./gm)].length,2);
 assert.match(body,/#### hey! 이건 알고 머지한거지\? 😏/);assert.ok(body.indexOf('#### Q2.')<body.indexOf('답변 달기:'));
 assert.match(body,/더 풀어보기: `\/hey whatelse`/);assert.match(body,/답변 0\/2/);
 assert.equal(answerGate(r,new Set()).description,'질문 답변 0/2');
 const ids = questions().map(q => questionId(r.snapshot, q));
 assert.deepEqual(answerGate(r,new Set([ids[0]])),{state:'pending',description:'질문 답변 1/2'});
 assert.deepEqual(answerGate(r,new Set(ids)),{state:'success',description:'질문 2개에 모두 답했습니다.'});
 assert.equal([...body.matchAll(/codereviewbot:question:/g)].length,2);
 assert.ok(!body.includes(questions()[0].key.explanation));
});
