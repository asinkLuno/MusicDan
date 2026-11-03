// 本地发布：推送 releases 分支时由 .githooks/pre-push 调用，也可手动运行。
// GitHub 不再托管构建：测试、签名 APK、发布 Release、部署官网与下载镜像全部在本地完成。
//
// 完整发布：
//   node scripts/release.mjs --pushed-sha <sha>   # 钩子调用；版本号与内容取该提交
//   node scripts/release.mjs                      # 手动；需在发布提交的工作区上
// 仅同步服务器（当前版本已在 GitHub 发布时补齐官网下载与元数据）：
//   node scripts/release.mjs --sync-server-only
//
// 发布内容顺序遵循 AGENTS.md：测试、签名校验、附件上传成功后才发布 Release 并更新 latest。
// 重复执行幂等：当前版本已发布时跳过构建与发布，仅补服务器同步。

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
const MACMINI_STAGE = '/tmp/musicdan-deploy';
const REPOSITORY = 'https://github.com/asinkLuno/MusicDan';
const REPO_SLUG = 'asinkLuno/MusicDan';
const ANDROID_BUILD_TOOLS = '37.0.0';
const ANDROID_PROJECT = path.join(root, 'src-tauri/gen/android');

const args = process.argv.slice(2);
const pushedSha = args.includes('--pushed-sha') ? args[args.indexOf('--pushed-sha') + 1] : null;
const syncServerOnly = args.includes('--sync-server-only');
const siteOnly = args.includes('--site-only');

function run(command, cliArgs, options = {}) {
  return execFileSync(command, cliArgs, { cwd: root, encoding: 'utf8', ...options });
}

/** 版本号从本地读取：有推送提交时读该提交的 package.json，避免工作区切分支后读到错误版本 */
function readVersion() {
  const raw = pushedSha ? run('git', ['show', `${pushedSha}:package.json`]) : run('cat', ['package.json']);
  return JSON.parse(raw).version;
}
const version = readVersion();
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

