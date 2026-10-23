import { z } from 'zod';
import type { Snapshot } from './contracts.js';
import type { Event } from './webhooks.js';

export const FailureSchema = z.strictObject({
  code: z.enum(['rate_limit', 'authentication', 'timeout', 'unavailable', 'invalid_output', 'unknown']),
  provider: z.enum(['claude', 'codex', 'gms']).optional(),
  apiStatus: z.int().min(400).max(599).optional(),
  retryAt: z.iso.datetime().optional(),
});
export type FailureInfo = z.infer<typeof FailureSchema>;
export const RunnerFailureSchema = z.strictObject({ error: z.literal('model_failure'), failure: FailureSchema });
export class ModelFailure extends Error {
  constructor(readonly failure: FailureInfo) { super(`${failure.provider ?? 'model'} ${failure.code}${failure.code === 'invalid_output' ? ': no structured output' : ''}${failure.apiStatus ? ` (API ${failure.apiStatus})` : ''}`); }
}
export function failureInfo(error: unknown, provider?: 'claude' | 'codex' | 'gms'): FailureInfo {
  if (error instanceof ModelFailure) return error.failure;
  const code = error instanceof z.ZodError || error instanceof SyntaxError ? 'invalid_output'
    : error instanceof Error && (/time budget/i.test(error.message) || error.name === 'TimeoutError') ? 'timeout' : 'unknown';
  return { code, ...(provider ? { provider } : {}) };
}
export function retryableFailure(failure: FailureInfo): boolean { return ['rate_limit', 'timeout', 'unavailable', 'unknown'].includes(failure.code); }
export function recoveryAttempts(event: Event, snapshot: Snapshot): number {
  // Older recovery jobs carried the snapshot in target; automatic merges keep it explicitly now.
  const prior = event.recoverySnapshot ?? event.target;
  return 'headSha' in prior && 'baseSha' in prior && 'startSha' in prior
    && prior.headSha === snapshot.headSha && prior.baseSha === snapshot.baseSha && prior.startSha === snapshot.startSha
    ? event.recoveryAttempt ?? 0 : 0;
}
export function scheduleFailure(failure: FailureInfo, now = Date.now()): FailureInfo {
  return retryableFailure(failure) ? { ...failure, retryAt: new Date(now + (failure.code === 'rate_limit' ? 15 : 5) * 60000).toISOString() } : failure;
}
export function failureMessage(failure: FailureInfo): string {
  const provider = failure.provider === 'gms' ? 'GMS' : failure.provider === 'claude' ? 'Claude' : failure.provider === 'codex' ? 'Codex' : '질문 생성 서비스';
  const messages: Record<FailureInfo['code'], string> = {
    rate_limit: `${provider} 사용량 제한${failure.apiStatus ? `(${failure.apiStatus})` : ''}으로 질문 생성을 잠시 멈췄습니다.`,
    authentication: `${provider} 인증을 확인할 수 없습니다. 봇 운영자가 로그인·키 설정을 확인해야 합니다.`,
    timeout: '질문 생성 제한 시간을 초과했습니다.',
    unavailable: `${provider}에 일시적으로 연결할 수 없습니다.`,
    invalid_output: '생성된 질문의 형식이 올바르지 않아 게시하지 못했습니다.',
    unknown: '질문 생성 중 오류가 발생했습니다. 봇 운영자가 오류 기록을 확인해야 합니다.',
  };
  const when = failure.retryAt ? ` 다음 자동 재시도: ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(failure.retryAt))} (한국 시간).` : '';
  return `${messages[failure.code]}${when} /hey tryagain 명령으로 다시 요청할 수도 있습니다.`;
}
