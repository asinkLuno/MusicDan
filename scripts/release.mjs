// 本地测试、签名构建，直接发布官网与 APK；不调用 GitHub API 或推送 Git 标签。
// yarn release：从 main 显式完整发布；--site-only：仅重建官网。
// 服务器 releases.json 是构建编号和已发布版本的唯一来源。

import { nextBuildNumber, releaseHistory, publishCommand, pruneCommand } from './release-state.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import net from 'node:net';
import { globSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const ECS_INSTANCE = process.env.MUSICDAN_ECS_INSTANCE;
const ECS_BASE = '/srv/musicdan';
const MACMINI_STAGE = `/tmp/musicdan-deploy-${process.pid}-${Date.now()}`;
const WEBSITE = 'https://musicdan.syncmoon.ink';
const ANDROID_BUILD_TOOLS = '37.0.0';
const ANDROID_PROJECT = path.join(root, 'src-tauri/gen/android');

const args = process.argv.slice(2);
if (args.includes('--pushed-sha')) throw new Error('推送触发发布已移除；请在 main 分支运行 yarn release');
if (args.includes('--sync-server-only')) throw new Error('--sync-server-only 已移除；请运行 yarn release，已发布版本会自动校验并跳过');
const siteOnly = args.includes('--site-only');

function run(command, cliArgs, options = {}) {
  return execFileSync(command, cliArgs, { cwd: root, encoding: 'utf8', ...options });
}

const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
const apkName = `MusicDan_${version}_arm64.apk`;

/** 远程命令：ssh macmini workbench exec（命令整体加引号传递，避免 macmini shell 拆散分号） */
function ecs(command) {
  const quoted = `'${command.replaceAll("'", `'\\''`)}'`;
  const raw = run('ssh', ['macmini',
    `/usr/local/bin/workbench exec --instance-id ${ECS_INSTANCE} --command ${quoted} --output json`]);
  const result = JSON.parse(raw);
  if (result.exit_code !== 0) {
    throw new Error(`远程命令失败（exit ${result.exit_code}）：${command}\n${result.stdout}${result.stderr}`);
  }
  if (result.stdout.trim()) console.log(result.stdout.trim());
  return result.stdout;
}

/** 文件上传：先 scp 到 macmini 暂存，再经 workbench upload（OSS 中转）落到 ECS 目录，随后在 ECS 上 mv 到最终路径 */
function upload(localFile, ecsDir) {
  run('ssh', ['macmini', `mkdir -p ${MACMINI_STAGE}`]);
  run('scp', ['-q', localFile, `macmini:${MACMINI_STAGE}/${path.basename(localFile)}`]);
  run('ssh', ['macmini', '/usr/local/bin/workbench', 'upload', '-f',
    `${MACMINI_STAGE}/${path.basename(localFile)}`, `${ecsDir.replace(/\/$/, '')}/`, '--instance-id', ECS_INSTANCE]);
}

async function sha256File(file) {
  const hash = createHash('sha256');
  hash.update(await readFile(file));
  return hash.digest('hex');
}

function freePort(preferred) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(preferred, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', error => reject(new Error(`端口 ${preferred} 不可用：${error.message}`)));
  });
}

const siteBundle = path.join(root, 'artifacts', 'releases', `MusicDan_${version}_website.tar.gz`);

/** 本地重建截图并打包官网（website 的 prebuild 负责截图捕获） */
async function buildSiteBundle() {
  console.log(`[site] 重建截图与官网（v${version}）`);
  const previewPort = await freePort(1420);
  const chromePort = await freePort(9229);
  const chromeProfile = await mkdtemp(path.join(tmpdir(), 'musicdan-chrome-'));
  const preview = spawn('yarn', ['dev', '--port', String(previewPort)], { cwd: root, stdio: 'ignore', detached: true });
  const chrome = spawn('google-chrome-stable', ['--headless', '--disable-gpu', '--no-sandbox', '--no-first-run',
    `--remote-debugging-port=${chromePort}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${chromeProfile}`], { stdio: 'ignore', detached: true });
  try {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const ready = await Promise.all([
        fetch(`http://127.0.0.1:${previewPort}/`).then(response => response.ok).catch(() => false),
        fetch(`http://127.0.0.1:${chromePort}/json/version`).then(response => response.ok).catch(() => false),
      ]);
      if (ready.every(Boolean)) break;
      if (Date.now() > deadline) throw new Error('预览服务或 Chrome 调试端口未就绪');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    run('yarn', ['build:release-site'], {
      env: { ...process.env, MUSICDAN_PREVIEW_URL: `http://127.0.0.1:${previewPort}/`, CHROME_DEBUG_URL: `http://127.0.0.1:${chromePort}` },
      stdio: 'inherit',
    });
  } finally {
    for (const child of [preview, chrome]) { try { process.kill(-child.pid); } catch { /* already gone */ } }
    await rm(chromeProfile, { recursive: true, force: true }).catch(() => {});
  }
}

