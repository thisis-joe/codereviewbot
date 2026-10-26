import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Gms } from '../dist/gms.js';
import { analysis } from './fixtures.mjs';

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
  else { assert.match(body.input.at(-1).output,/hello = 42/); res.end(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(analysis())}]}]})); }
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r)); t.after(()=>server.close());
 const model=new Gms(root,`http://127.0.0.1:${server.address().port}/responses`,'test-key','test-model');
 assert.equal((await model.run('review','inspect',id,5000)).summary,analysis().summary); assert.equal(calls,2);
 await assert.rejects(()=>model.run('review','inspect','../escape',5000));
});

test('GMS classifies HTTP errors, invalid output and timeout without leaking responses', async t => {
 const root=await mkdtemp(join(tmpdir(),'gms-errors-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const id='11111111-1111-4111-8111-111111111111';await mkdir(join(root,'jobs',id,'source'),{recursive:true});
 let status=401; let payload='secret gateway text'; let delay=0;
 const server=createServer((req,res)=>{req.resume();setTimeout(()=>{res.statusCode=status;res.end(payload);},delay);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const model=new Gms(root,`http://127.0.0.1:${server.address().port}`,'key','model');
 for(const [s,code] of [[401,'authentication'],[429,'rate_limit'],[503,'unavailable']]) {status=s;await assert.rejects(()=>model.run('review','read',id,1000),e=>e.failure.code===code&&!e.message.includes('secret'));}
 status=200;payload=JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{}'}]}]});
 await assert.rejects(()=>model.run('review','read',id,1000),e=>e.failure.code==='invalid_output');
 delay=100;await assert.rejects(()=>model.run('review','read',id,10),e=>e.failure.code==='timeout');
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
 await assert.rejects(()=>model.run('review','secret prompt text',id,5000),e=>e.failure.code==='invalid_output');
 const lines=(await readFile(file,'utf8')).trim().split('\n').map(l=>JSON.parse(l));
 assert.deepEqual(lines.map(l=>[l.event,l.round??null]),[['request',1],['request',2],['run',null]]);
 assert.ok(lines.every(l=>l.service==='gms-usage'&&l.origin==='development'&&l.phase==='review'&&l.run===lines[0].run));
 assert.deepEqual({requests:lines[2].requests,toolCalls:lines[2].toolCalls,outcome:lines[2].outcome},{requests:2,toolCalls:1,outcome:'invalid_output'});
 assert.doesNotMatch(JSON.stringify(lines),/secret prompt/);
 process.env.GMS_USAGE_ENV='production';calls=0;
 await assert.rejects(()=>model.run('grade','x',id,5000));
 assert.equal(JSON.parse((await readFile(file,'utf8')).trim().split('\n').at(-1)).origin,'production');
});
