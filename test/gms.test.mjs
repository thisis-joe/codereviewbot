import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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
