import { execFileSync } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { root, screenshotFiles, screenshotInfo } from './site-assets.mjs';

const cwd = fileURLToPath(root);
const output = new URL('artifacts/previews/screenshots.json', root);
await unlink(output).catch(error => { if (error.code !== 'ENOENT') throw error; });
const scenes = [
  { name: 'creep', prefix: 'app', position: 4000 },
  { name: 'november-rain', prefix: 'november-rain', position: 433000 },
];
for (const scene of scenes) {
  const preview = new URL(process.env.MUSICDAN_PREVIEW_URL || 'http://127.0.0.1:1420/');
  preview.searchParams.set('demo', scene.name);
  execFileSync(process.execPath, [fileURLToPath(new URL('scripts/capture-app.mjs', root)),
    `artifacts/previews/${scene.prefix}-danmaku.png`, `artifacts/previews/${scene.prefix}-search.png`, `artifacts/previews/${scene.prefix}-fullscreen.png`],
  { cwd, stdio: 'inherit', env: { ...process.env, MUSICDAN_PREVIEW_URL: preview.href, MUSICDAN_SCREENSHOT_POSITION: String(scene.position) } });
}
const app = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const screenshots = {};
for (const name of screenshotFiles) screenshots[name] = await screenshotInfo(name);
const manifest = {
  schemaVersion: 1, appVersion: app.version,
  sourceCommit: process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(),
  generatedAt: new Date().toISOString(), screen: { width: 1080, height: 2340 },
  scenes: scenes.map(({ name, position }) => ({ name, position })), screenshots,
};
await writeFile(output, JSON.stringify(manifest, null, 2) + '\n');
