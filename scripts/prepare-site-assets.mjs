import { execFileSync } from 'node:child_process';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { root, screenshotFiles, screenshotInfo, validateManifest } from './site-assets.mjs';

if (process.argv.includes('--capture')) {
  execFileSync(process.execPath, [fileURLToPath(new URL('scripts/capture-release.mjs', root))], { cwd: fileURLToPath(root), stdio: 'inherit' });
  await validateManifest();
}
const directory = new URL('website/public/screenshots/', root);
await mkdir(directory, { recursive: true });
for (const name of screenshotFiles) {
  await screenshotInfo(name);
  await copyFile(new URL(`artifacts/previews/${name}`, root), new URL(name, directory));
}
