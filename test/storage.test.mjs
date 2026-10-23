import test from 'node:test';
import assert from 'node:assert/strict';
import {imageRemovalPlan} from '../scripts/storage.mjs';
test('image cleanup preserves every container reference, explicit rollback and foreign tags',()=>{
 const images=[{id:'running',tags:['hey-controller:current','hey-controller:alias']},{id:'stopped',tags:['hey-runner:old']},{id:'rollback',tags:['hey-controller:previous']},{id:'unused',tags:['hey-controller:obsolete','unrelated:keep']},{id:'foreign',tags:['other-project:latest']}];
 assert.deepEqual(imageRemovalPlan(images,new Set(['running','stopped']),new Set(['rollback'])),['hey-controller:obsolete']);
 assert.deepEqual(imageRemovalPlan(images,new Set(images.map(i=>i.id)),new Set()),[]);
});
