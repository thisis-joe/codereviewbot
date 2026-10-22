import pg from 'pg';
import { readRepositories } from './config.js';
import { credentials } from './auth.js';
import { Platform } from './platform.js';
import { Store } from './store.js';
import { Workspaces } from './workspace.js';
import { HttpModel } from './codex.js';
import { Controller } from './controller.js';
import { application } from './application.js';
import { Mattermost } from './mattermost.js';

for (const name of ['INTERNAL_TOKEN', 'RUNNER_TOKEN']) if ((process.env[name]?.length ?? 0) < 32) throw new Error(`${name} must contain at least 32 characters`);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const repositories = await readRepositories(process.env.REPOSITORIES_FILE ?? 'config/repositories.yaml');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
const store = new Store(pool); await store.migrate();
const platforms = repositories.map(r => new Platform(r, credentials(r)));
const notifications = new Mattermost(store, platforms);
const controller = new Controller(store, platforms, new Workspaces(process.env.DATA_ROOT ?? '/data'), new HttpModel(process.env.RUNNER_URL ?? 'http://runner:8091', process.env.RUNNER_TOKEN!), notifications);
const server = application(controller, repositories);
server.listen(Number(process.env.PORT ?? 8092), process.env.HOST ?? '0.0.0.0', () => console.log('{"service":"controller","ready":true}'));
async function stop() { controller.stopping = true; server.close(); await controller.active; await notifications.active; await pool.end(); }
process.once('SIGTERM', () => void stop()); process.once('SIGINT', () => void stop());
