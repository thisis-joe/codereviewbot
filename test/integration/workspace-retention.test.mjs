import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {Store} from '../../dist/store.js';
import {snapshot} from '../fixtures.mjs';
if(!process.env.TEST_DATABASE_URL)throw Error('TEST_DATABASE_URL required');
test('workspace deletion shares the job-claim lock and protects durable pending jobs without changing history',async t=>{
 const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});t.after(()=>pool.end());
 const store=new Store(pool);await store.migrate();await pool.query('TRUNCATE deliveries,jobs,targets CASCADE');
 const id=await store.enqueue({kind:'review',target:snapshot(),deliveryId:'retention'});
 let enter,release;const entered=new Promise(r=>enter=r),resume=new Promise(r=>release=r);
 const cleaning=store.cleanupWorkspaces(async protectedIds=>{assert.equal(protectedIds.has(id),true);enter();await resume;});await entered;
 // PostgreSQL itself proves a concurrent claim cannot enter the critical section.
 const client=await pool.connect();try{await client.query('BEGIN');assert.equal((await client.query('SELECT pg_try_advisory_xact_lock(710632418) AS acquired')).rows[0].acquired,false);await client.query('ROLLBACK');}finally{client.release();release();await cleaning;}

 const job=await store.claim();assert.equal(job.id,id);await store.complete(id,job.owner);
 await store.cleanupWorkspaces(async protectedIds=>assert.equal(protectedIds.has(id),false));
 assert.equal((await store.getJob(id)).state,'completed');assert.ok(await store.getTarget(snapshot()));
});
