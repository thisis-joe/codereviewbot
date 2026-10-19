import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
const [name,path] = process.argv.slice(2);
if(!['github-app.pem','tunnel.json'].includes(name) || !path)throw new Error('Usage: node scripts/install-secret.mjs github-app.pem|tunnel.json /path/to/file');
const bytes=await readFile(path);if(!bytes.length)throw new Error('Secret file is empty');
await mkdir('.local/secrets',{recursive:true,mode:0o700});await chmod('.local',0o700);await chmod('.local/secrets',0o700);
// Private parent directory protects the host copy; file-only read-only mounts support nonroot containers.
await writeFile(`.local/secrets/${name}`,bytes,{mode:0o444});await chmod(`.local/secrets/${name}`,0o444);
console.log('Secret installed in the private local directory. Contents not printed.');
