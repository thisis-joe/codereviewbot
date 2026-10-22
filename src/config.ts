import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';

export const RepositorySchema = z.strictObject({
  platform: z.enum(['github', 'gitlab']), instance: z.string().url(),
  repository: z.string().regex(/^[\w.-]+(?:\/[\w.-]+)+$/), botLogin: z.string().min(1).max(100),
  webhookSecretEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  webhookAuth: z.enum(['hmac', 'signing', 'secret']),
  tokenEnv: z.string().default(''), installationId: z.string().regex(/^\d+$/).optional(),
  enabled: z.boolean().default(true),
  mattermostWebhookEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/).optional(),
  mattermostChannel: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/).optional(),
});
export type RepositoryConfig = z.infer<typeof RepositorySchema>;
export const RepositoriesSchema = z.strictObject({ version: z.literal(1), repositories: z.array(RepositorySchema).max(100) });
export async function readRepositories(path: string): Promise<RepositoryConfig[]> {
  const data = RepositoriesSchema.parse(parse(await readFile(path, 'utf8')));
  const seen = new Set<string>();
  for (const r of data.repositories) {
    const url = new URL(r.instance);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Repository instance must be a trusted HTTPS base URL');
    r.instance = r.instance.replace(/\/$/, '');
    if ((r.platform === 'github') !== (r.webhookAuth === 'hmac')) throw new Error('Webhook authentication mode does not match platform');
    const key = `${r.platform}:${r.instance}:${r.repository}`;
    if (seen.has(key)) throw new Error('Duplicate repository configuration');
    seen.add(key);
  }
  return data.repositories.filter(r => r.enabled);
}
