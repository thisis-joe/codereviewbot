import { z } from 'zod';

export const categories = ['정확성', '보안', '신뢰성', '성능', '호환성', '테스트', '규칙'] as const;
export const checkNames = ['정확성·신뢰성', '보안', '성능', '호환성', '테스트', '팀 규칙·요구사항', 'CI·정적 검사'] as const;
export const Sha = z.string().regex(/^[a-f0-9]{40,64}$/);
export function safePath(path: string): boolean {
  return path.length > 0 && path.length <= 500 && !path.startsWith('/') && !path.includes('\\') &&
    !/[\x00-\x1f]/.test(path) && !path.split('/').some(p => p === '..' || p === '.' || p === '');
}
export const Path = z.string().refine(safePath, 'unsafe repository path');
const text = z.string().min(1).max(6000);
export const EvidenceSchema = z.strictObject({ path: Path, line: z.int().positive(), side: z.enum(['LEFT', 'RIGHT']).default('RIGHT'), reason: text });
export const SuggestionSchema = z.strictObject({ startLine: z.int().positive(), endLine: z.int().positive(), replacement: z.string().max(12000) });
export const CandidateSchema = z.strictObject({
  id: z.string().regex(/^C-\d+$/), existingId: z.string().regex(/^CRB-\d+$/).nullable(),
  severity: z.enum(['P0', 'P1', 'P2', 'P3']), category: z.enum(categories), path: Path,
  line: z.int().positive(), side: z.enum(['LEFT', 'RIGHT']).default('RIGHT'), symbol: text, title: z.string().min(1).max(160),
  problem: text, condition: text, impact: text, evidence: z.array(EvidenceSchema).min(1).max(12),
  fix: text, test: text, ruleId: z.string().max(120).nullable(), suggestion: SuggestionSchema.nullable(),
});
export const CheckSchema = z.strictObject({
  name: z.string().min(1).max(160),
  status: z.enum(['clear', 'found', 'not_run', 'pending', 'unavailable', 'not_applicable', 'passed', 'failed']),
  detail: z.string().max(6000), url: z.string().url().nullable(),
});
export const FlowSchema = z.strictObject({
  nodes: z.array(z.strictObject({ id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,19}$/), label: z.string().min(1).max(120) })).max(15),
  edges: z.array(z.strictObject({ from: z.string(), to: z.string(), label: z.string().max(120) })).max(30),
});
export const AnalysisSchema = z.strictObject({
  summary: text,
  changes: z.array(z.strictObject({ name: text, files: z.array(Path).max(300), description: text, impact: text })).max(100),
  findings: z.array(CandidateSchema).max(40), checks: z.array(CheckSchema).max(30),
  recommendedTests: z.array(text).max(30), limitations: z.array(text).max(30), flow: FlowSchema.nullable(),
  resolutions: z.array(z.strictObject({ id: z.string().regex(/^CRB-\d+$/), status: z.enum(['fixed', 'unverified']), reason: text })).max(100),
});
// The wire schema must remain representable as JSON Schema; enforce path constraints again at the boundary.
export const analysisJsonSchema = z.toJSONSchema(AnalysisSchema, { unrepresentable: 'any' });
export const VerificationSchema = z.strictObject({
  decisions: z.array(z.strictObject({ id: z.string().regex(/^C-\d+$/), decision: z.enum(['confirmed', 'rejected', 'unverifiable']), reason: text })).max(40),
  resolutions: z.array(z.strictObject({ id: z.string().regex(/^CRB-\d+$/), status: z.enum(['fixed', 'unverified']), reason: text })).max(100),
});
export const AnswerSchema = z.strictObject({ answer: text, evidence: z.array(text).max(12), next: text });
export type Candidate = z.infer<typeof CandidateSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Check = z.infer<typeof CheckSchema>;
export type Flow = z.infer<typeof FlowSchema>;
export type FindingStatus = 'new' | 'open' | 'fixed' | 'dismissed' | 'unverified';
export type Finding = Omit<Candidate, 'id'> & { id: string; status: FindingStatus; fingerprint?: string; oldPath?: string; observedHeadSha?: string; observedBaseSha?: string };
export interface Target { platform: 'github' | 'gitlab'; instance: string; repository: string; number: number }
export interface Snapshot extends Target {
  baseSha: string; headSha: string; startSha: string; previousSha: string | null;
  policyVersion: string; title: string; description: string; webUrl: string;
}
export interface Report extends Omit<Analysis, 'findings' | 'resolutions'> {
  schemaVersion: '1'; snapshot: Snapshot; state: 'running' | 'completed' | 'partial' | 'failed' | 'paused';
  mode: 'full' | 'incremental'; findings: Finding[]; reviewedFiles: string[]; excludedFiles: string[];
  rules: string[]; delta: Record<'added' | 'retained' | 'fixed' | 'dismissed' | 'unverified', string[]>;
}
export function emptyReport(snapshot: Snapshot, state: Report['state'], detail: string): Report {
  return { schemaVersion: '1', snapshot, state, mode: 'full', summary: detail, changes: [], findings: [],
    checks: [], recommendedTests: [], limitations: [detail], flow: null, reviewedFiles: [], excludedFiles: [], rules: [],
    delta: { added: [], retained: [], fixed: [], dismissed: [], unverified: [] } };
}
