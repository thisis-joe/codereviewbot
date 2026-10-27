import test from 'node:test';
import assert from 'node:assert/strict';
import { emphasized, renderReveal, renderGrade } from '../dist/render.js';
import { snapshot, initialQuestions } from './fixtures.mjs';

const note = '원자성(atomicity)과 멱등성을 혼동했습니다. 원자성은 **한 트랜잭션의 변경이 전부 반영되거나 전혀 반영되지 않음**을 보장할 뿐, **같은 요청이 두 번 도착하는 것**은 막지 못합니다.';
const tags = text => ({ open: text.split('<b>').length - 1, close: text.split('</b>').length - 1 });

test('bold markers render as escaped <b> spans, at most two, and never as raw or escaped asterisks', () => {
  const html = emphasized(note);
  assert.equal(html, '원자성\\(atomicity\\)과 멱등성을 혼동했습니다\\. 원자성은 <b>한 트랜잭션의 변경이 전부 반영되거나 전혀 반영되지 않음</b>을 보장할 뿐, <b>같은 요청이 두 번 도착하는 것</b>은 막지 못합니다\\.');
  assert.equal(emphasized('**하나** **둘** **셋**'), '<b>하나</b> <b>둘</b> 셋');
  assert.equal(emphasized('닫히지 않은 **표시'), '닫히지 않은 표시');
  assert.equal(emphasized('빈 ****표시'), '빈 표시');
  // Model text cannot inject markup through a bold span, and plain text renders exactly as before.
  assert.equal(emphasized('**<script>@joe</script>**'), '<b>&lt;script&gt;@​joe&lt;/script&gt;</b>');
  assert.equal(emphasized('정의(definition)입니다.'), '정의\\(definition\\)입니다\\.');
  assert.doesNotMatch(emphasized(note), /color|style=|<span/);
});

test('clipping at any position never leaves a dangling or escaped marker', () => {
  for (let n = 1; n < note.length; n++) {
    const html = emphasized(note.slice(0, n) + '…'), { open, close } = tags(html);
    assert.equal(open, close, `unbalanced at ${n}`); assert.ok(open <= 2);
    assert.doesNotMatch(html, /\*/, `marker leaked at ${n}: ${html}`);
  }
});

test('answer sheets and key grades bold the key point in option notes', () => {
  const s = snapshot(), q = { ...initialQuestions()[0], key: { ...initialQuestions()[0].key, options: initialQuestions()[0].key.options.map(o => o.id === 'A' ? { ...o, explanation: note } : o) } };
  const reveal = renderReveal([{ q, label: '면접1' }], s, 'reveal');
  assert.match(reveal, /^ {2}> 원자성\\\(atomicity\\\)과 .*<b>한 트랜잭션의 변경이 전부 반영되거나 전혀 반영되지 않음<\/b>/m);
  const grade = renderGrade(q, s, { verdict: 'incorrect', explanation: `선택한 A: ${note}`, expectedAnswer: q.key.explanation, optionExplanations: q.key.options, evidence: [] }, 'grade', '면접1', 'A');
  assert.match(grade, /##### 답변 평가\n\n선택한 A: 원자성.*<b>같은 요청이 두 번 도착하는 것<\/b>/);
  assert.equal(tags(grade).open, 4); assert.doesNotMatch(grade, /\\\*\\\*/);
});