/** 上传官网包并原子切换 /srv/musicdan/site 符号链接；旧目录保留用于回滚 */
async function deploySite() {
  const siteDir = `site-${version}-${Date.now()}-${process.pid}`;
  console.log(`[site] 上传并解压到 ${ECS_BASE}/${siteDir}`);
  await upload(siteBundle, '/tmp/');
  ecs(`set -e; cd ${ECS_BASE}; mkdir ${siteDir}; mv /tmp/${path.basename(siteBundle)} ${siteDir}.tar.gz; tar -xzf ${siteDir}.tar.gz -C ${siteDir}; rm ${siteDir}.tar.gz; chown -R musicdan:musicdan ${siteDir}; chmod 755 ${siteDir}`);
  ecs(`set -e; cd ${ECS_BASE}; ln -s ${siteDir} .site-next-$$; mv -Tf .site-next-$$ site`);
  console.log(`[site] 官网已切换到 ${siteDir}`);
}

/** 前端与插件测试（CI 原有步骤的本地等价） */
function runTests() {
  console.log('[test] yarn test');
  run('yarn', ['test'], { stdio: 'inherit' });
  console.log('[test] yarn test:release');
  run('yarn', ['test:release'], { stdio: 'inherit' });
  console.log('[test] yarn test:fixtures');
  run('yarn', ['test:fixtures'], { stdio: 'inherit' });
  console.log('[test] Kotlin 插件单元测试');
  run('./gradlew', [':tauri-plugin-media:testDebugUnitTest'], {
    cwd: ANDROID_PROJECT,
    env: { ...process.env, ANDROID_HOME: process.env.ANDROID_HOME || `${process.env.HOME}/Android/Sdk` },
    stdio: 'inherit',
  });
}

function buildTool(name) {
  return path.join(process.env.ANDROID_HOME || `${process.env.HOME}/Android/Sdk`, 'build-tools', ANDROID_BUILD_TOOLS, name);
}

/** 本地构建签名 APK，并做与 CI 相同的签名与元数据校验；返回规范命名的 APK 路径 */
async function buildApk(buildNumber) {
  const propertiesPath = path.join(ANDROID_PROJECT, 'keystore.properties');
  const config = Object.fromEntries((await readFile(propertiesPath, 'utf8')).trim().split('\n').map(line => {
    const key = line.slice(0, line.indexOf('='));
    return [key, line.slice(key.length + 1)];
  }));
  const storeFile = config.storeFile?.replace(/^~/, process.env.HOME ?? '');
  if (!storeFile || await stat(storeFile).then(() => false).catch(() => true)) {
    throw new Error(`签名配置不可用：${storeFile || propertiesPath} 不存在。请恢复 android-signing/musicdan.keystore 并重跑 scripts/android-signing-properties.py`);
  }
  let ndkHome = process.env.NDK_HOME || process.env.ANDROID_NDK_HOME || '';
  if (!ndkHome) {
    const ndkRoot = path.join(process.env.ANDROID_HOME || `${process.env.HOME}/Android/Sdk`, 'ndk');
    const candidates = globSync('*/', { cwd: ndkRoot }).sort();
    if (!candidates.length) throw new Error('未找到 Android NDK：请安装或设置 NDK_HOME');
    ndkHome = path.join(ndkRoot, candidates.at(-1));
  }
  console.log(`[apk] 本地构建 build-${buildNumber}（versionCode ${1_000_000_000 + buildNumber}，NDK ${path.basename(ndkHome)}）`);
  run('yarn', ['tauri', 'android', 'build', '--apk', '--split-per-abi', '--target', 'aarch64'], {
    env: { ...process.env, MUSICDAN_BUILD_NUMBER: String(buildNumber), NDK_HOME: ndkHome },
    stdio: 'inherit',
  });
  const built = globSync('app/build/outputs/apk/**/release/*.apk', { cwd: ANDROID_PROJECT })
    .map(relative => path.join(ANDROID_PROJECT, relative));
  if (!built.length) throw new Error('构建完成但未找到 release APK');
  const expectedVersionCode = `versionCode='${1_000_000_000 + buildNumber}'`;
  for (const apk of built) {
    run(buildTool('apksigner'), ['verify', apk]);
    const badging = run(buildTool('aapt'), ['dump', 'badging', apk]);
    if (!badging.includes(`package: name='ink.starmountain.musicdan' ${expectedVersionCode}`)) {
      throw new Error(`${path.basename(apk)} 的 versionCode 不符（期望 ${expectedVersionCode}）`);
    }
    if (!badging.includes("native-code: 'arm64-v8a'")) throw new Error(`${path.basename(apk)} 未包含 arm64-v8a`);
  }
  const arm64 = built.find(apk => path.basename(apk).includes('arm64'));
  if (!arm64) throw new Error('未找到 arm64 APK');
  // gradle 产物名是 app-arm64-release.apk，统一改为发布命名
  const work = await mkdtemp(path.join(tmpdir(), 'musicdan-apk-'));
  const canonical = path.join(work, apkName);
  await rm(canonical, { force: true });
  run('cp', [arm64, canonical]);
  console.log(`[apk] 签名校验通过：${apkName}`);
  return canonical;
}

