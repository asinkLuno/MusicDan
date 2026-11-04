import { execFileSync } from 'node:child_process';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { root, siteScreenshotFiles, screenshotInfo, validateManifest } from './site-assets.mjs';

if (process.argv.includes('--capture')) {
  execFileSync(process.execPath, [fileURLToPath(new URL('scripts/capture-release.mjs', root))], {
    cwd: fileURLToPath(root),
    stdio: 'inherit',
  });
  await validateManifest();
}
const directory = new URL('website/public/screenshots/', root);
await rm(directory, { recursive: true, force: true });
await mkdir(directory, { recursive: true });
for (const name of siteScreenshotFiles) {
  await screenshotInfo(name);
  await copyFile(new URL(`artifacts/previews/${name}`, root), new URL(name, directory));
}
