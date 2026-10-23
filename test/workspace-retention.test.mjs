import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,utimes,symlink,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Workspaces} from '../dist/workspace.js';

test('six-hour workspace retention removes expired source copies and preserves active jobs, young files and symlink targets',async t=>{
 const root=await mkdtemp(join(tmpdir(),'hey-retention-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const jobs=join(root,'jobs'),outside=join(root,'outside');await mkdir(jobs);await mkdir(outside);await writeFile(join(outside,'keep'),'untouched');
 const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
 for(const id of ids){await mkdir(join(jobs,id));await writeFile(join(jobs,id,'source'),'copy');}
 const old=new Date(Date.now()-7*3600000);for(const id of ids.slice(0,2))await utimes(join(jobs,id),old,old);
 await symlink(outside,join(jobs,'44444444-4444-4444-8444-444444444444'));
 await new Workspaces(root).cleanup(undefined,new Set([ids[1]]));
 await assert.rejects(access(join(jobs,ids[0])),{code:'ENOENT'});
 for(const path of [join(jobs,ids[1],'source'),join(jobs,ids[2],'source'),join(outside,'keep')])await access(path);
});
