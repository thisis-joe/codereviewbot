import { commentKey } from './webhooks.js';
import type { Platform } from './platform.js';
import type { Report } from './contracts.js';
import { renderReport, renderQuestionThread, summaryMarker, type AnswerResults } from './render.js';
import { hasChangeQuestions } from './contracts.js';
import { questionId } from './learning.js';
import type { DiffMetadata } from './review.js';
export class Superseded extends Error {}
export async function publish(platform: Platform, report: Report, diff: Record<string, DiffMetadata>, maxInline: number, fence: () => Promise<void>, results: AnswerResults = new Map(), allowClosed = false, historicalComments: Set<string> = new Set()): Promise<void> {
  const current = async () => {
    await fence(); const live = await platform.snapshot(report.snapshot.number, allowClosed);
    if (live.headSha !== report.snapshot.headSha || live.baseSha !== report.snapshot.baseSha || live.startSha !== report.snapshot.startSha) throw new Superseded('Review snapshot changed');
  };
  await current();
  const comments = await platform.comments(report.snapshot.number);
  const existing = comments.find(c => platform.owned(c) && c.body.includes(summaryMarker(report.snapshot)));
  const body = renderReport(report, results);
  if (body.length > 60000) throw new Error('Report exceeds platform comment budget');
  if (existing?.body !== body) { await current(); await platform.comment(report.snapshot.number, body, existing?.id); }
  const inline = await platform.inlineComments(report.snapshot.number);
  if (!hasChangeQuestions(report)) return;
  // Each review question also gets its own thread on the changed line; questions outside a diff hunk stay in the summary only.
  for (const [i, q] of report.questions.entries()) {
    if (inline.some(c => (platform.owned(c) || historicalComments.has(commentKey(c))) && c.body.includes(`<!-- codereviewbot:question:${questionId(report.snapshot, q)} -->`))) continue;
    // LEFT-side questions carry the old path, while diff metadata is keyed by the new path.
    const entry = Object.entries(diff).find(([path, d]) => q.side === 'LEFT' ? d.oldPath === q.path : path === q.path);
    const coordinates = entry?.[1].positions?.[q.side]?.[q.line];
    if (!entry || !coordinates) continue;
    await current();
    await platform.inline(report.snapshot, { path: entry[0], oldPath: entry[1].oldPath, line: q.line, side: q.side, coordinates, body: renderQuestionThread(q, report.snapshot, i + 1), suggestion: null });
  }
}
