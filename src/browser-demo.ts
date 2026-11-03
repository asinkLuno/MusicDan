import { defaults, type Comment, type Snapshot, type Song } from './types';
import { fixtureComments, type DemoFixture } from './demoFixture';

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
    default: throw new Error(`浏览器演示暂不支持：${command}`);
  }
  return result as T;
}
