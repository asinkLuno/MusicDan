// 从 GitHub Releases 生成发布页与应用更新检查共用的 latest.json / releases.json。
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

const output = option('--output') ?? 'website/dist';
const tag = option('--tag');
const repo = process.env.GITHUB_REPOSITORY ?? 'asinkLuno/MusicDan';
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
if (!token) throw new Error('缺少 GH_TOKEN 或 GITHUB_TOKEN');

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'MusicDan-release-metadata',
};

async function github(pathname) {
  const response = await fetch(`https://api.github.com/repos/${repo}${pathname}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  return response.json();
}

async function checksum(release, asset) {
  if (typeof asset.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(asset.digest)) {
    return asset.digest.slice(7);
  }
  const file = release.assets.find((candidate) => candidate.name === `${asset.name}.sha256`);
  if (!file) throw new Error(`Release ${release.tag_name} 缺少 ${asset.name}.sha256`);
  const response = await fetch(file.browser_download_url, { headers });
  if (!response.ok) throw new Error(`无法下载校验文件 ${file.name}: ${response.status}`);
  const match = /^([a-f0-9]{64})\b/.exec(await response.text());
  if (!match) throw new Error(`校验文件格式无效：${file.name}`);
  return match[1];
}

const releases = await github('/releases?per_page=100');
const entries = [];
for (const release of releases) {
  if (release.draft || release.prerelease) continue;
  const asset = release.assets.find(
    (candidate) =>
      candidate.state === 'uploaded' && candidate.name.startsWith('MusicDan_') && candidate.name.endsWith('_arm64.apk'),
  );
  if (!asset) continue;
  const version = /^MusicDan_(.+)_arm64\.apk$/.exec(asset.name)?.[1];
  if (!version) continue;
  if (!asset.browser_download_url.startsWith('https://github.com/') || !asset.browser_download_url.endsWith('.apk')) {
    continue;
  }
  entries.push({
    version,
    name: asset.name,
    size: asset.size,
    sha256: await checksum(release, asset),
    download_url: asset.browser_download_url,
    notes: release.body ?? '',
    published_at: release.published_at,
  });
}
if (!entries.length) throw new Error('没有可用的 GitHub Release 安装包');
entries.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
const latest = tag ? entries.find((entry) => entry.download_url.includes(`/download/${tag}/`)) : entries[0];
if (!latest) throw new Error(`找不到标签 ${tag} 对应的安装包`);

await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`);
await writeFile(path.join(output, 'releases.json'), `${JSON.stringify(entries, null, 2)}\n`);
console.log(`Wrote ${entries.length} release(s) to ${output}; latest v${latest.version}`);
