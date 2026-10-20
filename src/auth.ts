import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { RepositoryConfig } from './config.js';
import type { TokenSource } from './http-client.js';

export function credentials(repo: RepositoryConfig, env = process.env): TokenSource {
  let cached: { token: string; expires: number } | undefined;
  return async () => {
    if (repo.tokenEnv) {
      const token = env[repo.tokenEnv]; if (!token) throw new Error(`Missing credential: ${repo.tokenEnv}`); return token;
    }
    if (repo.platform !== 'github') throw new Error('GitLab tokenEnv must be configured');
    if (cached && cached.expires > Date.now() + 60000) return cached.token;
    const appId = env.GITHUB_APP_ID, installId = repo.installationId ?? env.GITHUB_INSTALLATION_ID, keyFile = env.GITHUB_APP_PRIVATE_KEY_FILE;
    if (!appId || !installId || !keyFile || !/^\d+$/.test(appId) || !/^\d+$/.test(installId)) throw new Error('GitHub App configuration unavailable');
    const now = Math.floor(Date.now() / 1000);
    const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat: now - 60, exp: now + 540, iss: appId })}`;
    const signer = createSign('RSA-SHA256'); signer.update(unsigned);
    const jwt = `${unsigned}.${signer.sign(await readFile(keyFile), 'base64url')}`;
    const res = await fetch(`${repo.instance}/app/installations/${installId}/access_tokens`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { authorization: `Bearer ${jwt}`, accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`GitHub App token request failed (${res.status})`);
    const data = await res.json() as { token: string; expires_at: string };
    cached = { token: data.token, expires: Date.parse(data.expires_at) };
    if (!cached.token || !Number.isFinite(cached.expires)) throw new Error('Invalid GitHub installation token response');
    return cached.token;
  };
}
