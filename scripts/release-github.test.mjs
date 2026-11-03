import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareDraft, uploadDraftAssets } from './release-github.mjs';

test('retry reuses the matching draft ID despite duplicate tags', async () => {
  const calls = [];
  await prepareDraft({ api: (...args) => calls.push(args), releases: [
    { id: 1, tag_name: 'build-19', draft: true, target_commitish: 'old' },
    { id: 2, tag_name: 'build-19', draft: true, target_commitish: 'new' },
  ], tag: 'build-19', sha: 'new', title: 'title', body: 'body' });
  assert.equal(calls[0][0], 'releases/2');
  assert.equal(calls[0][1], 'PATCH');
});

test('published build tags cannot be reused', async () => {
  await assert.rejects(prepareDraft({ releases: [{ tag_name: 'build-19', draft: false }], tag: 'build-19' }), /不能覆盖/);
});

test('retry replaces partial assets and verifies both files on the same draft', async () => {
  const calls = [];
  let assets = [{ id: 8, name: 'app.apk' }];
  const api = async (route, method) => {
    calls.push([route, method]);
    if (method === 'DELETE') { assets = []; return; }
    return { assets };
  };
  const files = [{ name: 'app.apk', path: '/apk', size: 12 }, { name: 'site.tar.gz', path: '/site', size: 24 }];
  await uploadDraftAssets({ api, draft: { id: 2, upload_url: 'https://uploads.example/2/assets{?name,label}' }, files,
    digest: async () => 'abc', upload: async (url, path) => {
      assert.match(url, /\/2\/assets\?name=/);
      const file = files.find(item => item.path === path);
      assets.push({ ...file, state: 'uploaded', digest: 'sha256:abc' });
    } });
  assert.deepEqual(calls[1], ['releases/assets/8', 'DELETE']);
  assert.ok(calls.filter(([route]) => route.startsWith('releases/2')).length >= 3);
});

test('missing or corrupted uploads block publication', async () => {
  for (const assets of [[], [{ name: 'app.apk', size: 12, state: 'uploaded', digest: 'sha256:wrong' }]]) {
    await assert.rejects(uploadDraftAssets({ api: async () => ({ assets }),
      upload: async () => {}, draft: { id: 2, upload_url: 'https://example/assets{?name}' },
      files: [{ name: 'app.apk', path: '/apk', size: 12 }], digest: async () => 'abc' }), /上传/);
  }
});
