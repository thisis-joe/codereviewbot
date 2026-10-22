import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const name = 'hey-test-' + randomBytes(5).toString('hex');
const run = (command,args,env=process.env) => new Promise((resolve,reject)=>{
  const p=spawn(command,args,{stdio:'inherit',env,shell:false});p.on('error',reject);p.on('close',code=>code===0?resolve():reject(new Error(`${command} failed (${code})`)));
});
try {
  await run('docker',['run','--detach','--name',name,'--publish','127.0.0.1::5432','--env','POSTGRES_PASSWORD=local-test-only','--env','POSTGRES_DB=hey_test','postgres:17-alpine']);
  let ready=false;
  for(let i=0;i<120;i++) { try { execFileSync('docker',['exec',name,'pg_isready','-U','postgres'],{stdio:'ignore'});ready=true;break; } catch {} await new Promise(r=>setTimeout(r,500)); }
  if(!ready) { try { execFileSync('docker',['logs','--tail=20',name],{stdio:'inherit'}); } catch {} throw new Error('Disposable PostgreSQL did not become ready within 60 seconds'); }
  const binding=execFileSync('docker',['port',name,'5432/tcp'],{encoding:'utf8'}).trim();
  const port=binding.match(/^127\.0\.0\.1:(\d+)$/)?.[1];if(!port)throw new Error('Unexpected test port');
  await run('npm',['run','test:integration'],{...process.env,TEST_DATABASE_URL:`postgres://postgres:local-test-only@127.0.0.1:${port}/hey_test`});
} finally { try { execFileSync('docker',['rm','--force',name],{stdio:'ignore'}); } catch {} }
