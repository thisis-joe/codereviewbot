import type { ChangeQuestion, Snapshot } from './contracts.js';
import type { RemoteComment } from './platform.js';
import type { Comment } from './webhooks.js';
import { commentKey } from './webhooks.js';
import { questionId } from './learning.js';
import { summaryMarker, questionRevisionMarker } from './render.js';

/** Scope comes only from a trusted published question comment, never from command arguments or quoted user text. */
export function threadQuestions(comment: Comment, published: RemoteComment[], snapshot: Snapshot, questions: ChangeQuestion[]): { items: { q: ChangeQuestion; label: string }[] } | { error: string } {
  const guide = '해설을 볼 질문 댓글의 답글로 /hey showanswer를 남겨 주세요. GitHub에서는 코드에 달린 질문 스레드를 사용하세요.';
  if (!comment.parentId && !comment.discussionId) return { error: guide };
  const seen = new Set<string>();
  const roots = published.filter(c => c.surface === comment.surface
    && (comment.discussionId ? c.discussionId === comment.discussionId : c.id === comment.parentId || c.parentId === comment.parentId)
    && !seen.has(commentKey(c)) && seen.add(commentKey(c))
    && /<!-- codereviewbot:question:Q-[a-f0-9]{12} -->\n#### (?:Q|심화|면접)\d+\./.test(c.body)
    && !/^### /m.test(c.body));
  if (!roots.length) return { error: guide };
  if (roots.length !== 1) return { error: '이 스레드에는 여러 질문 묶음이 섞여 있어 해설 범위를 정할 수 없습니다. /hey whatelse로 별도 질문 스레드를 만들거나 /hey tryagain으로 최초 질문을 다시 요청하세요.' };
  const body = roots[0]!.body;
  if (/<!-- codereviewbot:(?:question-)?revision:/.test(body) && !body.includes(summaryMarker(snapshot)) && !body.includes(questionRevisionMarker(snapshot))) return { error: '이전 코드 버전의 질문입니다. 최신 질문 댓글의 답글로 /hey showanswer를 남겨 주세요.' };
  const available = new Map(questions.map(q => [questionId(snapshot, q), q]));
  const refs = [...body.matchAll(/<!-- codereviewbot:question:(Q-[a-f0-9]{12}) -->\n#### ((?:Q|심화|면접)\d+)\./g)];
  if (!refs.length || refs.some(m => !available.has(m[1]!))) return { error: '이전 코드 버전이거나 저장된 질문을 확인할 수 없습니다. 최신 질문 댓글에서 다시 요청하세요.' };
  return { items: refs.map(m => ({ q: available.get(m[1]!)!, label: m[2]! })) };
}
