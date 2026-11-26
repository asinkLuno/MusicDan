import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { Dial, DialMark } from '@/components/ui/dial';
import { IconKey } from '@/components/ui/icon-key';
import { Key, KeyLamp } from '@/components/ui/key';
import { NumberWheel } from '@/components/ui/number-wheel';
import { Progress } from '@/components/ui/progress/progress';
import { cn } from '@/lib/utils';
import { PlaybackClock } from './playbackClock';
import { formatTime, trackKey } from './types';
import type { Snapshot, Song } from './types';
import { invoke } from './commands';

const LyricsSourceDialog = lazy(() => import('./LyricsSourceDialog'));

// Android PlaybackState action bits, supplied by the selected media session.
const actions = { pause: 2, play: 4, previous: 16, next: 32, seek: 256, toggle: 512 };
const PERCENT_FORMAT: Intl.NumberFormatOptions = { style: 'percent', maximumFractionDigits: 0 };
const MID_MARK = <DialMark value={0.5} tone="amber" />;

export const PlaybackControls = memo(function PlaybackControls({
  snapshot,
  onError,
  full,
  totalComments,
  visibleComments,
  loadingMore,
  lyricSongs,
  lyricKey,
  lyricSongId,
  onToggleFull,
  onOpenManualMatch,
  onSelectLyric,
}: {
  snapshot: Snapshot | null;
  onError: (error: unknown) => void;
  full: boolean;
  totalComments: number;
  visibleComments: number;
  loadingMore: boolean;
  lyricSongs: Song[];
  lyricKey: string;
  lyricSongId?: number;
  onToggleFull: () => void;
  onOpenManualMatch: () => void;
  onSelectLyric: (id: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [requested, setRequested] = useState<{
    action: 'play' | 'pause' | 'previous' | 'next';
    key: string;
    sentAt: number;
  } | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clock = useRef(new PlaybackClock());
  const [position, setPosition] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const previewRef = useRef<number | null>(null);
  const dragging = useRef(false);
  const seeking = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const previewing = preview != null;
  const awaiting = useRef<{ target: number; sentAt: number } | null>(null);
  const seekReleaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const np = snapshot?.nowPlaying;
  const duration = Math.max(0, np?.duration || 0);

  useEffect(() => {
    if (!requested || !np || !snapshot || snapshot.sampledAt <= requested.sentAt) return;
    const confirmed =
      requested.action === 'play'
        ? np.isPlaying
        : requested.action === 'pause'
          ? !np.isPlaying
          : trackKey(np) !== requested.key;
    if (confirmed) {
      setRequested(null);
      pending.current = false;
      setBusy(false);
      clearTimeout(releaseTimer.current);
    }
  }, [snapshot, np, requested]);

  const supported = np?.playbackActions || 0;
  const can = (action: keyof typeof actions) => Boolean(np?.packageName && !busy && supported & actions[action]);
  const playing = requested?.action === 'play' ? true : requested?.action === 'pause' ? false : np?.isPlaying === true;
  const canToggle = can(playing ? 'pause' : 'play') || can('toggle');
  const seekDisabled = !can('seek');

  useEffect(() => {
    clock.current.update(snapshot, performance.now(), Date.now());
    const request = awaiting.current;
    if (
      request &&
      snapshot &&
      snapshot.sampledAt > request.sentAt &&
      np &&
      Math.abs(np.position - request.target) < 1000
    ) {
      awaiting.current = null;
      previewRef.current = null;
      setPreview(null);
      clearTimeout(seekReleaseTimer.current);
    }
    if (!playing && !previewing) {
      const next = clock.current.position(performance.now());
      setPosition((previous) => (previous === next ? previous : next));
    }
  }, [snapshot, np, playing, previewing]);

  useEffect(() => {
    if (previewing) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    // 只在整秒边界唤醒，代替每 250ms 空转
    const sync = () => {
      clearTimeout(timer);
      timer = undefined;
      if (stopped || document.hidden) return;
      const next = clock.current.position(performance.now());
      setPosition((previous) => (Math.floor(previous / 1000) === Math.floor(next / 1000) ? previous : next));
      if (!playing) return;
      const speed = Math.max(0.1, np?.playbackSpeed ?? 1);
      timer = setTimeout(sync, (1000 - (next % 1000)) / speed + 8);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [playing, previewing, np?.playbackSpeed]);

  useEffect(
    () => () => {
      clearTimeout(releaseTimer.current);
      clearTimeout(seekReleaseTimer.current);
      clearTimeout(commitTimer.current);
    },
    [],
  );

  async function control(action: 'play' | 'pause' | 'previous' | 'next') {
    if (!np?.packageName || pending.current) return;
    pending.current = true;
    setBusy(true);
    setRequested({ action, key: trackKey(np), sentAt: Date.now() });
    releaseTimer.current = setTimeout(() => {
      pending.current = false;
      setBusy(false);
      setRequested(null);
    }, 2500);
    try {
      await invoke('plugin:media|control_playback', {
        control: { packageName: np.packageName, action, position: null },
      });
    } catch (error) {
      clearTimeout(releaseTimer.current);
      pending.current = false;
      setBusy(false);
      setRequested(null);
      onError(error);
    }
  }

  const seek = useCallback(
    async (value: number) => {
      if (!np?.packageName || seeking.current || seekDisabled) return;
      const target = Math.max(0, Math.min(duration, value));
      seeking.current = true;
      setSubmitting(true);
      previewRef.current = target;
      setPreview(target);
      clearTimeout(seekReleaseTimer.current);
      awaiting.current = { target, sentAt: Date.now() };
      try {
        await invoke('plugin:media|control_playback', {
          control: { packageName: np.packageName, action: 'seek', position: Math.round(target) },
        });
        if (awaiting.current)
          seekReleaseTimer.current = setTimeout(() => {
            awaiting.current = null;
            previewRef.current = null;
            setPreview(null);
          }, 2000);
      } catch (error) {
        awaiting.current = null;
        previewRef.current = null;
        setPreview(null);
        onError(error);
      } finally {
        seeking.current = false;
        setSubmitting(false);
      }
    },
    [duration, np?.packageName, onError, seekDisabled],
  );

  const displayed = Math.max(0, Math.min(duration, preview ?? position));
  const ratio = duration > 0 ? displayed / duration : 0;
  const dialDisabled = seekDisabled || submitting || duration <= 0;

  return (
    <div className="flex w-full min-w-0 items-center gap-3.5" aria-label="播放控制">
      <div
        className="flex shrink-0 flex-col items-center"
        onPointerDownCapture={() => {
          if (dialDisabled) return;
          dragging.current = true;
          clearTimeout(seekReleaseTimer.current);
          clearTimeout(commitTimer.current);
          awaiting.current = null;
          void invoke('plugin:media|haptic_feedback', { kind: 'start' }).catch(() => {});
        }}
        onPointerUpCapture={() => {
          if (!dragging.current) return;
          dragging.current = false;
          clearTimeout(commitTimer.current);
          if (previewRef.current != null) {
            void invoke('plugin:media|haptic_feedback', { kind: 'end' }).catch(() => {});
            void seek(previewRef.current);
          }
        }}
        onPointerCancelCapture={() => {
          dragging.current = false;
          clearTimeout(commitTimer.current);
          previewRef.current = null;
          setPreview(null);
        }}
      >
        <Dial
          className={cn(full ? 'w-20 gap-1' : 'w-24 gap-1.5')}
          min={0}
          max={1}
          step={0.01}
          ticks={20}
          value={ratio}
          disabled={dialDisabled}
          format={PERCENT_FORMAT}
          marks={MID_MARK}
          label="进度旋钮"
          onValueChange={(nextRatio) => {
            if (dialDisabled) return;
            const target = Math.round(nextRatio * duration);
            previewRef.current = target;
            setPreview(target);
            void invoke('plugin:media|haptic_feedback', { kind: 'tick' }).catch(() => {});
            if (!dragging.current) {
              clearTimeout(commitTimer.current);
              commitTimer.current = setTimeout(() => {
                void seek(target);
              }, 200);
            }
          }}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <NumberWheel value={totalComments} tone="black" className="text-sm" />
          <span className="truncate font-mono text-xs text-muted-foreground tabular-nums">
            条评论 · 显示 {visibleComments} 条{loadingMore ? ' · 后台补充中' : ''}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 font-mono text-xs tabular-nums">
            <div className="font-semibold text-primary">{formatTime(displayed)}</div>
            <div className="text-muted-foreground">{formatTime(duration)}</div>
          </div>
          <Progress value={ratio * 100} showValue={false} aria-label="播放进度" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <IconKey
              size="md"
              variant="secondary"
              aria-label="上一首"
              disabled={!can('previous')}
              onClick={() => void control('previous')}
            >
              <SkipBack />
            </IconKey>
            <Key
              size="md"
              variant="primary"
              aria-label={playing ? '暂停' : '播放'}
              pending={busy && (requested?.action === 'play' || requested?.action === 'pause')}
              disabled={!canToggle}
              onClick={() => void control(playing ? 'pause' : 'play')}
            >
              <KeyLamp />
              {playing ? <Pause /> : <Play />}
              <span>{playing ? '暂停' : '播放'}</span>
            </Key>
            <IconKey
              size="md"
              variant="secondary"
              aria-label="下一首"
              disabled={!can('next')}
              onClick={() => void control('next')}
            >
              <SkipForward />
            </IconKey>
          </div>
          <IconKey size="md" variant="secondary" aria-label={full ? '退出全屏' : '全屏弹幕'} onClick={onToggleFull}>
            {full ? <Minimize2 /> : <Maximize2 />}
          </IconKey>
        </div>
        {!full && (
          <div className="flex flex-wrap items-center gap-2">
            <Key size="sm" variant="secondary" aria-label="手动匹配" onClick={onOpenManualMatch}>
              手动匹配
            </Key>
            {lyricSongs.length > 1 && (
              <Suspense
                fallback={
                  <Key size="sm" variant="secondary" disabled>
                    歌词来源
                  </Key>
                }
              >
                <LyricsSourceDialog
                  key={lyricKey}
                  songs={lyricSongs}
                  selectedId={lyricSongId}
                  onSelect={onSelectLyric}
                />
              </Suspense>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
