// main → annotated tag → APK → screenshots/site → ECS staging → GitHub Release → website.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import net from 'node:net';
import { existsSync, globSync, mkdirSync, rmSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = '/srv/musicdan';
const instance = process.env.MUSICDAN_ECS_INSTANCE;
const workbench = '/usr/local/bin/workbench';
const repo = 'asinkLuno/MusicDan';
const android = path.join(root, 'src-tauri/gen/android');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(homedir(), 'Library/Android/sdk');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
assert(
  args.every((arg) => arg === '--check'),
  '仅支持 yarn release 或 yarn release:check',
);
const run = (command, argv, options = {}) => execFileSync(command, argv, { cwd: root, encoding: 'utf8', ...options });
const git = (...argv) => run('git', argv).trim();
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const digest = async (file) => sha256(await readFile(file));
const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
function ecs(command) {
  const result = JSON.parse(
    run(workbench, ['exec', '--instance-id', instance, '--command', command, '--timeout', '300', '--output', 'json']),
  );
  assert.equal(result.exit_code, 0, `服务器命令失败：${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
function gh(...argv) {
  return run('gh', [...argv, '--repo', repo]);
}
function buildNumber(entry) {
  const number =
    entry.build_number ??
    (entry.version_code == null
      ? Number(/\/build-(\d+)(?:\/|$)/.exec(entry.release_url ?? entry.github_url ?? '')?.[1])
      : entry.version_code - 1_000_000_000);
  assert(Number.isSafeInteger(number) && number > 0 && number <= 1_100_000_000, '服务器构建编号无效，禁止归零');
  return number;
}
function cleanSource(commit) {
  assert.equal(git('branch', '--show-current'), 'main', '只能从 main 发布');
  assert.equal(git('rev-parse', 'HEAD'), commit, '发布期间 HEAD 已变化');
  assert.equal(
    git('status', '--porcelain', '--untracked-files=normal', '--', '.', ':!artifacts/previews'),
    '',
    '请先提交源码与发布说明，工作区必须干净（生成截图除外）',
  );
}

const { version } = await json(path.join(root, 'package.json'));
assert(/^\d+\.\d+\.\d+$/.test(version), '版本必须为 X.Y.Z');
const tag = `v${version}`;
const output = path.join(root, 'artifacts/releases', tag);
const bundleFile = path.join(output, 'bundle.json');
const commit = git('rev-parse', 'HEAD');
cleanSource(commit);
run('yarn', ['quality'], { stdio: 'inherit' });
const tauri = await json(path.join(root, 'src-tauri/tauri.conf.json'));
const cargo = await readFile(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
const lock = await readFile(path.join(root, 'src-tauri/Cargo.lock'), 'utf8');
assert(
  [
    tauri.version,
    /\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1],
    /\[\[package\]\]\nname = "musicdan"\nversion = "([^"]+)"/.exec(lock)?.[1],
  ].every((value) => value === version),
  '四处应用版本必须一致',
);
const notes = await readFile(path.join(root, 'release-notes.md'), 'utf8');
assert(
  notes.startsWith(`## ✨ ${tag} 更新内容\n`) && notes.includes('更新基线：') && notes.includes('\n### '),
  '更新说明的版本、基线或功能分组不完整',
);
assert(instance, '请设置 MUSICDAN_ECS_INSTANCE');
for (const file of [
  workbench,
  chrome,
  path.join(android, 'keystore.properties'),
  path.join(root, 'android-signing/musicdan.keystore'),
])
  assert(existsSync(file), `缺少本地依赖：${file}`);
const toolVersions = globSync('*/aapt', { cwd: path.join(sdk, 'build-tools') }).sort((a, b) =>
  a.localeCompare(b, 'en', { numeric: true }),
);
assert(toolVersions.length, '请安装 Android SDK build-tools');
const tools = path.dirname(path.join(sdk, 'build-tools', toolVersions.at(-1)));
const ndks = (existsSync(path.join(sdk, 'ndk')) ? globSync('*', { cwd: path.join(sdk, 'ndk') }) : []).sort((a, b) =>
  a.localeCompare(b, 'en', { numeric: true }),
);
const ndk = process.env.NDK_HOME || process.env.ANDROID_NDK_HOME || (ndks.length && path.join(sdk, 'ndk', ndks.at(-1)));
assert(ndk && existsSync(ndk), '请配置 Android NDK');
run('java', ['-version'], { stdio: 'ignore' });
assert(
  run('rustup', ['target', 'list', '--installed']).includes('aarch64-linux-android'),
  '请安装 Rust aarch64-linux-android target',
);
run('gh', ['auth', 'status'], { stdio: 'ignore' });
const repository = JSON.parse(run('gh', ['repo', 'view', repo, '--json', 'nameWithOwner,viewerPermission']));
assert.equal(repository.nameWithOwner, repo);
assert(['ADMIN', 'MAINTAIN', 'WRITE'].includes(repository.viewerPermission), '缺少 GitHub 发布权限');
assert(
  /github\.com[:/]asinkLuno\/MusicDan(?:\.git)?$/.test(git('remote', 'get-url', '--push', 'origin')),
  'origin 必须指向 MusicDan 仓库',
);
git('fetch', 'origin', 'main');
assert.equal(commit, git('rev-parse', 'FETCH_HEAD'), '请先将 main 同步到 origin/main');
const previousRaw = ecs(`cat ${base}/public/releases.json`);
const previous = JSON.parse(previousRaw);
assert(Array.isArray(previous) && previous.length > 0, '服务器发布记录为空，禁止重置编号');
const maximum = Math.max(...previous.map(buildNumber));
const serverScript = await readFile(path.join(root, 'scripts/publish-release.py'), 'utf8');
function server(action, directory) {
  return ecs(
    `python3 - ${shellQuote(action)} ${shellQuote(directory)} <<'MUSICDAN_PUBLISH'\n${serverScript}\nMUSICDAN_PUBLISH`,
  );
}
server('check', base);

// The tag reserves the build number and source; failed builds reuse it without moving it.
const remoteTag = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`);
if (remoteTag) git('fetch', 'origin', `refs/tags/${tag}:refs/tags/${tag}`);
let plan;
if (git('tag', '--list', tag)) {
  assert.equal(git('cat-file', '-t', `refs/tags/${tag}`), 'tag', '发布标签必须为附注标签');
  assert.equal(git('rev-parse', `refs/tags/${tag}^{commit}`), commit, '同名标签指向另一提交，禁止覆盖');
  plan = JSON.parse(git('for-each-ref', '--format=%(contents)', `refs/tags/${tag}`));
  assert.equal(plan.source_commit, commit);
  assert.equal(plan.version, version);
  assert.equal(plan.notes_sha256, sha256(notes), '标签中的更新说明摘要不符');
  buildNumber(plan);
} else {
  assert(!previous.some((entry) => entry.version === version), '该版本已在服务器发布，请提高版本号');
  plan = {
    version,
    source_commit: commit,
    build_number: maximum + 1,
    version_code: 1_000_000_000 + maximum + 1,
    notes_sha256: sha256(notes),
    previous_sha256: sha256(previousRaw),
    published_at: new Date().toISOString(),
  };
}
assert.equal(plan.version_code, 1_000_000_000 + plan.build_number);
assert(plan.version_code <= 2_100_000_000, 'versionCode 超出 Android 发布范围');
const alreadyPublished = previous.find((entry) => entry.version === version);
if (alreadyPublished) {
  assert.equal(previous[0], alreadyPublished, '禁止将历史版本重新发布为 latest');
  assert.equal(alreadyPublished.source_commit, commit);
  assert.equal(alreadyPublished.build_number, plan.build_number);
} else {
  assert.equal(plan.previous_sha256, sha256(previousRaw), '服务器记录已变化，此标签不能继续发布');
  assert.equal(plan.build_number, maximum + 1, '构建编号不再是下一个编号');
}
const releases = JSON.parse(run('gh', ['api', `repos/${repo}/releases`, '--paginate', '--slurp'])).flat();
const existingRelease = releases.find((item) => item.tag_name === tag);
let release = existingRelease
  ? { body: existingRelease.body, isDraft: existingRelease.draft, assets: existingRelease.assets }
  : undefined;
if (release) assert.equal(release.body.trim(), notes.trim(), 'GitHub 更新说明与本地不一致，禁止覆盖');
const staged = ecs(`if [ -e ${base}/public/releases/build-${plan.build_number} ]; then printf staged; fi`).trim();
assert(
  !(alreadyPublished || release || staged) || existsSync(bundleFile),
  '远端已有该版本产物，本地缓存缺失；请恢复原缓存，禁止重新构建',
);
if (existsSync(bundleFile)) {
  const cached = await json(bundleFile);
  assert.deepEqual(cached.plan, plan, '缓存不属于当前标签');
  for (const [name, expected] of Object.entries(cached.files)) {
    assert.equal(path.basename(name), name, '缓存文件名无效');
    assert.equal(await digest(path.join(output, name)), expected, `缓存缺失或摘要不符：${name}`);
  }
}
if (args.includes('--check')) {
  console.log(`[check] ${tag} 预检通过；未打标、构建或发布`);
  process.exit(0);
}
await mkdir(output, { recursive: true });
// Gradle outputs and screenshots are shared by all releases in this checkout.
const localLock = path.join(root, 'artifacts/releases/.release-lock');
assert(!existsSync(localLock), '本地发布锁已存在；确认没有发布进程后再清理 artifacts/releases/.release-lock');
mkdirSync(localLock);
process.once('exit', () => rmSync(localLock, { recursive: true, force: true }));
cleanSource(commit);
if (!git('tag', '--list', tag)) {
  const annotation = path.join(output, 'tag.json');
  await save(annotation, plan);
  git('tag', '-a', tag, commit, '-F', annotation);
}
git('push', 'origin', `refs/tags/${tag}`);
const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  NDK_HOME: ndk,
  MUSICDAN_BUILD_NUMBER: String(plan.build_number),
  GITHUB_SHA: commit,
};
const apkName = `MusicDan_${version}_arm64.apk`;
const apk = path.join(output, apkName);
const apkState = path.join(output, 'apk.json');
let signingDigest;
async function validateApk() {
  if (!signingDigest) {
    const report = run(path.join(android, 'gradlew'), [':app:signingReport', '--console=plain'], { cwd: android, env });
    const releaseSigning = /Variant: release\r?\n(?:(?!Variant:)[\s\S])*/.exec(report)?.[0] ?? '';
    assert.equal(
      path.resolve(/Store: (.+)/.exec(releaseSigning)?.[1].trim() ?? ''),
      path.join(root, 'android-signing/musicdan.keystore'),
      'release 必须使用现有私有 keystore',
    );
    signingDigest = /SHA-256: ([A-Fa-f0-9:]+)/.exec(releaseSigning)?.[1].replaceAll(':', '').toLowerCase();
    assert(signingDigest?.length === 64, '无法读取 release 签名证书');
  }
  const signature = run(path.join(tools, 'apksigner'), ['verify', '--print-certs', apk]);
  assert(
    signature.toLowerCase().includes(`signer #1 certificate sha-256 digest: ${signingDigest}`),
    'APK 签名与 release keystore 不一致',
  );
  const badging = run(path.join(tools, 'aapt'), ['dump', 'badging', apk]);
  assert(
    badging.includes(`package: name='${tauri.identifier}' versionCode='${plan.version_code}' versionName='${version}'`),
    'APK 的应用 ID 或版本不符',
  );
  assert(badging.includes("native-code: 'arm64-v8a'"), 'APK 缺少 arm64-v8a');
}
async function buildSite() {
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
  const previewUrl = `http://127.0.0.1:${port}/`;
  const profile = await mkdtemp(path.join(tmpdir(), 'musicdan-chrome-'));
  const preview = spawn('yarn', ['dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env,
    stdio: 'inherit',
    detached: true,
  });
  const browser = spawn(
    chrome,
    ['--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`],
    { stdio: 'ignore', detached: true },
  );
  let failure;
  for (const child of [preview, browser]) {
    child.on('error', (error) => {
      failure = error;
    });
    child.on('exit', (code) => {
      failure = new Error(`截图进程提前退出：${code}`);
    });
  }
  try {
    let endpoint;
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (failure) throw failure;
      const portFile = path.join(profile, 'DevToolsActivePort');
      if (existsSync(portFile)) endpoint = `http://127.0.0.1:${(await readFile(portFile, 'utf8')).split('\n')[0]}`;
      ready = await fetch(previewUrl, { signal: AbortSignal.timeout(500) })
        .then((r) => r.ok)
        .catch(() => false);
      if (endpoint && ready) break;
      await delay(500);
    }
    assert(endpoint && ready && !failure, 'Chrome 或应用预览启动失败');
    run('yarn', ['build:release-site'], {
      env: { ...env, CHROME_DEBUG_URL: endpoint, MUSICDAN_PREVIEW_URL: previewUrl },
      stdio: 'inherit',
    });
  } finally {
    for (const child of [preview, browser]) {
      if (!child.pid) continue;
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') console.error('无法停止截图进程', error);
      }
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
if (!existsSync(bundleFile)) {
  assert(!alreadyPublished, '已发布版本的本地产物缺失，请恢复 artifacts/releases 缓存，禁止重建覆盖');
  if (existsSync(apkState)) {
    const state = await json(apkState);
    assert.equal(state.source_commit, commit);
    assert.equal(state.build_number, plan.build_number);
    assert.equal(state.sha256, await digest(apk));
  } else {
    console.log(`[build] ${tag} / versionCode ${plan.version_code}`);
    await rm(path.join(android, 'app/build/outputs/apk'), { recursive: true, force: true });
    run('yarn', ['tauri', 'android', 'build', '--apk', '--split-per-abi', '--target', 'aarch64'], {
      env,
      stdio: 'inherit',
    });
    const candidates = globSync('app/build/outputs/apk/**/release/*arm64*.apk', { cwd: android });
    assert.equal(candidates.length, 1, '必须生成唯一的 arm64 release APK');
    await copyFile(path.join(android, candidates[0]), apk);
    await validateApk();
    await save(apkState, { source_commit: commit, build_number: plan.build_number, sha256: await digest(apk) });
  }
  await validateApk();
  await buildSite();
  cleanSource(commit);
  const siteName = `MusicDan_${version}_website.tar.gz`;
  await copyFile(path.join(root, 'artifacts/releases', siteName), path.join(output, siteName));
  await writeFile(path.join(output, 'release-notes.md'), notes);
  const entry = {
    version,
    tag,
    build_number: plan.build_number,
    version_code: plan.version_code,
    source_commit: commit,
    name: apkName,
    size: (await stat(apk)).size,
    sha256: await digest(apk),
    published_at: plan.published_at,
    notes,
    download_url: '/releases/latest.apk',
    release_url: `/releases/build-${plan.build_number}/release-notes.md`,
    github_url: `https://github.com/${repo}/releases/tag/${tag}`,
  };
  await writeFile(path.join(output, `${apkName}.sha256`), `${entry.sha256}  ${apkName}\n`);
  const history = [
    entry,
    ...previous
      .toSorted((a, b) => buildNumber(b) - buildNumber(a))
      .map((old) => ({
        ...old,
        download_url: old.download_url === '/releases/latest.apk' ? `/releases/${old.name}` : old.download_url,
      })),
  ].slice(0, 3);
  await save(path.join(output, 'release.json'), entry);
  await save(path.join(output, 'releases.json'), history);
  const files = {};
  for (const name of [apkName, `${apkName}.sha256`, siteName, 'release-notes.md', 'release.json', 'releases.json'])
    files[name] = await digest(path.join(output, name));
  await save(bundleFile, { plan, entry, site: siteName, files });
}
const bundle = await json(bundleFile);
assert.deepEqual(bundle.plan, plan, '缓存不属于当前标签');
for (const [name, expected] of Object.entries(bundle.files)) {
  assert.equal(path.basename(name), name, '缓存文件名无效');
  assert.equal(await digest(path.join(output, name)), expected, `缓存摘要不符：${name}`);
}
assert.equal(bundle.entry.sha256, await digest(apk));
assert.equal(bundle.entry.notes, notes);
await validateApk();
cleanSource(commit);
const stage = `${base}/.upload-${randomUUID()}`;
ecs(`mkdir ${shellQuote(stage)}`);
for (const name of [...Object.keys(bundle.files), 'bundle.json'])
  run(workbench, ['upload', path.join(output, name), `${stage}/`, '--instance-id', instance], { stdio: 'inherit' });
console.log(server('stage', stage));

// Upload to a draft, verify every attachment, then publish; never clobber an existing asset.
if (!release) {
  gh(
    'release',
    'create',
    tag,
    '--draft',
    '--verify-tag',
    '--title',
    `MusicDan ${tag}`,
    '--notes-file',
    path.join(output, 'release-notes.md'),
  );
  release = JSON.parse(gh('release', 'view', tag, '--json', 'body,isDraft,assets'));
}
assert.equal(release.body.trim(), notes.trim(), 'GitHub 更新说明与本地不一致，禁止覆盖');
const downloads = await mkdtemp(path.join(tmpdir(), 'musicdan-verify-'));
try {
  for (const name of [apkName, `${apkName}.sha256`, 'release-notes.md']) {
    if (!release.assets.some((asset) => asset.name === name)) {
      assert(release.isDraft, `已发布的 GitHub Release 缺少附件 ${name}`);
      gh('release', 'upload', tag, path.join(output, name));
    }
    gh('release', 'download', tag, '--pattern', name, '--dir', downloads);
    assert.equal(await digest(path.join(downloads, name)), bundle.files[name], `GitHub 附件摘要不符：${name}`);
  }
} finally {
  await rm(downloads, { recursive: true, force: true });
}
if (release.isDraft) gh('release', 'edit', tag, '--draft=false', '--latest');
console.log(server('activate', `${base}/public/releases/build-${plan.build_number}`));
console.log(
  `[release] ${tag} 已发布到 https://github.com/${repo}/releases/tag/${tag} 和 https://musicdan.syncmoon.ink`,
);
