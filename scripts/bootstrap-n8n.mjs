import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
const env = parseEnv(await readFile('.env','utf8'));
if (!env.INTERNAL_TOKEN) throw new Error('Run setup first');
function docker(args, input) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', ['compose', ...args], { stdio: ['pipe','inherit','inherit'], shell: false });
    p.stdin.on('error',()=>{}); p.stdin.end(input); p.on('error',reject); p.on('close',code=>code===0?resolve():reject(new Error('n8n setup command failed')));
  });
}
const credentials = [{ id:'crbInternalAuth', name:'CodeReviewBot Internal', type:'httpHeaderAuth', data:{ name:'Authorization', value:`Bearer ${env.INTERNAL_TOKEN}` } }];
await docker(['exec','-T','n8n','node','-e',"process.stdin.pipe(require('node:fs').createWriteStream('/tmp/crb-credentials.json',{mode:0o600}))"],JSON.stringify(credentials));
await docker(['cp','n8n/workflows.json','n8n:/tmp/crb-workflows.json']);
try {
  await docker(['exec','-T','n8n','n8n','import:credentials','--input=/tmp/crb-credentials.json']);
  await docker(['exec','-T','n8n','n8n','import:workflow','--input=/tmp/crb-workflows.json']);
  for (const id of ['crbDispatch','crbRecovery']) await docker(['exec','-T','n8n','n8n','publish:workflow',`--id=${id}`]);
} finally { await docker(['exec','-T','n8n','node','-e',"require('node:fs').rmSync('/tmp/crb-credentials.json',{force:true})"]); }
await docker(['restart','n8n']);
console.log('Managed workflows imported and published. Credentials remain encrypted in n8n storage.');
