import type { Settings, Snapshot, Song } from './types';
import type { Lyrics } from './lyrics';
import type { UpdateStatus } from './release';

interface OverlayStatus {
  granted: boolean;
  running: boolean;
  supported: boolean;
}

interface CommandMap {
  get_player_state: {
    args: { sinceRevision?: number };
    result: Omit<Snapshot, 'comments'> & { comments?: Snapshot['comments'] };
  };
  update_settings: { args: { settings: Settings }; result: void };
  search_songs: { args: { keyword: string }; result: Song[] };
  get_song_comment_count: { args: { songId: number }; result: number };
  set_song_matches: { args: { key: string; songs: Song[] }; result: void };
  retry_match: { args: undefined; result: void };
  check_update: { args: undefined; result: UpdateStatus };
  fetch_lyrics: { args: { songId: number }; result: Lyrics };
  'plugin:media|overlay_status': { args: undefined; result: OverlayStatus };
  'plugin:media|set_keep_screen_on': { args: { enabled: boolean }; result: void };
  'plugin:media|open_overlay_settings': { args: undefined; result: void };
  'plugin:media|set_overlay': { args: { enabled: boolean }; result: void };
  'plugin:media|control_playback': {
    args: {
      control: {
        packageName: string;
        action: 'play' | 'pause' | 'previous' | 'next' | 'seek';
        position: number | null;
      };
    };
    result: void;
  };
  'plugin:media|open_permission_settings': { args: undefined; result: void };
  'plugin:media|haptic_feedback': { args: { kind: 'start' | 'tick' | 'end' }; result: void };
  'plugin:media|open_url': { args: { url: string }; result: void };
}

export function invoke<K extends keyof CommandMap>(
  command: K,
  ...args: CommandMap[K]['args'] extends undefined ? [] : [CommandMap[K]['args']]
): Promise<CommandMap[K]['result']> {
  const tauri = (
    window as unknown as {
      __TAURI__?: {
        core: {
          invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
        };
      };
    }
  ).__TAURI__;
  const payload = args[0] as Record<string, unknown> | undefined;
  if (
    !tauri &&
    import.meta.env.DEV &&
    ['creep', 'november-rain'].includes(new URLSearchParams(window.location.search).get('demo') || '')
  ) {
    return import('./browser-demo').then((module) => module.demoInvoke(command, payload)) as Promise<
      CommandMap[K]['result']
    >;
  }
  return tauri
    ? tauri.core.invoke<CommandMap[K]['result']>(command, payload)
    : Promise.reject(new Error('请在安卓应用中使用此功能'));
}
