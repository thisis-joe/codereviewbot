import type { Platform } from './platform.js';
import type { Store } from './store.js';
import { reviewed, type Report } from './contracts.js';
import { renderReport } from './render.js';

// Existing branch protection rules require this exact status context.
export const GATE_CONTEXT = 'codereviewbot/questions';
export interface GateStatus { state: 'pending' | 'success'; description: string }

// A shortened report shows fewer questions, so only IDs visible in the published comment are required.
export function requiredQuestions(report: Report): string[] {
  return [...new Set([...renderReport(report).matchAll(/<!-- codereviewbot:question:(Q-[a-f0-9]{12}) -->/g)].map(m => m[1]!))];
}
export function answerGate(report: Report, answered: Set<string>): GateStatus | null {
  if (!report.requireAnswers) return null;
  if (!reviewed(report)) return { state: 'pending', description: '질문 생성에 실패했습니다. 도움말을 확인해 다시 요청하세요.' };
  const required = requiredQuestions(report);
  if (!required.length) return { state: 'success', description: '답할 변경 이해 질문이 없습니다.' };
  const done = required.filter(id => answered.has(id)).length;
  return done === required.length
    ? { state: 'success', description: `질문 ${required.length}개에 모두 답했습니다.` }
    : { state: 'pending', description: `질문 답변 ${done}/${required.length}` };
}
export async function syncAnswerGate(platform: Platform, store: Store, report: Report): Promise<void> {
  const gate = answerGate(report, report.requireAnswers ? await store.answeredQuestions(report.snapshot) : new Set());
  if (!gate) return;
  // Skipping unchanged statuses keeps status-triggered pipeline events from looping.
  const current = await platform.gateStatus(report.snapshot);
  if (current?.state === gate.state && current.description === gate.description) return;
  await platform.setGateStatus(report.snapshot, gate);
}
