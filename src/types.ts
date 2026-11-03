export interface Song { songId: number; name: string; artists: string; album: string; duration: number }
export interface Comment { commentId: number; content: string; liked_count: number; time: number; occurrences?: number }
export interface NowPlaying { title: string; artist: string; album: string; position: number; duration: number; isPlaying: boolean; playbackSpeed: number; packageName?: string; playbackActions?: number }
export interface Settings { fontSize: number; opacity: number; commentLimit: number | null; commentRefreshPercent: number; keepScreenOnFullscreen: boolean; pinLongComments: boolean }
export interface Snapshot { sampledAt: number; permissionGranted: boolean; nowPlaying: NowPlaying | null; song: Song | null; songs?: Song[]; comments: Comment[]; loading: boolean; error: string | null; revision: number; settings: Settings; manualMatch: boolean }
export const defaults: Settings = { fontSize: 16, opacity: .8, commentLimit: 1000, commentRefreshPercent: 10, keepScreenOnFullscreen: false, pinLongComments: true };
export const trackKey = (np: NowPlaying) => `${np.title}|${np.artist}|${np.album}`;
export function formatTime(ms: number) { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = (window as unknown as { __TAURI__?: { core: { invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T> } } }).__TAURI__;
  if (!tauri && import.meta.env.DEV && ['creep', 'november-rain'].includes(new URLSearchParams(window.location.search).get('demo') || '')) {
    return import('./browser-demo').then(module => module.demoInvoke<T>(command, args));
  }
  return tauri ? tauri.core.invoke<T>(command, args) : Promise.reject(new Error('请在安卓应用中使用此功能'));
}

export function durationsMatch(candidate: number, playing: number) { return candidate > 0 && playing > 0 && Math.abs(candidate - playing) <= 1500; }
