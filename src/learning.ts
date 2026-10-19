import { createHash } from 'node:crypto';
import type { ChangeQuestion, Snapshot } from './contracts.js';

export function sameRevision(a: Snapshot, b: Snapshot): boolean {
  return a.headSha === b.headSha && a.baseSha === b.baseSha && a.startSha === b.startSha;
}
export function questionId(s: Snapshot, q: ChangeQuestion): string {
  return 'Q-' + createHash('sha256').update(JSON.stringify([s.headSha, s.baseSha, s.startSha, q.question, q.path, q.line, q.side, q.options ?? []])).digest('hex').slice(0, 12);
}