/** 发布记录必须从服务器读取；网络错误不得当成空历史继续发布。 */
function readServerState() {
  return JSON.parse(ecs(`cat ${ECS_BASE}/public/releases.json`));
}

/** 先上传所有文件、核对摘要，最后切换公开下载与元数据。 */
async function publishServer(apk, buildNumber, sha, previous) {
  const sha256 = await sha256File(apk);
  const siteSha256 = await sha256File(siteBundle);
  const notes = (await readFile(path.join(root, 'release-notes.md'), 'utf8')).trim();
  if (!notes.includes(`v${version} 更新内容`)) throw new Error('release-notes.md 与当前版本不符');
  const entry = {
    version, build_number: buildNumber, version_code: 1_000_000_000 + buildNumber,
    source_commit: sha, name: apkName, size: (await stat(apk)).size, sha256,
    download_url: '/releases/latest.apk',
    release_url: `/releases/build-${buildNumber}/release-notes.md`,
    notes, published_at: new Date().toISOString(),
  };
  const work = await mkdtemp(path.join(tmpdir(), 'musicdan-publish-'));
  const stage = `${ECS_BASE}/.stage-${buildNumber}-${sha.slice(0, 12)}-${Date.now()}`;
  try {
    await writeFile(path.join(work, `${apkName}.sha256`), `${sha256}  ${apkName}\n`);
    await writeFile(path.join(work, 'release.json'), JSON.stringify(entry, null, 2) + '\n');
    await writeFile(path.join(work, 'releases.json'), JSON.stringify(releaseHistory(entry, previous), null, 2) + '\n');
    await writeFile(path.join(work, 'release-notes.md'), notes + '\n');
    ecs(`mkdir -p ${stage}`);
    for (const file of [apk, siteBundle, ...['release.json', 'releases.json', 'release-notes.md', `${apkName}.sha256`].map(name => path.join(work, name))]) {
      console.log(`[server] 上传 ${path.basename(file)}`);
      upload(file, stage);
    }
    const expectedState = createHash('sha256').update(JSON.stringify(previous)).digest('hex');
    // flock prevents simultaneous publishers; compare the original records again before committing.
    // Published metadata, APK and website share one atomic public/latest symlink switch.
    ecs(publishCommand({ base: ECS_BASE, stage, buildNumber, sha256, siteSha256,
      apkName, siteBundleName: path.basename(siteBundle), expectedState }));
    console.log(`[server] v${version} 已发布：${WEBSITE}/releases/latest.apk`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// Fail before tests, builds or remote writes when source metadata is inconsistent.
async function preflight() {
  if (run('git', ['branch', '--show-current']).trim() !== 'main') throw new Error('请在 main 分支发布');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('发布版本必须为 x.y.z');
  const status = run('git', ['status', '--porcelain', '--untracked-files=normal', '--', '.', ':!artifacts/previews']);
  if (status.trim()) throw new Error(`请先提交或暂存到 stash 后再发布（预览截图除外）：\n${status}`);
  const tauri = JSON.parse(await readFile(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const cargo = await readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
  const lock = await readFile(path.join(root, 'src-tauri/Cargo.lock'), 'utf8');
  const cargoVersion = /\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];
  const lockVersion = /\[\[package\]\]\nname = "musicdan"\nversion = "([^"]+)"/.exec(lock)?.[1];
  if ([tauri.version, cargoVersion, lockVersion].some(value => value !== version)) {
    throw new Error('package.json、tauri.conf.json、Cargo.toml、Cargo.lock 版本必须一致');
  }
  const notes = await readFile(path.join(root, 'release-notes.md'), 'utf8');
  if (!notes.includes(`## ✨ v${version} 更新内容`)) throw new Error('release-notes.md 标题与当前版本不符');
  console.log(`[check] v${version} 源码与发布元数据检查通过`);
}

await preflight();
if (args.includes('--check')) process.exit(0);

if (siteOnly) {
  await buildSiteBundle();
  await deploySite();
} else {
  const sha = run('git', ['rev-parse', 'HEAD']).trim();
  const previous = readServerState();
  const published = previous.find(item => item.version === version);
  if (published) {
    const existingPath = published.build_number ? `build-${published.build_number}/${published.name}` : published.name;
    ecs(`cd ${ECS_BASE}/public/releases; printf '%s  %s\n' '${published.sha256}' '${existingPath}' | sha256sum -c -`);
    ecs(pruneCommand(ECS_BASE));
    console.log(`[release] v${version} 已发布且 APK 摘要正确，跳过重复构建`);
  } else {
    const buildNumber = nextBuildNumber(previous);
    runTests();
    await buildSiteBundle();
    const apk = await buildApk(buildNumber);
    await publishServer(apk, buildNumber, sha, previous);
  }
}
