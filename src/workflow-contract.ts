import { z } from 'zod';
import type { FailureInfo } from './model-failure.js';

export const WorkflowStepSchema = z.enum(['prepare', 'generate', 'validate', 'publish', 'gate', 'notify', 'command', 'complete']);
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export const WorkflowOwnerSchema = z.object({ owner: z.uuid() }).strict();
export const WorkflowStartSchema = WorkflowOwnerSchema.extend({ step: WorkflowStepSchema }).strict();
export interface WorkflowFailure { step: WorkflowStep; code: FailureInfo['code'] }
export interface WorkflowData { prepared?: string; generated?: string; completed?: WorkflowStep[]; failure?: WorkflowFailure }
export interface WorkflowView {
  available: true;
  jobId: string;
  owner: string;
  kind: 'review' | 'ci' | 'command';
  step: WorkflowStep;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'superseded' | 'retry';
  retryAt?: string;
  failure?: WorkflowFailure;
}
export class WorkflowConflict extends Error {}
