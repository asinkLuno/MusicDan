import { readFile, writeFile, rename } from 'node:fs/promises';
import { recordLyrics } from './ncm-recording.mjs';

const name = process.argv[2] || 'creep';
if (!['creep', 'november-rain'].includes(name)) throw new Error('未知测试场景');
const path = new URL(`../tests/fixtures/ncm-${name}.json`, import.meta.url);
const fixture = JSON.parse(await readFile(path, 'utf8'));
fixture.lyrics = await recordLyrics(fixture.song.songId, fixture.source.previewPosition);
fixture.source.lyricsCapturedAt = new Date().toISOString();
for (const [id, track] of Object.entries(fixture.tracks || {})) {
  track.lyrics = await recordLyrics(Number(id), fixture.source.previewPosition);
  track.lyricsCapturedAt = new Date().toISOString();
}
const temporary = new URL(`../tests/fixtures/ncm-${name}.${process.pid}.tmp`, import.meta.url);
await writeFile(temporary, JSON.stringify(fixture, null, 2) + '\n');
await rename(temporary, path);
console.log(`Updated ${name} lyric excerpts and supplied translations. Comment recordings retained.`);
