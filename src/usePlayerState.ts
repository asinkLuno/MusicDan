import { useCallback, useEffect, useRef, useState } from 'react';
import { defaults } from './types';
import { invoke } from './commands';
import type { Settings, Snapshot } from './types';

interface OverlayStatus {
  granted: boolean;
  running: boolean;
  supported: boolean;
}

const CLOCK_DRIFT_MS = 150;
const CLOCK_SYNC_MS = 3000;

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
  const [commentLimitDraft, setCommentLimitDraft] = useState(String(defaults.commentLimit ?? ''));
  const [overlay, setOverlay] = useState<OverlayStatus>({ granted: false, running: false, supported: true });
  const [error, setError] = useState('');
  const initialized = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);

  useEffect(() => {
    let stopped = false;
    let revision: number | undefined;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const [state, status] = await Promise.all([
          invoke('get_player_state', {
            sinceRevision: revision,
          }),
          invoke('plugin:media|overlay_status'),
        ]);
        if (stopped) return;
        revision = state.revision;
        setSnapshot((previous) => {
          const merged: Snapshot = { ...state, comments: state.comments ?? previous?.comments ?? [] };
          return sameSnapshot(previous, merged) ? previous : merged;
        });
        setOverlay((previous) =>
          previous.granted === status.granted &&
          previous.running === status.running &&
          previous.supported === status.supported
            ? previous
            : status,
        );
        if (!initialized.current) {
          initialized.current = true;
          setCfg(state.settings);
          setCommentLimitDraft(state.settings.commentLimit == null ? '' : String(state.settings.commentLimit));
        }
      } catch (e) {
        if (!stopped) fail(e);
      }
      if (!stopped) timer = setTimeout(poll, 750);
    }

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [fail]);

  const change = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...cfg, ...patch };
      setCfg(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void invoke('update_settings', { settings: next }).catch(fail);
      }, 180);
    },
    [cfg, fail],
  );

  return { snapshot, cfg, commentLimitDraft, setCommentLimitDraft, overlay, setOverlay, error, setError, fail, change };
}
