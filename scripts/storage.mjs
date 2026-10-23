import {execFileSync} from 'node:child_process';
import {statfs} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function imageRemovalPlan(images, usedIds, keepIds) {
  return images.filter(image => !usedIds.has(image.id) && !keepIds.has(image.id))
    .flatMap(image => image.tags.filter(tag => /^hey-(?:controller|runner):/.test(tag)));
}
async function main(args) {
  const keep = []; let apply = false, checkBuild = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true;
    else if (args[i] === '--check-build') checkBuild = true;
    else if (args[i] === '--keep-image' && args[i + 1]) keep.push(args[++i]);
    else throw new Error('Usage: node scripts/storage.mjs [--check-build] [--apply --keep-image PREVIOUS_IMAGE]');
  }
  if (apply && (!keep.length || checkBuild)) throw new Error('Image cleanup requires explicit rollback image(s), separately from the build check');
  const docker = values => execFileSync('docker', values, {encoding:'utf8'}).trim();
  if (docker(['context','show']) !== 'colima') throw new Error('This storage check targets the default colima Docker context');
  const vm = execFileSync('colima',['ssh','--','df','-Pk','/var/lib/docker'],{encoding:'utf8'}).trim().split('\n').at(-1).trim().split(/\s+/);
  const host = await statfs(process.cwd()), free = {vmBytes:Number(vm[3])*1024,hostBytes:host.bavail*host.bsize};
  if (checkBuild) {
    console.log(JSON.stringify({free,minimumFreeBytes:8*1024**3}));
    if (Math.min(free.vmBytes,free.hostBytes) < 8*1024**3) throw new Error('Build blocked: both host and Docker VM need at least 8 GiB free');
    return;
  }
  const containers = docker(['ps','-aq']).split('\n').filter(Boolean);
  const usedIds = new Set(containers.map(id => docker(['inspect','--format','{{.Image}}',id])));
  const keepIds = new Set(keep.map(tag => docker(['image','inspect','--format','{{.Id}}',tag])));
  const ids = [...new Set(docker(['image','ls','--filter','reference=hey-*','--format','{{.ID}}','--no-trunc']).split('\n').filter(Boolean))];
  const images = ids.map(id => ({id,tags:JSON.parse(docker(['image','inspect','--format','{{json .RepoTags}}',id])) ?? []}));
  const remove = imageRemovalPlan(images,usedIds,keepIds);
  console.log(JSON.stringify({free,apply,keep,remove}));
  // No force, volume removal, global prune, or credential inspection.
  if (apply && remove.length) docker(['image','rm',...remove]);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