function githubApi(route) {
  return JSON.parse(run('gh', ['api', route.replace(/^\//, '')]));
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
  const siteDir = `site-${version}-${pushedSha ? pushedSha.slice(0, 7) : 'manual'}`;
  console.log(`[site] 上传并解压到 ${ECS_BASE}/${siteDir}`);
  await upload(siteBundle, '/tmp/');
  ecs(`set -e; cd ${ECS_BASE}; rm -rf ${siteDir}; mkdir ${siteDir}; mv /tmp/${path.basename(siteBundle)} ${siteDir}.tar.gz; tar -xzf ${siteDir}.tar.gz -C ${siteDir}; rm ${siteDir}.tar.gz; chown -R musicdan:musicdan ${siteDir}; chmod 755 ${siteDir}`);
  ecs(`set -e; cd ${ECS_BASE}; ln -s ${siteDir} .site-next-$$; mv -Tf .site-next-$$ site`);
  console.log(`[site] 官网已切换到 ${siteDir}`);
}

/** 前端与插件测试（CI 原有步骤的本地等价） */
function runTests() {
  console.log('[test] yarn test');
  run('yarn', ['test'], { stdio: 'inherit' });
  console.log('[test] yarn test:fixtures');
  run('yarn', ['test:fixtures'], { stdio: 'inherit' });
  console.log('[test] Kotlin 插件单元测试');
  run('./gradlew', [':tauri-plugin-media:testDebugUnitTest'], {
    cwd: ANDROID_PROJECT,
    env: { ...process.env, ANDROID_HOME: process.env.ANDROID_HOME || `${process.env.HOME}/Android/Sdk` },
    stdio: 'inherit',
  });
}

/** 下一个构建编号 = GitHub 上最新已发布 build-N + 1（延续历史 versionCode 体系） */
function nextBuildNumber() {
  const releases = githubApi(`repos/${REPO_SLUG}/releases?per_page=100`);
  const latest = releases
    .filter(release => !release.draft && !release.prerelease)
    .map(release => /^build-(\d+)$/.exec(release.tag_name)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => b - a)[0] ?? 0;
  return latest + 1;
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

/** GitHub Release 说明：下载小节与系统要求按 AGENTS.md 模板生成，更新内容读 release-notes.md */
async function releaseBody(tag) {
  const notes = (await readFile(path.join(root, 'release-notes.md'), 'utf8')).trim();
  if (!notes || !notes.includes('更新内容')) throw new Error('release-notes.md 为空或缺少“更新内容”：请填写本次版本的更新说明');
  return [
    '## 📱 Android 用户请下载这个文件',
    '',
    `**[\`${apkName}\`](${REPOSITORY}/releases/download/${tag}/${apkName})**`,
    '',
    notes,
    '',
    '## 📋 系统要求',
    '',
    '- 需要 **Android 7.0（API 24）及以上**。',
    '- 仅提供 arm64-v8a（64 位）安装包；暂不提供 32 位 armv7 和模拟器（x86/x86_64）的包。',
    '',
  ].join('\n');
}

/** 当前版本对应的已发布正式 Release（含 APK 资产）；未发布返回 null */
function findPublishedRelease() {
  const release = githubApi(`repos/${REPO_SLUG}/releases/latest`);
  const asset = (release.assets || []).find(item => item.name === apkName);
  if (!asset || release.draft || release.prerelease) return null;
  return { release, asset };
}

/** 创建 draft Release → 上传并校验资产 → 发布并标记 Latest（失败保留 draft，不影响上一版 Latest） */
async function publishGitHub(buildNumber, sha, apk) {
  const tag = `build-${buildNumber}`;
  const body = await releaseBody(tag);
  // pre-push 阶段提交尚未在远端：先推送 releases 分支供 Release 标签引用
  run('git', ['push', 'origin', `${sha}:refs/heads/releases`]);
  console.log(`[github] 创建草稿 Release ${tag}`);
  const notesFile = path.join(await mkdtemp(path.join(tmpdir(), 'musicdan-rel-')), 'body.md');
  await writeFile(notesFile, body);
  run('gh', ['release', 'create', tag, '--repo', REPO_SLUG, '--target', sha,
    '--draft', '--title', `MusicDan v${version}`, '--notes-file', notesFile]);
  run('gh', ['release', 'upload', tag, '--repo', REPO_SLUG, apk, siteBundle, '--clobber']);
  const draft = githubApi(`repos/${REPO_SLUG}/releases/tags/${tag}`);
  const uploaded = draft.assets.find(item => item.name === apkName);
  if (!uploaded) throw new Error('APK 上传后未在草稿 Release 中找到');
  if (uploaded.digest && uploaded.digest !== `sha256:${await sha256File(apk)}`) throw new Error('上传的 APK 摘要与本地不一致');
  if (!draft.assets.some(item => item.name === path.basename(siteBundle))) throw new Error('官网包上传失败');
  console.log('[github] 资产校验通过，发布 Release 并标记 Latest');
  run('gh', ['release', 'edit', tag, '--repo', REPO_SLUG, '--draft=false', '--latest']);
  // 版本标签不可变；latest 便捷标签指向发布提交
  run('git', ['tag', '-f', 'latest', sha]);
  if (!run('git', ['tag', '--list', `v${version}`]).trim()) {
    run('git', ['tag', `v${version}`, sha]);
  }
  run('git', ['push', 'origin', `v${version}`, 'latest', '--force']);
  const published = githubApi(`repos/${REPO_SLUG}/releases/tags/${tag}`);
  return { tag, releaseId: published.id, publishedAt: published.published_at };
}

/** 部署 APK 与元数据到服务器；下载地址固定 latest.apk，原子切换符号链接 */
async function syncServer(apk, meta) {
  const sha256 = await sha256File(apk);
  const size = (await readFile(apk)).length;
  const checksum = path.join(path.dirname(apk), `${apkName}.sha256`);
  await writeFile(checksum, `${sha256}  ${apkName}\n`);
  console.log('[server] 上传 APK 与校验文件');
  await upload(apk, '/tmp/');
  await upload(checksum, '/tmp/');
  ecs(`set -e; mv /tmp/${apkName} /tmp/${apkName}.sha256 ${ECS_BASE}/public/releases/; chown musicdan:musicdan ${ECS_BASE}/public/releases/${apkName}*`);
  ecs(`set -e; cd ${ECS_BASE}/public/releases; ln -sfn ${apkName} latest.apk; ln -sfn ${apkName}.sha256 latest.apk.sha256`);

  const entry = {
    version,
    release_id: meta.releaseId,
    name: apkName,
    size,
    sha256,
    download_url: '/releases/latest.apk',
    github_url: `${REPOSITORY}/releases/download/${meta.tag}/${apkName}`,
    release_url: `${REPOSITORY}/releases/tag/${meta.tag}`,
    published_at: meta.publishedAt,
  };
  const previous = await fetch('https://musicdan.syncmoon.ink/releases.json', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : []).catch(() => []);
  const history = Array.isArray(previous) ? previous.filter(item => item?.version !== version) : [];
  const work = await mkdtemp(path.join(tmpdir(), 'musicdan-meta-'));
  await writeFile(path.join(work, 'musicdan-release.json'), JSON.stringify(entry, null, 2) + '\n');
  await writeFile(path.join(work, 'musicdan-releases.json'), JSON.stringify([entry, ...history], null, 2) + '\n');
  console.log('[server] 更新 latest.json 与 releases.json');
  await upload(path.join(work, 'musicdan-release.json'), '/tmp/');
  await upload(path.join(work, 'musicdan-releases.json'), '/tmp/');
  // 旧安装曾把 public/latest 做成指向 build 目录的符号链接：替换为真实目录，避免 mv 穿透写进旧版本
  ecs(`set -e; if [ -L ${ECS_BASE}/public/latest ]; then rm ${ECS_BASE}/public/latest; fi; mkdir -p ${ECS_BASE}/public/latest; mv /tmp/musicdan-release.json ${ECS_BASE}/public/latest/release.json; mv /tmp/musicdan-releases.json ${ECS_BASE}/public/releases.json; chown musicdan:musicdan ${ECS_BASE}/public/latest/release.json ${ECS_BASE}/public/releases.json`);
  await rm(work, { recursive: true, force: true });
  console.log(`[server] v${version} 已上线：https://musicdan.syncmoon.ink/releases/latest.apk`);
}

/** --sync-server-only：从 GitHub 最新发布取 APK 同步到服务器（不构建、不改 Release） */
async function syncServerFromGitHub() {
  const published = findPublishedRelease();
  if (!published) throw new Error(`GitHub 上没有 v${version} 的正式发布`);
  const { release, asset } = published;
  if (asset.digest && !asset.digest.startsWith('sha256:')) throw new Error(`未知的资产摘要格式：${asset.digest}`);
  const work = await mkdtemp(path.join(tmpdir(), 'musicdan-apk-'));
  console.log(`[server] 从 GitHub 下载 ${asset.name}`);
  run('gh', ['release', 'download', release.tag_name, '--repo', REPO_SLUG,
    '--pattern', asset.name, '--dir', work, '--clobber']);
  const apk = path.join(work, asset.name);
  if (asset.digest && asset.digest.slice('sha256:'.length) !== await sha256File(apk)) {
    throw new Error('下载的 APK 摘要与 GitHub 不一致');
  }
  await syncServer(apk, {
    releaseId: release.id,
    tag: release.tag_name,
    publishedAt: asset.updated_at || release.published_at,
  });
  await rm(work, { recursive: true, force: true });
}

if (syncServerOnly) {
  await syncServerFromGitHub();
} else if (siteOnly) {
  await buildSiteBundle();
  await deploySite();
} else {
  // 完整发布：工作区必须就是待发布的提交（树一致），保证本地构建内容与推送内容相同
  const treeOf = sha => run('git', ['rev-parse', `${sha}^{tree}`]).trim();
  if (pushedSha && treeOf(pushedSha) !== treeOf('HEAD')) {
    throw new Error('当前工作区不是待发布的提交；请在发布提交上执行推送');
  }
  if (findPublishedRelease()) {
    console.log(`[release] v${version} 已在 GitHub 发布，跳过构建，仅同步服务器`);
    await syncServerFromGitHub();
  } else {
    const sha = pushedSha ?? run('git', ['rev-parse', 'HEAD']).trim();
    await runTests();
    await buildSiteBundle();
    const buildNumber = nextBuildNumber();
    const apk = await buildApk(buildNumber);
    const meta = await publishGitHub(buildNumber, sha, apk);
    await deploySite();
    await syncServer(apk, meta);
  }
}
