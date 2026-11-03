import { defaults, type Comment, type Snapshot, type Song } from './types';
import { fixtureComments, type DemoFixture } from './demoFixture';
import type { ReleaseInfo, UpdateStatus } from './release';

// Simulate native playback only. Real content is recorded in a stable test fixture.
const options = new URLSearchParams(window.location.search);
const scenario = options.get('demo') === 'november-rain' ? 'november-rain' : 'creep';
const start = Number(options.get('position') ?? (scenario === 'november-rain' ? 433000 : 18000));
const frozen = options.get('freeze') === '1';
const media = scenario === 'november-rain'
  ? { title: 'November Rain (2022 Version)', artist: "Guns N' Roses", album: 'Use Your Illusion (Super Deluxe)', duration: 535745 }
  : { title: 'Creep', artist: 'Radiohead', album: 'Pablo Honey', duration: 238000 };
let settings = { ...defaults };
let playing = true;
let position = Number.isFinite(start) && start >= 0 ? start : 18000;
let sampled = Date.now();
let revision = 1;
let songs: Song[] = [];
let comments: Comment[] = [];
let loading = true;
let error: string | null = null;
let initialized: Promise<void> | undefined;
let fixturePromise: Promise<DemoFixture> | undefined;
let manualMatch = false;
// 设置页“版本与更新”演示数据：与 v0.4.3 真实发布说明一致，检查结果为已是最新版本
const demoRelease: ReleaseInfo = {
  version: '0.4.3',
  pageUrl: 'https://musicdan.syncmoon.ink/#download',
  apkUrl: 'https://musicdan.syncmoon.ink/releases/build-17/MusicDan_0.4.3_arm64.apk',
  notes: [
    '## 📱 Android 用户请下载这个文件',
    '',
    '**[`MusicDan_0.4.3_arm64.apk`](https://musicdan.syncmoon.ink/releases/build-17/MusicDan_0.4.3_arm64.apk)**',
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
    '- 仅提供 arm64-v8a（64 位）安装包；暂不提供 32 位 armv7 和模拟器（x86/x86_64）的包。',
  ].join('\n'),
};
function fixture(): Promise<DemoFixture> {
  return fixturePromise ??= (async () => {
    const response = await fetch(`/__musicdan_preview/fixture?name=${scenario}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '无法读取截图测试数据');
    if (data.schemaVersion !== 1 || !data.song?.songId || !data.comments?.length) throw new Error('截图测试数据格式无效');
    return data as DemoFixture;
  })();
}
async function search(keyword: string): Promise<Song[]> {
  const terms = keyword.toLocaleLowerCase().trim().split(/\s+/);
  return (await fixture()).searchResults.filter(song => {
    const text = `${song.name} ${song.artists} ${song.album}`.toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}
async function loadComments(selectedSongs: Song[]) {
  const data = await fixture();
  comments = fixtureComments(data, selectedSongs);
  loading = false;
  error = null;
  revision++;
}
async function initialize() {
  try {
    const data = await fixture();
    songs = [data.song];
    Object.assign(media, { title: data.song.name, artist: data.song.artists, album: data.song.album, duration: data.song.duration });
    position = Math.min(position, media.duration);
    await loadComments(songs);
  } catch (reason) { error = String(reason); loading = false; revision++; }
}
export async function demoInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  initialized ??= initialize();
  const now = Date.now();
  if (playing && !frozen) position = (position + now - sampled) % media.duration;
  sampled = now;
  let result: unknown = null;
  switch (command) {
    case 'get_player_state': {
      const state: Snapshot = { sampledAt: now, permissionGranted: true, nowPlaying: { ...media, position, isPlaying: playing, playbackSpeed: frozen ? 0 : 1, packageName: 'demo.player', playbackActions: 767 }, song: songs[0] || null, songs, comments, loading, error, revision, settings, manualMatch };
      result = state;
      break;
    }
    case 'plugin:media|overlay_status': result = { granted: true, running: false, supported: false }; break;
    case 'search_songs': result = await search(String(args?.keyword || '')); break;
    case 'get_song_comment_count': {
      const count = (await fixture()).commentCounts[String(args?.songId)];
      if (count === undefined) throw new Error('此歌曲的评论数尚未录入测试数据');
      result = count;
      break;
    }
    case 'update_settings': settings = args?.settings as typeof settings; revision++; break;
    case 'fetch_lyrics': {
      const data = await fixture();
      const id = Number(args?.songId);
      const lyrics = id === data.song.songId ? data.lyrics : data.tracks?.[id]?.lyrics;
      if (!lyrics) throw new Error('此歌曲的歌词尚未录入测试数据');
      result = lyrics;
      break;
    }
    case 'set_song_matches': {
      const selected = args?.songs as Song[];
      await loadComments(selected);
      songs = selected;
      manualMatch = true;
      break;
    }
    case 'retry_match': await initialize(); break;
    case 'plugin:media|control_playback': {
      const control = args?.control as { action?: string; position?: number } | undefined;
      if (control?.action === 'pause') playing = false;
      if (control?.action === 'play') playing = true;
      if (control?.action === 'seek' && typeof control.position === 'number') position = Math.max(0, Math.min(control.position, media.duration));
      break;
    }
    case 'plugin:media|set_keep_screen_on': break;
    case 'plugin:media|haptic_feedback': break;
    case 'check_update': result = { currentVersion: demoRelease.version, latest: demoRelease, currentRelease: demoRelease } satisfies UpdateStatus; break;
    case 'plugin:media|open_url': break;
    default: throw new Error(`浏览器演示暂不支持：${command}`);
  }
  return result as T;
}
