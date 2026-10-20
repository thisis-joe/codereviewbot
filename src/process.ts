import { spawn } from 'node:child_process';

export interface ExecOptions { cwd?: string; env?: NodeJS.ProcessEnv; input?: string; timeoutMs?: number; maxBytes?: number; allowFailure?: boolean }
export async function execute(binary: string, args: string[], options: ExecOptions = {}): Promise<{ stdout: Buffer; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: options.cwd, env: options.env, shell: false, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = []; let size = 0, failure: Error | undefined;
    const stop = (reason: string) => { failure ??= new Error(reason); try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* already exited */ } };
    const timer = setTimeout(() => stop('Process time budget exceeded'), options.timeoutMs ?? 60000);
    const collect = (data: Buffer, keep: boolean) => { size += data.length; if (size > (options.maxBytes ?? 12 * 1024 * 1024)) stop('Process output limit exceeded'); else if (keep) chunks.push(data); };
    child.stdout.on('data', data => collect(data, true)); child.stderr.on('data', data => collect(data, false));
    child.stdin.on('error', () => {}); child.stdin.end(options.input);
    child.on('error', () => { clearTimeout(timer); reject(new Error('Executable unavailable')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0 && !options.allowFailure) reject(new Error(`Process failed (exit ${code ?? 'signal'})`));
      else resolve({ stdout: Buffer.concat(chunks), code: code ?? -1 });
    });
  });
}
