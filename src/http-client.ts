export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type TokenSource = () => Promise<string>;
export class ApiClient {
  constructor(readonly base: string, readonly platform: 'github' | 'gitlab', readonly token: TokenSource) {}
  async request(path: string, method = 'GET', body?: unknown, asText = false): Promise<any> {
    const url = new URL(`${this.base.replace(/\/$/, '')}${path}`);
    if (url.origin !== new URL(this.base).origin) throw new Error('Cross-origin API request refused');
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = await this.token();
      if (!token) throw new Error('Platform credential unavailable');
      const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { accept: 'application/json', 'content-type': 'application/json',
          ...(this.platform === 'github' ? { authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' } : { 'private-token': token }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      // Only reads retry automatically. Writes must reconcile their marker before retry.
      if (method === 'GET' && (response.status === 429 || response.status >= 500) && attempt < 2) {
        await response.body?.cancel();
        const retry = Number(response.headers.get('retry-after'));
        await new Promise(resolve => setTimeout(resolve, Math.min(30000, Number.isFinite(retry) && retry > 0 ? retry * 1000 : 250 * 2 ** attempt)));
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new HttpError(response.status, `Platform API ${method} failed (${response.status})`); }
      const reader = response.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
      if (reader) for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length; if (size > 12 * 1024 * 1024) { await reader.cancel(); throw new Error('API response exceeds limit'); }
        chunks.push(value);
      }
      const value = Buffer.concat(chunks).toString('utf8');
      return asText ? value : value ? JSON.parse(value) : null;
    }
    throw new Error('API retry exhausted');
  }
  async pages(path: string, maxPages = 30): Promise<any[]> {
    const result: any[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const value = await this.request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(value)) throw new Error('Expected paginated API array');
      result.push(...value); if (value.length < 100) return result;
    }
    throw new Error('API pagination exceeds limit; refusing incomplete state');
  }
}
