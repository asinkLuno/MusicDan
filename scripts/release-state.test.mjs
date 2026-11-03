import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextBuildNumber, releaseHistory } from './release-state.mjs';

test('continues historical Android build numbers without GitHub requests', () => {
  assert.equal(nextBuildNumber([{ release_url: 'https://github.com/asinkLuno/MusicDan/releases/tag/build-18' }]), 19);
  assert.equal(nextBuildNumber([{ build_number: 19 }, { version_code: 1000000021 }]), 22);
});
test('does not reset build number when server metadata is missing or corrupt', () => {
  for (const records of [[], null, [{}], [{ build_number: -1 }]]) assert.throws(() => nextBuildNumber(records));
});
test('old latest downloads retain the previous APK and retries avoid duplicate versions', () => {
  const old = { version: '0.5.0', build_number: 18, name: 'MusicDan_0.5.0_arm64.apk', download_url: '/releases/latest.apk' };
  const current = { version: '0.5.1', build_number: 19, download_url: '/releases/latest.apk' };
  const history = releaseHistory(current, [current, old]);
  assert.equal(history.length, 2);
  assert.equal(history[1].download_url, '/releases/MusicDan_0.5.0_arm64.apk');
  assert.equal(old.download_url, '/releases/latest.apk');
});

import { mkdtemp, mkdir, writeFile, readFile, symlink, readlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { publishCommand } from './release-state.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const base = await mkdtemp(path.join(tmpdir(), 'musicdan-publish-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const stage = `${base}/stage`;
  for (const dir of ['public/latest', 'public/releases', 'old-site', 'stage', 'new-site']) await mkdir(`${base}/${dir}`, { recursive: true });
  const previous = [{ version: '0.5.0', build_number: 18, name: 'MusicDan_0.5.0_arm64.apk' }];
  await writeFile(`${base}/public/releases.json`, JSON.stringify(previous));
  await writeFile(`${base}/public/latest/release.json`, JSON.stringify(previous[0]));
  await writeFile(`${base}/public/releases/MusicDan_0.5.0_arm64.apk`, 'old apk');
  await writeFile(`${base}/public/releases/MusicDan_0.5.0_arm64.apk.sha256`, 'old sum');
  await symlink('MusicDan_0.5.0_arm64.apk', `${base}/public/releases/latest.apk`);
  await symlink('MusicDan_0.5.0_arm64.apk.sha256', `${base}/public/releases/latest.apk.sha256`);
  await symlink('old-site', `${base}/site`);
  await writeFile(`${base}/new-site/index.html`, 'new site');
  execFileSync('tar', ['-czf', `${stage}/website.tar.gz`, '-C', `${base}/new-site`, '.']);
  const entry = { version: '0.5.1', build_number: 19, name: 'MusicDan_0.5.1_arm64.apk' };
  await writeFile(`${stage}/release.json`, JSON.stringify(entry));
  await writeFile(`${stage}/releases.json`, JSON.stringify([entry, ...previous]));
  await writeFile(`${stage}/MusicDan_0.5.1_arm64.apk`, 'new apk');
  await writeFile(`${stage}/MusicDan_0.5.1_arm64.apk.sha256`, 'new sum');
  return { base, stage, entry, options: { base, stage, buildNumber: 19, apkName: 'MusicDan_0.5.1_arm64.apk',
    sha256: hash('new apk'), siteSha256: hash(await readFile(`${stage}/website.tar.gz`)),
    siteBundleName: 'website.tar.gz', expectedState: hash(JSON.stringify(previous)), owner: `${process.getuid()}:${process.getgid()}` } };
}

test('migrates legacy paths and publishes website, metadata and APK through one pointer', async t => {
  const { base, entry, options } = await fixture(t);
  execFileSync('sh', ['-c', publishCommand(options)]);
  assert.equal(await readlink(`${base}/public/latest`), 'releases/build-19');
  assert.equal(await readFile(`${base}/public/releases/latest.apk`, 'utf8'), 'new apk');
  assert.equal(await readFile(`${base}/site/index.html`, 'utf8'), 'new site');
  assert.deepEqual(JSON.parse(await readFile(`${base}/public/latest/release.json`, 'utf8')), entry);
  assert.equal(JSON.parse(await readFile(`${base}/public/releases.json`, 'utf8'))[0].version, '0.5.1');
  assert.equal(await readFile(`${base}/public/releases/MusicDan_0.5.0_arm64.apk`, 'utf8'), 'old apk');
});

test('corrupt uploads or concurrent record changes leave the previous version live', async t => {
  for (const mismatch of ['digest', 'state']) {
    const { base, options } = await fixture(t);
    if (mismatch === 'digest') options.sha256 = hash('wrong');
    else options.expectedState = hash('changed');
    assert.throws(() => execFileSync('sh', ['-c', publishCommand(options)], { stdio: 'pipe' }));
    assert.equal(await readFile(`${base}/public/releases/latest.apk`, 'utf8'), 'old apk');
    assert.equal(await readlink(`${base}/site`), 'old-site');
    assert.equal(JSON.parse(await readFile(`${base}/public/releases.json`, 'utf8'))[0].version, '0.5.0');
  }
});

test('retains the three highest builds even when old records are unordered', () => {
  const entries = [16, 20, 18, 19].map(build_number => ({ version: `0.0.${build_number}`, build_number }));
  const history = releaseHistory({ version: '0.0.21', build_number: 21 }, entries);
  assert.deepEqual(history.map(item => item.build_number), [21, 20, 19]);
  assert.equal(nextBuildNumber(history), 22);
});

test('prunes expired artifacts after publication and preserves three downloadable versions', async t => {
  const { base, stage, entry, options } = await fixture(t);
  const kept = [18, 17].map(n => ({ version: `0.0.${n}`, build_number: n, name: `MusicDan_0.0.${n}_arm64.apk` }));
  for (const item of [...kept, { build_number: 16, name: 'MusicDan_0.0.16_arm64.apk' }]) {
    const dir = `${base}/public/releases/build-${item.build_number}`;
    await mkdir(dir);
    await writeFile(`${dir}/${item.name}`, 'retained apk');
    await symlink(`build-${item.build_number}/${item.name}`, `${base}/public/releases/${item.name}`);
  }
  await mkdir(`${base}/site-expired`);
  await writeFile(`${stage}/releases.json`, JSON.stringify([entry, ...kept]));
  execFileSync('sh', ['-c', publishCommand(options)]);
  for (const item of kept) assert.equal(await readFile(`${base}/public/releases/${item.name}`, 'utf8'), 'retained apk');
  for (const relative of ['public/releases/build-16', 'public/releases/MusicDan_0.0.16_arm64.apk',
    'public/releases/MusicDan_0.5.0_arm64.apk', 'site-expired', 'public/.latest-legacy', 'public/.latest-before-19']) {
    await assert.rejects(readFile(`${base}/${relative}`), { code: 'ENOENT' });
  }
  assert.equal(await readFile(`${base}/public/releases/latest.apk`, 'utf8'), 'new apk');
  assert.equal(await readFile(`${base}/site/index.html`, 'utf8'), 'new site');
});
