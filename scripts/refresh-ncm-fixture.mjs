import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { request } from './ncm-client.mjs';
import { recordComments, recordLyrics } from './ncm-recording.mjs';

const name = process.argv[2] || 'creep';
const scenarios = {
  creep: { keyword: 'Creep Radiohead', songId: 22605222, position: 4000 },
  'november-rain': { keyword: 'November Rain 2022', songId: 1997439178, position: 433000 },
};
const scenario = scenarios[name];
if (!scenario) throw new Error('未知测试场景');
const searchPage = await request('search', new URLSearchParams({ keyword: scenario.keyword }));
const searchResults = searchPage.result.songs.map((song) => ({
  songId: song.id,
  name: song.name,
  artists: song.artists.map((a) => a.name).join(' / '),
  album: song.album.name,
  duration: song.duration,
}));
const song = searchResults.find((song) => song.songId === scenario.songId);
if (!song) throw new Error('目标歌曲未出现在搜索结果中，保留旧 fixture');
const { comments, total } = await recordComments(song.songId);
const commentCounts = { [song.songId]: total };
let nextSong = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (nextSong < searchResults.length) {
      const song = searchResults[nextSong++];
      commentCounts[song.songId] = (await request('count', new URLSearchParams({ songId: String(song.songId) }))).total;
    }
  }),
);
const lyrics = await recordLyrics(song.songId, scenario.position);
const fixture = {
  schemaVersion: 1,
  source: {
    provider: 'NetEase Cloud Music',
    songUrl: `https://music.163.com/song?id=${song.songId}`,
    capturedAt: new Date().toISOString(),
    commentLimit: 1000,
    lyricsExcerpt: true,
    previewPosition: scenario.position,
  },
  song,
  searchResults,
  commentCounts,
  comments,
  lyrics,
};
// An explicit refresh also re-records any additional versions used for merging.
let previous;
try {
  previous = JSON.parse(await readFile(new URL(`../tests/fixtures/ncm-${name}.json`, import.meta.url), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (previous?.tracks) {
  fixture.tracks = {};
  for (const id of Object.keys(previous.tracks)) {
    const version = searchResults.find((song) => song.songId === Number(id));
    if (!version) throw new Error('合并版本不再出现在搜索结果中，保留旧 fixture');
    const recorded = await recordComments(version.songId);
    const lyrics = await recordLyrics(version.songId, scenario.position);
    if (!recorded.comments.length || !Number.isFinite(recorded.total))
      throw new Error('合并版本评论无效，保留旧 fixture');
    fixture.tracks[id] = { song: version, comments: recorded.comments, lyrics, capturedAt: new Date().toISOString() };
    fixture.commentCounts[id] = recorded.total;
  }
  fixture.previewSongIds = previous.previewSongIds;
}
if (!fixture.comments.length || !Number.isFinite(total)) throw new Error('评论数据无效，保留旧 fixture');
const directory = new URL('../tests/fixtures/', import.meta.url);
await mkdir(directory, { recursive: true });
const temporary = new URL(`ncm-${name}.${process.pid}.tmp`, directory);
await writeFile(temporary, JSON.stringify(fixture, null, 2) + '\n');
await rename(temporary, new URL(`ncm-${name}.json`, directory));
console.log(
  `Saved genuine ${song.name} fixture: ${fixture.comments.length} comments, ${searchResults.length} search results, timed lyric excerpt.`,
);
