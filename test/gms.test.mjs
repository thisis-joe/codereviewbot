import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Gms } from '../dist/gms.js';
import { heyAnswer } from './fixtures.mjs';

test('GMS Responses performs snapshot tool calls then validates structured output', async t => {
 const root = await mkdtemp(join(tmpdir(), 'gms-')); t.after(() => rm(root, {recursive:true,force:true}));
 const id='11111111-1111-4111-8111-111111111111'; const source=join(root,'jobs',id,'source');
 await mkdir(source,{recursive:true}); await writeFile(join(source,'hello.ts'),'const hello = 42;');
 let calls=0;
 const server=createServer(async(req,res)=>{
  let raw=''; for await (const chunk of req) raw+=chunk;
  const body=JSON.parse(raw); assert.equal(req.headers.authorization,'Bearer test-key');
  assert.equal(body.store,false); assert.equal(body.model,'test-model');
  if (++calls===1) { assert.equal(body.tools.length,4); res.end(JSON.stringify({status:'completed',output:[{type:'function_call',name:'read_file',call_id:'c1',arguments:'{"path":"hello.ts"}'}]})); }
  else { assert.match(body.input.at(-1).output,/hello = 42/); res.end(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(heyAnswer())}]}]})); }
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); t.after(()=>server.close());
 const model=new Gms(root,`http://127.0.0.1:${server.address().port}/responses`,'test-key','test-model');
 assert.equal((await model.run('answer','inspect',id,5000)).answer,heyAnswer().answer); assert.equal(calls,2);
 await assert.rejects(()=>model.run('answer','inspect','../escape',5000));
});

