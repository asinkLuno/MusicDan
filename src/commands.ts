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
  download_update: { args: { url: string; sha256: string }; result: DownloadResult };
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
  'plugin:media|install_permission': { args: undefined; result: InstallPermission };
  'plugin:media|open_install_permission_settings': { args: undefined; result: void };
  'plugin:media|install_apk': { args: { path: string }; result: void };
}

/** 应用内下载完成的安装包：path 位于应用缓存 updates/ 目录，已通过 SHA-256 校验 */
export interface DownloadResult {
  path: string;
  bytes: number;
}

/** 下载进度事件 payload（total 未知时为 0） */
export interface DownloadProgress {
  received: number;
  total: number;
}

/** 「安装未知应用」授权状态（supported=false 表示当前平台不支持应用内安装） */
export interface InstallPermission {
  supported: boolean;
  granted: boolean;
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

/** 订阅原生事件（如 update://progress）；浏览器演示下返回空的取消函数 */
export async function listen<T>(event: string, handler: (payload: T) => void): Promise<() => void> {
  const eventApi = (
    window as unknown as {
      __TAURI__?: {
        event?: {
          listen: <P>(event: string, handler: (received: { payload: P }) => void) => Promise<() => void>;
        };
      };
    }
  ).__TAURI__?.event;
  if (!eventApi) return () => {};
  return eventApi.listen<T>(event, (received) => handler(received.payload));
}
