import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
export const root = new URL('../', import.meta.url);
export const screenshotFiles = [
  'app-danmaku.png', 'app-fullscreen.png', 'app-search.png',
  'november-rain-danmaku.png', 'november-rain-fullscreen.png', 'november-rain-search.png',
];
export const siteScreenshotFiles = ['app-danmaku.png', 'november-rain-danmaku.png', 'november-rain-search.png'];
export async function screenshotInfo(name) {
  const png = await readFile(new URL(`artifacts/previews/${name}`, root));
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error(`Invalid PNG: ${name}`);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  if (width !== 1080 || height !== 2340) throw new Error(`Invalid screenshot ratio: ${name}`);
  return { sha256: createHash('sha256').update(png).digest('hex'), width, height };
}
export async function validateManifest() {
  const manifest = JSON.parse(await readFile(new URL('artifacts/previews/screenshots.json', root), 'utf8'));
  const app = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  if (manifest.appVersion !== app.version || (process.env.GITHUB_SHA && manifest.sourceCommit !== process.env.GITHUB_SHA)) throw new Error('Screenshots were not captured for this release');
  for (const name of screenshotFiles) {
    const actual = await screenshotInfo(name);
    if (manifest.screenshots?.[name]?.sha256 !== actual.sha256) throw new Error(`Stale screenshot: ${name}`);
  }
  return manifest;
}
