import test from 'node:test';import assert from 'node:assert/strict';import {normalize} from '../dist/webhooks.js';
const repo={platform:'github',instance:'https://api.github.com',repository:'joe/demo'};
const event=(body,gitlab=false)=>({repo:{...repo,platform:gitlab?'gitlab':'github'},event:gitlab?'Merge Request Hook':'pull_request',deliveryId:'merge',body});
test('only a completed merge automatically creates questions',()=>{
 for(const action of ['opened','reopened','synchronize','ready_for_review','edited'])assert.deepEqual(normalize(event({action,pull_request:{number:1,head:{sha:'b'.repeat(40)}}})),[]);
 const gh=normalize(event({action:'closed',pull_request:{number:1,merged:true,head:{sha:'b'.repeat(40)}}}))[0];assert.equal(gh.kind,'review');assert.equal(gh.merged,true);assert.equal(gh.regenerate,true);
 assert.equal(normalize(event({action:'closed',pull_request:{number:1,merged:false}}))[0].kind,'closed');
 for(const action of ['open','reopen','update'])assert.deepEqual(normalize(event({object_kind:'merge_request',object_attributes:{iid:1,action,oldrev:'a'}},true)),[]);
 const gl=normalize(event({object_kind:'merge_request',object_attributes:{iid:1,action:'merge',last_commit:{id:'b'.repeat(40)}}},true))[0];assert.equal(gl.kind,'review');assert.equal(gl.merged,true);assert.equal(gl.regenerate,true);
});

test('merged GitHub snapshots keep the pre-merge base even after the target advances',async()=>{
 const {Platform}=await import('../dist/platform.js');const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40),d='d'.repeat(40);
 const p=new Platform(repo,async()=> 'unused');const paths=[];
 p.api.request=async path=>{paths.push(path);if(path.endsWith('/pulls/1'))return{state:'closed',merged:true,merge_commit_sha:c,head:{sha:b},base:{sha:d},html_url:'https://github.com/joe/demo/pull/1'};if(path.endsWith('/commits/'+c))return{parents:[{sha:a},{sha:b}]};return{merge_base_commit:{sha:a}};};
 const snapshot=await p.snapshot(1,true);assert.equal(snapshot.startSha,a);assert.ok(paths.includes(`/repos/joe/demo/compare/${a}...${b}`));
});