test('GMS classifies HTTP errors, invalid output and timeout without leaking responses', async t => {
 const root=await mkdtemp(join(tmpdir(),'gms-errors-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const id='11111111-1111-4111-8111-111111111111';await mkdir(join(root,'jobs',id,'source'),{recursive:true});
 let status=401; let payload='secret gateway text'; let delay=0;
 const server=createServer((req,res)=>{req.resume();setTimeout(()=>{res.statusCode=status;res.end(payload);},delay);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const model=new Gms(root,`http://127.0.0.1:${server.address().port}`,'key','model');
 for(const [s,code] of [[401,'authentication'],[429,'rate_limit'],[503,'unavailable']]) {status=s;await assert.rejects(()=>model.run('answer','read',id,1000),e=>e.failure.code===code&&!e.message.includes('secret'));}
 status=200;payload=JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{}'}]}]});
 await assert.rejects(()=>model.run('answer','read',id,1000),e=>e.failure.code==='invalid_output');
 delay=100;await assert.rejects(()=>model.run('answer','read',id,10),e=>e.failure.code==='timeout');
});

test('GMS records every request and the run summary with its origin, without prompts', async t => {
 const root=await mkdtemp(join(tmpdir(),'gms-usage-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const id='11111111-1111-4111-8111-111111111111';await mkdir(join(root,'jobs',id,'source'),{recursive:true});
 let calls=0;
 const server=createServer((req,res)=>{req.resume();res.end(JSON.stringify({status:'completed',output:++calls===1?[{type:'function_call',name:'list_files',call_id:'c1',arguments:'{}'}]:[{type:'message',content:[{type:'output_text',text:'{}'}]}]}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const file=join(root,'usage','gms.jsonl'),saved={env:process.env.GMS_USAGE_ENV,log:process.env.GMS_USAGE_LOG};
 process.env.GMS_USAGE_LOG=file;delete process.env.GMS_USAGE_ENV;
 t.after(()=>{for(const [k,v] of [['GMS_USAGE_ENV',saved.env],['GMS_USAGE_LOG',saved.log]]) v===undefined?delete process.env[k]:process.env[k]=v;});
 const model=new Gms(root,`http://127.0.0.1:${server.address().port}`,'key','model');
 await assert.rejects(()=>model.run('answer','secret prompt text',id,5000),e=>e.failure.code==='invalid_output');
 const lines=(await readFile(file,'utf8')).trim().split('\n').map(l=>JSON.parse(l));
 assert.deepEqual(lines.map(l=>[l.event,l.round??null]),[['request',1],['request',2],['run',null]]);
 assert.ok(lines.every(l=>l.service==='gms-usage'&&l.origin==='development'&&l.phase==='answer'&&l.run===lines[0].run));
 assert.deepEqual({requests:lines[2].requests,toolCalls:lines[2].toolCalls,outcome:lines[2].outcome},{requests:2,toolCalls:1,outcome:'invalid_output'});
 assert.doesNotMatch(JSON.stringify(lines),/secret prompt/);
 process.env.GMS_USAGE_ENV='production';calls=0;
 await assert.rejects(()=>model.run('grade','x',id,5000));
 assert.equal(JSON.parse((await readFile(file,'utf8')).trim().split('\n').at(-1)).origin,'production');
});

// Fake GMS: `reply(body, n)` decides each response; requests are kept for inspection.
async function fakeGms(t, reply) {
 const root=await mkdtemp(join(tmpdir(),'gms-x-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const id='11111111-1111-4111-8111-111111111111',source=join(root,'jobs',id,'source');
 await mkdir(source,{recursive:true});await writeFile(join(source,'a.ts'),'const a = 1;');
 const bodies=[];
 const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);bodies.push(body);res.end(JSON.stringify({status:'completed',output:reply(body,bodies.length)}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 return {root,id,source,bodies,model:new Gms(root,`http://127.0.0.1:${server.address().port}`,'key','model')};
}
const toolCall=n=>[{type:'function_call',name:'list_files',call_id:'c'+n,arguments:'{}'}];
const answer=()=>[{type:'message',content:[{type:'output_text',text:JSON.stringify(heyAnswer())}]}];
function withEnv(t, values) {
 const saved=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));
 for (const [k,v] of Object.entries(values)) v===undefined?delete process.env[k]:process.env[k]=v;
 t.after(()=>{for (const [k,v] of Object.entries(saved)) v===undefined?delete process.env[k]:process.env[k]=v;});
}

test('GMS stops at 10 requests and refuses tools on the last one so the model answers instead of failing', async t => {
 const answering=await fakeGms(t,(body,n)=>body.tool_choice==='none'?answer():toolCall(n));
 assert.equal((await answering.model.run('answer','inspect',answering.id,5000)).answer,heyAnswer().answer);
 assert.equal(answering.bodies.length,10);
 assert.deepEqual(answering.bodies.map(b=>b.tool_choice??null),[...Array(9).fill(null),'none']);
 assert.ok(answering.bodies.every(b=>b.parallel_tool_calls===true&&/metered API request/.test(b.instructions)));
 const stubborn=await fakeGms(t,(_,n)=>toolCall(n));
 await assert.rejects(()=>stubborn.model.run('answer','inspect',stubborn.id,5000),e=>e.failure.code==='invalid_output');
 assert.equal(stubborn.bodies.length,10);
});

test('GMS reuses a cached development answer only for the same prompt and snapshot', async t => {
 const g=await fakeGms(t,(_,n)=>n%2?toolCall(n):answer());
 const cache=join(g.root,'cache'),log=join(g.root,'usage.jsonl');
 withEnv(t,{GMS_CACHE_DIR:cache,GMS_USAGE_LOG:log,GMS_USAGE_ENV:undefined,GMS_CACHE:undefined,GMS_DEV_DAILY_LIMIT:'0'});
 await g.model.run('answer','same prompt',g.id,5000); assert.equal(g.bodies.length,2);
 assert.equal((await g.model.run('answer','same prompt',g.id,5000)).answer,heyAnswer().answer); assert.equal(g.bodies.length,2);
 const last=JSON.parse((await readFile(log,'utf8')).trim().split('\n').at(-1));
 assert.deepEqual([last.event,last.requests,last.outcome],['run',0,'cache_hit']);
 await g.model.run('answer','other prompt',g.id,5000); assert.equal(g.bodies.length,4);
 await writeFile(join(g.source,'a.ts'),'const a = 2;');
 await g.model.run('answer','same prompt',g.id,5000); assert.equal(g.bodies.length,6);
 process.env.GMS_CACHE='refresh'; await g.model.run('answer','same prompt',g.id,5000); assert.equal(g.bodies.length,8);
 process.env.GMS_CACHE='off'; await g.model.run('answer','same prompt',g.id,5000); assert.equal(g.bodies.length,10);
 delete process.env.GMS_CACHE; process.env.GMS_USAGE_ENV='production';
 await g.model.run('answer','same prompt',g.id,5000); assert.equal(g.bodies.length,12);
});

test('development GMS calls stop at the daily request budget; production is not budgeted', async t => {
 const g=await fakeGms(t,()=>answer());
 const log=join(g.root,'usage.jsonl'),now=new Date().toISOString(),old='2020-01-01T00:00:00.000Z';
 await writeFile(log,[now,now,old].map(at=>JSON.stringify({service:'gms-usage',at,origin:'development',event:'request'})).join('\n')+'\n');
 withEnv(t,{GMS_USAGE_LOG:log,GMS_DEV_DAILY_LIMIT:'2',GMS_USAGE_ENV:undefined,GMS_CACHE:'off',GMS_CACHE_DIR:undefined});
 await assert.rejects(()=>g.model.run('answer','x',g.id,5000),/budget exhausted: 2\/2/); assert.equal(g.bodies.length,0);
 process.env.GMS_DEV_DAILY_LIMIT='3'; await g.model.run('answer','x',g.id,5000); assert.equal(g.bodies.length,1);
 process.env.GMS_DEV_DAILY_LIMIT='3'; await assert.rejects(()=>g.model.run('answer','x',g.id,5000),/budget exhausted: 3\/3/);
 process.env.GMS_USAGE_ENV='production'; await g.model.run('answer','x',g.id,5000); assert.equal(g.bodies.length,2);
});
