import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { z } from 'zod';

const PolicySchema = z.strictObject({
  version: z.literal(1).default(1),
  pathInstructions: z.array(z.strictObject({ path: z.string().min(1).max(300), instructions: z.string().min(1).max(4000) })).max(50).default([]),
  exclude: z.array(z.string().min(1).max(300)).max(100).default([]),
  maxInlineComments: z.int().min(0).max(20).default(5),
});
export type Policy = z.infer<typeof PolicySchema>;
export function readPolicy(raw?: string): Policy { return PolicySchema.parse(raw ? parse(raw, { maxAliasCount: 0 }) : {}); }
export function policyVersion(policy: Policy, guidelines: string[], learnings: string[]): string {
  return createHash('sha256').update(JSON.stringify({ policy, guidelines, learnings })).digest('hex').slice(0, 16);
}
export function globMatch(pattern: string, path: string): boolean {
  const cache = new Map<string, boolean>();
  const match = (i: number, j: number): boolean => {
    const key = `${i}:${j}`; if (cache.has(key)) return cache.get(key)!;
    let result: boolean;
    if (i === pattern.length) result = j === path.length;
    else if (pattern[i] === '*' && pattern[i + 1] === '*') result = match(i + 2, j) || (pattern[i + 2] === '/' && match(i + 3, j)) || (j < path.length && match(i, j + 1));
    else if (pattern[i] === '*') result = match(i + 1, j) || (j < path.length && path[j] !== '/' && match(i, j + 1));
    else result = j < path.length && (pattern[i] === path[j] || (pattern[i] === '?' && path[j] !== '/')) && match(i + 1, j + 1);
    cache.set(key, result); return result;
  };
  return match(0, 0);
}
