import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ncmPreview } from './ncm-preview.mjs';
import { makePlan, visibleRange, crossingDuration } from '../src/plan.ts';
import { defaults } from '../src/types.ts';
import { parseLrc, activeLine, prepareLyrics } from '../src/lyrics.ts';

const fixture = JSON.parse(await readFile(new URL('../tests/fixtures/ncm-creep.json', import.meta.url), 'utf8'));

test('recorded Creep data is consistent and supports rendering at 0:04', () => {
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.song.songId, 22605222);
  assert.equal(fixture.song.artists, 'Radiohead');
  assert.ok(Number.isFinite(Date.parse(fixture.source.capturedAt)));
  assert.ok(fixture.searchResults.some(song => song.songId === fixture.song.songId));
  assert.equal(fixture.comments.length, 1000);
  assert.equal(new Set(fixture.comments.map(comment => comment.commentId)).size, fixture.comments.length);
  assert.ok(fixture.comments.every(comment => comment.content && comment.liked_count >= 0));
  assert.ok(fixture.commentCounts[fixture.song.songId] >= fixture.comments.length);
  for (const height of [245, 457]) {
    const { list, spacing, lanes } = makePlan(fixture.comments, fixture.song.duration, height, defaults);
    const crossing = crossingDuration(396, defaults.fontSize, lanes, list.length, fixture.song.duration);
    const [start, end] = visibleRange(4000, crossing, spacing, list.length);
    assert.ok(end >= start && end < list.length);
  }
  const lyrics = parseLrc(fixture.lyrics.lrc);
  assert.equal(lyrics[activeLine(lyrics, 4000)].text, '');
  assert.ok(lyrics.some(line => line.text));
});

test('preview serves its saved fixture without network access', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Preview must be offline'); });
  let handler;
  ncmPreview().configureServer({ middlewares: { use(value) { handler = value; } } });
  for (const name of ['creep', 'november-rain']) {
    const expected = JSON.parse(await readFile(new URL(`../tests/fixtures/ncm-${name}.json`, import.meta.url), 'utf8'));
    const response = await new Promise(resolve => {
      const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { resolve({ status: this.statusCode || 200, headers: this.headers, body }); } };
      handler({ method: 'GET', url: `/__musicdan_preview/fixture?name=${name}` }, res, () => assert.fail('Fixture route was not handled'));
    });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), expected);
  }
  assert.equal(globalThis.fetch.mock.callCount(), 0);
});

test('November Rain 2022 fixture covers 7:13 with genuine timed lyrics', async () => {
  const rain = JSON.parse(await readFile(new URL('../tests/fixtures/ncm-november-rain.json', import.meta.url), 'utf8'));
  assert.equal(rain.song.songId, 1997439178);
  assert.equal(rain.song.name, 'November Rain (2022 Version)');
  assert.equal(rain.song.artists, "Guns N' Roses");
  assert.equal(rain.source.previewPosition, 433000);
  assert.ok(rain.song.duration > 433000 && rain.comments.length > 0);
  assert.equal(new Set(rain.comments.map(comment => comment.commentId)).size, rain.comments.length);
  const lines = parseLrc(rain.lyrics.lrc);
  const active = activeLine(lines, 433000);
  assert.ok(active >= 0 && lines[active].text);
  assert.ok(lines[active].start <= 433000 && lines[active + 1].start > 433000);
  for (const lyrics of [rain.lyrics, ...Object.values(rain.tracks || {}).map(track => track.lyrics)]) {
    const parsed = prepareLyrics(lyrics);
    const current = parsed.lines[activeLine(parsed.lines, 433000)];
    assert.ok(current?.text);
    assert.match(parsed.translations.get(current.start) || '', /\p{Script=Han}/u);
  }
  const plan = makePlan(rain.comments, rain.song.duration, 457, defaults);
  const crossing = crossingDuration(396, defaults.fontSize, plan.lanes, plan.list.length, rain.song.duration);
  const [start, end] = visibleRange(433000, crossing, plan.spacing, plan.list.length);
  assert.ok(end >= start);
});

test('the two recorded November Rain versions merge by comment ID', async () => {
  const { fixtureComments } = await import('../src/demoFixture.ts');
  const rain = JSON.parse(await readFile(new URL('../tests/fixtures/ncm-november-rain.json', import.meta.url), 'utf8'));
  assert.deepEqual(rain.previewSongIds, [1997439178, 1997442946]);
  const selected = rain.previewSongIds.map(id => rain.searchResults.find(song => song.songId === id));
  const extra = rain.tracks['1997442946'];
  assert.equal(extra.comments.length, 52);
  assert.equal(extra.song.album, 'Use Your Illusion I (Deluxe Edition)');
  const expectedIds = new Set([...rain.comments, ...extra.comments].map(comment => comment.commentId));
  const merged = fixtureComments(rain, selected);
  assert.deepEqual(new Set(merged.map(comment => comment.commentId)), expectedIds);
  const duplicate = { ...rain.comments[0], liked_count: rain.comments[0].liked_count + 1 };
  extra.comments.push(duplicate);
  const deduplicated = fixtureComments(rain, selected);
  assert.equal(deduplicated.length, expectedIds.size);
  assert.equal(deduplicated.find(comment => comment.commentId === duplicate.commentId).liked_count, duplicate.liked_count);
  assert.throws(() => fixtureComments(rain, [{ songId: 999 }]), /尚未录入/);
});
