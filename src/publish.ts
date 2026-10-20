import type { Platform } from './platform.js';
import type { Report } from './contracts.js';
import { renderReport, renderFinding, renderQuestionThread, SUMMARY_MARKER, type AnswerResults } from './render.js';
import { hasChangeQuestions } from './contracts.js';
import { questionId } from './learning.js';
import type { DiffMetadata } from './review.js';
export class Superseded extends Error {}
export async function publish(platform: Platform, report: Report, diff: Record<string, DiffMetadata>, maxInline: number, fence: () => Promise<void>, results: AnswerResults = new Map()): Promise<void> {
  const current = async () => {
    await fence(); const live = await platform.snapshot(report.snapshot.number);
    if (live.headSha !== report.snapshot.headSha || live.baseSha !== report.snapshot.baseSha || live.startSha !== report.snapshot.startSha) throw new Superseded('Review snapshot changed');
  };
  await current();
  const comments = await platform.comments(report.snapshot.number);
  const existing = comments.find(c => platform.owned(c) && c.body.includes(SUMMARY_MARKER));
  const body = renderReport(report, results);
  if (body.length > 60000) throw new Error('Report exceeds platform comment budget');
  if (existing?.body !== body) { await current(); await platform.comment(report.snapshot.number, body, existing?.id); }
  const inline = await platform.inlineComments(report.snapshot.number);
  const eligible = report.findings.filter(f => (f.status === 'new' || f.status === 'open') && f.severity !== 'P3' && diff[f.path]).sort((a, b) => a.severity.localeCompare(b.severity) || a.id.localeCompare(b.id));
  let posted = 0;
  for (const f of eligible) {
    const marker = `<!-- codereviewbot:finding:v1:${f.id} -->`;
    if (inline.some(c => platform.owned(c) && c.body.includes(marker))) continue;
    if (posted >= maxInline) break;
    const body = renderFinding(f, report.snapshot); if (body.length > 60000) continue;
    await current();
    await platform.inline(report.snapshot, { path: f.path, oldPath: diff[f.path]!.oldPath, line: f.line, side: f.side, coordinates: diff[f.path]!.positions?.[f.side][f.line], body, suggestion: f.suggestion }); posted++;
  }
  if (!hasChangeQuestions(report)) return;
  // Each review question also gets its own thread on the changed line; questions outside a diff hunk stay in the summary only.
  for (const [i, q] of report.questions.entries()) {
    if (inline.some(c => platform.owned(c) && c.body.includes(`<!-- codereviewbot:question:${questionId(report.snapshot, q)} -->`))) continue;
    // LEFT-side questions carry the old path, while diff metadata is keyed by the new path.
    const entry = Object.entries(diff).find(([path, d]) => q.side === 'LEFT' ? d.oldPath === q.path : path === q.path);
    const coordinates = entry?.[1].positions?.[q.side]?.[q.line];
    if (!entry || !coordinates) continue;
    await current();
    await platform.inline(report.snapshot, { path: entry[0], oldPath: entry[1].oldPath, line: q.line, side: q.side, coordinates, body: renderQuestionThread(q, report.snapshot, i + 1), suggestion: null });
  }
}
