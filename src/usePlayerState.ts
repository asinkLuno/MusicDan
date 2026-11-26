import { useCallback, useEffect, useRef, useState } from 'react';
import { defaults } from './types';
import { invoke } from './commands';
import type { Settings, Snapshot } from './types';

export interface OverlayStatus {
  granted: boolean;
  running: boolean;
  supported: boolean;
}

const CLOCK_DRIFT_MS = 150;
const CLOCK_SYNC_MS = 3000;
const POLL_INTERVAL_MS = 750;
// 悬浮窗状态只会在设置页改变，低频同步即可
const OVERLAY_SYNC_MS = 5000;

function sameSnapshot(previous: Snapshot | null, next: Snapshot): boolean {
  if (!previous) return false;
  if (
    previous.revision !== next.revision ||
    previous.loading !== next.loading ||
    previous.error !== next.error ||
    previous.permissionGranted !== next.permissionGranted ||
    previous.manualMatch !== next.manualMatch
  ) {
    return false;
  }
  const a = previous.nowPlaying;
  const b = next.nowPlaying;
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.title !== b.title ||
    a.artist !== b.artist ||
    a.album !== b.album ||
    a.duration !== b.duration ||
    a.isPlaying !== b.isPlaying ||
    a.playbackSpeed !== b.playbackSpeed ||
    a.packageName !== b.packageName ||
    a.playbackActions !== b.playbackActions
  ) {
    return false;
  }
  if (!b.isPlaying) return a.position === b.position;
  const elapsed = Math.max(0, next.sampledAt - previous.sampledAt);
  if (elapsed >= CLOCK_SYNC_MS) return false;
  const expected = a.position + elapsed * b.playbackSpeed;
  return Math.abs(b.position - expected) < CLOCK_DRIFT_MS;
}

export function usePlayerState() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [cfg, setCfg] = useState<Settings>(defaults);
  const [overlay, setOverlay] = useState<OverlayStatus>({ granted: false, running: false, supported: true });
  const [error, setError] = useState('');
  const initialized = useRef(false);
  const pendingSettings = useRef<Settings | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // change() 要在 updater 之外算下一份设置，updater 里不能写 ref / 起定时器
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let revision: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let overlayAt = 0;

    function schedule() {
      if (stopped || document.hidden) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    }

    async function poll() {
      if (stopped || document.hidden || inFlight) return;
      inFlight = true;
      try {
        const syncOverlay = Date.now() - overlayAt >= OVERLAY_SYNC_MS;
        if (syncOverlay) overlayAt = Date.now();
        const [state, status] = await Promise.all([
          invoke('get_player_state', {
            sinceRevision: revision,
          }),
          syncOverlay ? invoke('plugin:media|overlay_status') : null,
        ]);
        if (stopped) return;
        revision = state.revision;
        setSnapshot((previous) => {
          const merged: Snapshot = { ...state, comments: state.comments ?? previous?.comments ?? [] };
          return sameSnapshot(previous, merged) ? previous : merged;
        });
        if (status) {
          setOverlay((previous) =>
            previous.granted === status.granted &&
            previous.running === status.running &&
            previous.supported === status.supported
              ? previous
              : status,
          );
        }
        if (!initialized.current) {
          initialized.current = true;
          setCfg(state.settings);
        }
      } catch (e) {
        if (!stopped) fail(e);
      } finally {
        inFlight = false;
      }
      schedule();
    }

    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTimeout(timer);
        timer = undefined;
      } else {
        void poll();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fail]);

  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        if (pendingSettings.current) {
          const toFlush = pendingSettings.current;
          pendingSettings.current = null;
          void invoke('update_settings', { settings: toFlush }).catch(() => {});
        }
      }
    },
    [],
  );

  const change = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...cfgRef.current, ...patch };
      cfgRef.current = next;
      setCfg(next);
      pendingSettings.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        const settings = pendingSettings.current;
        pendingSettings.current = null;
        if (settings) void invoke('update_settings', { settings }).catch(fail);
      }, 180);
    },
    [fail],
  );

  return { snapshot, cfg, overlay, setOverlay, error, setError, fail, change };
}
