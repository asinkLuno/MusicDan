import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { root, validateManifest } from './site-assets.mjs';

execFileSync('yarn', ['--cwd', fileURLToPath(new URL('website/', root)), 'build'], { cwd: fileURLToPath(root), stdio: 'inherit' });
const manifest = await validateManifest();
manifest.files = {};
async function inventory(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) await inventory(path, relative + '/');
    else if (entry.isFile()) manifest.files[relative] = createHash('sha256').update(await readFile(path)).digest('hex');
    else throw new Error(`Unsupported site asset: ${relative}`);
  }
}
await inventory(new URL('website/dist/', root));
await writeFile(new URL('website/dist/site-manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
await mkdir(new URL('artifacts/releases/', root), { recursive: true });
const output = fileURLToPath(new URL(`artifacts/releases/MusicDan_${manifest.appVersion}_website.tar.gz`, root));
execFileSync('tar', ['-czf', output, '-C', fileURLToPath(new URL('website/dist/', root)), '.'], { stdio: 'inherit' });
console.log(`Packaged ${output}`);
