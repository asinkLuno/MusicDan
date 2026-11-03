import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareVersions, parseReleaseNotes } from './release.ts';

describe('compareVersions', () => {
  it('按数字逐段比较', () => {
    assert.equal(compareVersions('0.4.3', '0.4.3'), 0);
    assert.equal(compareVersions('0.4.9', '0.4.10'), -1);
    assert.equal(compareVersions('0.5.0', '0.4.99'), 1);
    assert.equal(compareVersions('1.0.0', '0.9.9'), 1);
  });

  it('段数不同时按 0 补齐', () => {
    assert.equal(compareVersions('0.4', '0.4.0'), 0);
    assert.equal(compareVersions('0.4', '0.4.1'), -1);
  });
});

describe('parseReleaseNotes', () => {
  const body = [
    '## 📱 Android 用户请下载这个文件',
    '',
    '**[`MusicDan_0.4.3_arm64.apk`](https://example.com/apk)**',
    '',
    '## ✨ v0.4.3 更新内容',
    '',
    '包含自 v0.4.2 发布以来的以下改动。',
    '',
    '### 歌词',
    '',
    '- 收紧歌词行距：行与行的间隔改为按歌词字号计算，长段歌词阅读更连贯。',
    '',
    '## 📋 系统要求',
    '',
    '- 需要 **Android 7.0（API 24）及以上**。',
    '- 仅提供 arm64-v8a（64 位）安装包。',
  ].join('\n');

  it('跳过下载小节、版本标题和引言', () => {
    const blocks = parseReleaseNotes(body);
    assert.equal(blocks.some(block => block.text.includes('apk')), false);
    assert.equal(blocks.some(block => block.text.includes('包含自')), false);
    assert.deepEqual(blocks[0], { kind: 'heading', text: '歌词' });
  });

  it('保留小节标题、列表项并去掉行内标记', () => {
    const blocks = parseReleaseNotes(body);
    assert.deepEqual(blocks[1], { kind: 'item', text: '收紧歌词行距：行与行的间隔改为按歌词字号计算，长段歌词阅读更连贯。' });
    assert.deepEqual(blocks[2], { kind: 'heading', text: '📋 系统要求' });
    assert.deepEqual(blocks[3], { kind: 'item', text: '需要 Android 7.0（API 24）及以上。' });
    assert.deepEqual(blocks[4], { kind: 'item', text: '仅提供 arm64-v8a（64 位）安装包。' });
  });

  it('正文段落渲染为 text', () => {
    const blocks = parseReleaseNotes('临时说明文本\n\n- 条目一');
    assert.deepEqual(blocks[0], { kind: 'text', text: '临时说明文本' });
    assert.deepEqual(blocks[1], { kind: 'item', text: '条目一' });
  });
});
