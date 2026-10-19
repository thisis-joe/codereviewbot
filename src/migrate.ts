import pg from 'pg';
import { Store } from './store.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try { await new Store(pool).migrate(); console.log('Migration complete'); } finally { await pool.end(); }
