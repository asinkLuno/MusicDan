import { useCallback, useEffect, useRef, useState } from 'react';
import { defaults } from './types';
import { invoke } from './commands';
import type { Settings, Snapshot } from './types';

interface OverlayStatus {
  granted: boolean;
  running: boolean;
  supported: boolean;
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
        setSnapshot((previous) => ({ ...state, comments: state.comments ?? previous?.comments ?? [] }));
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
