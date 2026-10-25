import { mkdir, open, rename, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { serialize, deserialize } from 'node:v8';
import { z } from 'zod';
import { failureInfo } from './model-failure.js';
import type { Controller, FailureContext, PreparedReview, GeneratedReview } from './controller.js';
import type { Job } from './store.js';
import { WorkflowConflict, type WorkflowView, type WorkflowStep } from './workflow-contract.js';

/** Source text stays on the existing protected snapshot volume, outside n8n execution data. */
class Artifacts {
  constructor(readonly root: string) {}
  private async directory(id: string): Promise<string> {
    z.uuid().parse(id);
    const jobs = join(this.root, 'jobs'); await mkdir(jobs, { recursive: true, mode: 0o700 });
    const root = await realpath(jobs), directory = join(root, id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const actual = await realpath(directory);
    if (!actual.startsWith(root + sep)) throw new Error('Workflow artifact escaped snapshot root');
    return actual;
  }
  async write(id: string, value: PreparedReview | GeneratedReview): Promise<string> {
    const directory = await this.directory(id), key = randomUUID(), target = join(directory, `flow-${key}.bin`);
    const temporary = target + '.tmp';
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await file.writeFile(serialize(value)); await file.sync(); } finally { await file.close(); }
    await rename(temporary, target);
    return key;
  }
  async read<T extends PreparedReview | GeneratedReview>(id: string, key: string | undefined): Promise<T> {
    z.uuid().parse(key);
    const file = await open(join(await this.directory(id), `flow-${key}.bin`), constants.O_RDONLY | constants.O_NOFOLLOW);
    try { return deserialize(await file.readFile()) as T; } finally { await file.close(); }
  }
}

/** n8n chooses the next phase; this boundary executes only that phase and checkpoints it. */
export class Workflow {
  private readonly artifacts: Artifacts;
  constructor(readonly controller: Controller, root: string) { this.artifacts = new Artifacts(root); }
  async claim(): Promise<WorkflowView | { available: false }> {
    if (this.controller.stopping) return { available: false };
    const job = await this.controller.store.claim(true);
    return job ? this.controller.store.workflowView(job.id, job.owner) : { available: false };
  }
  async status(id: string, owner: string): Promise<WorkflowView> {
    const view = await this.controller.store.workflowView(id, owner);
    if (view.status === 'pending' || view.status === 'running') {
      try {
        if (view.status === 'pending') await this.controller.store.heartbeat(id, owner);
        else await this.controller.store.assertLease(id, owner);
      }
      catch {
        const current = await this.controller.store.workflowView(id, owner);
        if (current.status === 'pending' || current.status === 'running') throw new WorkflowConflict('Workflow lease expired');
        return current;
      }
    }
    return view;
  }
  async start(id: string, owner: string, step: WorkflowStep): Promise<WorkflowView> {
    const { controller } = this;
    if (controller.stopping) throw new WorkflowConflict('Controller is stopping');
    const started = await controller.store.beginWorkflowStep(id, owner, step);
    if (started) {
      const job = (await controller.store.getJob(id))!;
      if (job.owner !== owner) throw new WorkflowConflict('Workflow ownership changed');
      const active = this.execute(job, step).catch(() => {
        console.error(JSON.stringify({ jobId: id, step, error: 'workflow_failure_handler' }));
      }).finally(() => { if (controller.active === active) controller.active = null; });
      controller.active = active;
    }
    return controller.store.workflowView(id, owner);
  }
  private async execute(job: Job, step: WorkflowStep): Promise<void> {
    const c = this.controller, store = c.store, context: FailureContext = {};
    const heartbeat = setInterval(() => { void store.heartbeat(job.id, job.owner).catch(() => {}); }, 15000);
    const advance = (next: WorkflowStep, data = {}) => store.advanceWorkflow(job.id, job.owner, step, next, data);
    try {
      await store.assertLease(job.id, job.owner);
      if ((step === 'generate' || step === 'validate') && job.workflow_data?.prepared) {
        const prepared = await this.artifacts.read<PreparedReview>(job.id, job.workflow_data.prepared);
        Object.assign(context, { snap: prepared.snap, previous: prepared.previous, requireAnswers: prepared.requireAnswers });
      }
      switch (step) {
        case 'prepare': {
          const prepared = await c.prepareReview(job, context);
          const key = await this.artifacts.write(job.id, prepared);
          if (prepared.cached) {
            const generated = await this.artifacts.write(job.id, await c.generateReview(job, prepared));
            await advance('validate', { prepared: key, generated });
          } else await advance('generate', { prepared: key });
          break;
        }
        case 'generate': {
          const prepared = await this.artifacts.read<PreparedReview>(job.id, job.workflow_data?.prepared);
          const generated = await this.artifacts.write(job.id, await c.generateReview(job, prepared));
          await advance('validate', { generated }); break;
        }
        case 'validate': {
          const generated = await this.artifacts.read<GeneratedReview>(job.id, job.workflow_data?.generated);
          await c.validateReview(job, generated.report.snapshot);
          await store.saveResult(job.id, job.owner, generated.report, generated.diff, 0, generated.reviewSeconds, true); break;
        }
        case 'publish': if (await c.publishReview(job)) await advance('gate'); break;
        case 'gate': await c.synchronizeReview(job); await advance('notify'); break;
        case 'notify': await c.notifyReview(job); await advance('complete'); break;
        case 'command': await c.command(job, c.platform(job.body.target), () => store.assertLease(job.id, job.owner)); await advance('complete'); break;
        case 'complete':
          if (job.kind === 'command') await c.finishCommand(job);
          else await store.complete(job.id, job.owner);
          break;
      }
      console.info(JSON.stringify({ jobId: job.id, step, event: 'workflow_step_completed' }));
    } catch (error) {
      await store.recordWorkflowFailure(job.id, job.owner, { step, code: failureInfo(error).code }).catch(() => {});
      await c.handleFailure(job, error, context, true);
    } finally { clearInterval(heartbeat); }
  }
}
