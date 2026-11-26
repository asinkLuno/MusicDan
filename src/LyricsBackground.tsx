import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { IconKey } from '@/components/ui/icon-key';
import { Key } from '@/components/ui/key';
import { Separator } from '@/components/ui/separator/separator';
import { cn } from '@/lib/utils';
import { activeLine, prepareLyrics } from './lyrics';
import type { LyricLine, Lyrics } from './lyrics';
import { PlaybackClock } from './playbackClock';
import { formatTime } from './types';
import { invoke } from './commands';
import type { Snapshot } from './types';
import { useReducedMotion } from './useReducedMotion';

const EST_ROW_HEIGHT = 76;

export const LyricsBackground = memo(function LyricsBackground({
  snapshot,
  songId,
  onError,
}: {
  snapshot: Snapshot | null;
  songId?: number;
  onError: (error: unknown) => void;
}) {
  const reduceMotion = useReducedMotion();

  const [result, setResult] = useState<{ id: number; data?: Lyrics; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [position, setPosition] = useState(0);
  const [height, setHeight] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState<{ target: number; sentAt: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const offset = useRef(0);
  const selectedRef = useRef(0);
  const manual = useRef(false);
  const dragging = useRef(false);
  const submitting = useRef(false);
  const initialized = useRef(false);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clock = useRef(new PlaybackClock());
  const np = snapshot?.nowPlaying;
  const playing = Boolean(np?.isPlaying);

  useEffect(() => {
    clock.current.update(snapshot, performance.now(), Date.now());
    if (
      requested &&
      snapshot &&
      np &&
      snapshot.sampledAt > requested.sentAt &&
      Math.abs(np.position - requested.target) < 1000
    ) {
      clearTimeout(requestTimer.current);
      setRequested(null);
    }
  }, [snapshot, np, requested]);

  useEffect(
    () => () => {
      clearTimeout(returnTimer.current);
      clearTimeout(snapTimer.current);
      clearTimeout(requestTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!songId) return;
    let cancelled = false;
    setResult(null);
    void invoke('fetch_lyrics', { songId }).then(
      (data) => {
        if (!cancelled) setResult({ id: songId, data });
      },
      (error) => {
        if (!cancelled) setResult({ id: songId, error: String(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [songId, retry]);

  const data = result && result.id === songId ? result.data : undefined;
  const parsed = useMemo(() => prepareLyrics(data), [data]);
  const lineCount = parsed.lines.length;
  const hasLines = lineCount > 0;

  useEffect(() => {
    if (!hasLines) return;
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setHeight(el.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasLines]);

  useEffect(() => {
    if (!parsed.lines.length) return;
    const tick = () => {
      if (!document.hidden)
        setPosition((previous) => {
          const next = clock.current.position(performance.now());
          return activeLine(parsed.lines, previous) === activeLine(parsed.lines, next) ? previous : next;
        });
    };
    tick();
    if (!playing) return;
    const timer = setInterval(tick, 100);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [parsed.lines, playing]);

  const index = activeLine(parsed.lines, requested?.target ?? (playing ? position : (np?.position ?? position)));
  const center = Math.max(0, index);
  const canSeek = Boolean(
    np?.packageName &&
    np.duration > 0 &&
    (np.playbackActions || 0) & 256 &&
    (playing || (np.playbackActions || 0) & (4 | 512)),
  );

  const [measurements, setMeasurements] = useState<{ source: typeof parsed; heights: number[]; count: number }>({
    source: parsed,
    heights: [],
    count: 0,
  });
  const heights = useMemo(() => (measurements.source === parsed ? measurements.heights : []), [measurements, parsed]);
  const measured = lineCount > 0 && measurements.source === parsed && measurements.count === lineCount;

  useEffect(() => {
    initialized.current = false;
    selectedRef.current = 0;
  }, [parsed]);

  // Single shared ResizeObserver across all lyric rows batches height updates per frame.
  const parsedRef = useRef(parsed);
  parsedRef.current = parsed;
  const rowIndexMap = useRef(new WeakMap<Element, number>());
  const rowObserver = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const updates: Array<[number, number]> = [];
      for (const entry of entries) {
        const rowIndex = rowIndexMap.current.get(entry.target);
        if (rowIndex != null) updates.push([rowIndex, entry.target.getBoundingClientRect().height]);
      }
      if (!updates.length) return;
      const source = parsedRef.current;
      setMeasurements((previous) => {
        const same = previous.source === source;
        let next = same ? previous.heights : [];
        let count = same ? previous.count : 0;
        let changed = !same;
        for (const [rowIndex, rowHeight] of updates) {
          const prevHeight = next[rowIndex];
          if (prevHeight === rowHeight) continue;
          if (!changed) {
            next = [...next];
            changed = true;
          }
          next[rowIndex] = rowHeight;
          count += (rowHeight > 0 ? 1 : 0) - ((prevHeight ?? 0) > 0 ? 1 : 0);
        }
        return changed ? { source, heights: next, count } : previous;
      });
    });
    rowObserver.current = observer;
    return () => {
      observer.disconnect();
      rowObserver.current = null;
    };
  }, []);

  const observeRow = useCallback((el: HTMLDivElement, lineIndex: number) => {
    rowIndexMap.current.set(el, lineIndex);
    rowObserver.current?.observe(el);
    return () => {
      rowObserver.current?.unobserve(el);
      rowIndexMap.current.delete(el);
    };
  }, []);

  const topPadding = Math.max(0, (height - (heights[0] ?? EST_ROW_HEIGHT)) / 2);
  const bottomPadding = Math.max(0, (height - (heights[lineCount - 1] ?? EST_ROW_HEIGHT)) / 2);
  const offsets = useMemo(() => {
    const out: number[] = [];
    let y = topPadding;
    for (let i = 0; i < lineCount; i++) {
      out.push(y);
      y += heights[i] ?? EST_ROW_HEIGHT;
    }
    return out;
  }, [topPadding, heights, lineCount]);

  const centerScroll = useCallback(
    (line: number): number => Math.max(0, (offsets[line] ?? 0) - Math.max(0, height - (heights[line] ?? 0)) / 2),
    [height, offsets, heights],
  );

  const nearestRow = useCallback(
    (offsetY: number): number => {
      const count = offsets.length;
      if (count <= 1) return 0;
      const viewportCenter = offsetY + height / 2;
      let low = 0;
      let high = count - 1;
      while (low < high) {
        const mid = (low + high) >>> 1;
        const midCenter = offsets[mid] + (heights[mid] ?? EST_ROW_HEIGHT) / 2;
        if (midCenter < viewportCenter) low = mid + 1;
        else high = mid;
      }
      if (low === 0) return 0;
      const currDist = Math.abs(offsets[low] + (heights[low] ?? EST_ROW_HEIGHT) / 2 - viewportCenter);
      const prevDist = Math.abs(offsets[low - 1] + (heights[low - 1] ?? EST_ROW_HEIGHT) / 2 - viewportCenter);
      return prevDist <= currDist ? low - 1 : low;
    },
    [height, offsets, heights],
  );

  useEffect(() => {
    if (browsing || !height || !lineCount || !measured) return;
    scrollRef.current?.scrollTo({
      top: centerScroll(center),
      behavior: initialized.current && !reduceMotion ? 'smooth' : 'auto',
    });
    initialized.current = true;
  }, [center, browsing, height, lineCount, measured, parsed, reduceMotion, centerScroll]);

  function updateSelected(next: number) {
    const clamped = Math.max(0, Math.min(lineCount - 1, next));
    if (selectedRef.current === clamped) return;
    selectedRef.current = clamped;
    setSelected(clamped);
  }
  function follow() {
    clearTimeout(returnTimer.current);
    clearTimeout(snapTimer.current);
    manual.current = false;
    setBrowsing(false);
  }
  function scheduleReturn() {
    clearTimeout(returnTimer.current);
    clearTimeout(snapTimer.current);
    if (dragging.current) return;
    snapTimer.current = setTimeout(() => {
      const target = Math.max(0, Math.min(lineCount - 1, nearestRow(offset.current)));
      if (manual.current && Math.abs(offset.current - centerScroll(target)) > 1) {
        scrollRef.current?.scrollTo({
          top: centerScroll(target),
          behavior: reduceMotion ? 'auto' : 'smooth',
        });
      }
    }, 180);
    returnTimer.current = setTimeout(follow, 5000);
  }
  function browse() {
    if (!manual.current) {
      scrollRef.current?.scrollTo({ top: offset.current, behavior: 'auto' });
      manual.current = true;
      setBrowsing(true);
    }
    updateSelected(nearestRow(offset.current));
    if (dragging.current) {
      clearTimeout(returnTimer.current);
      clearTimeout(snapTimer.current);
    } else {
      scheduleReturn();
    }
  }
  function endDrag() {
    dragging.current = false;
    if (manual.current) scheduleReturn();
  }
  async function playSelected() {
    const line = parsed.lines[selected];
    if (!line || !np?.packageName || !canSeek || submitting.current) return;
    const target = Math.max(0, Math.min(np.duration, line.start));
    submitting.current = true;
    setBusy(true);
    setRequested({ target, sentAt: Date.now() });
    follow();
    clearTimeout(requestTimer.current);
    requestTimer.current = setTimeout(() => setRequested(null), 2500);
    try {
      await invoke('plugin:media|control_playback', {
        control: { packageName: np.packageName, action: 'seek', position: Math.round(target) },
      });
      if (!np.isPlaying)
        await invoke('plugin:media|control_playback', {
          control: { packageName: np.packageName, action: 'play', position: null },
        });
    } catch (error) {
      clearTimeout(requestTimer.current);
      setRequested(null);
      onError(error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (!np || !songId) return null;
  if (!parsed.lines.length)
    return result?.id === songId && result.error ? (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
        <p className="text-center text-sm text-muted-foreground">歌词加载失败</p>
        <Key size="sm" variant="secondary" onClick={() => setRetry((value) => value + 1)}>
          重试歌词
        </Key>
      </div>
    ) : null;

  return (
    <div aria-label="同步歌词" className="absolute inset-0 z-0 overflow-hidden">
      <div
        ref={scrollRef}
        tabIndex={0}
        aria-label="上下滑动浏览歌词"
        className="h-full w-full overflow-y-auto outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={browse}
        onPointerDown={() => {
          dragging.current = true;
          browse();
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onKeyDown={(event) => {
          if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) browse();
        }}
        onScroll={(event) => {
          offset.current = event.currentTarget.scrollTop;
          if (!manual.current) return;
          updateSelected(nearestRow(offset.current));
          if (!dragging.current) scheduleReturn();
        }}
      >
        <div className="flex flex-col" style={{ paddingTop: topPadding, paddingBottom: bottomPadding }}>
          {parsed.lines.map((line, lineIndex) => (
            <LyricRow
              key={`${line.start}:${lineIndex}`}
              line={line}
              translation={parsed.translations.get(line.start)}
              active={lineIndex === index}
              nearby={Math.abs(lineIndex - (browsing ? selected : center)) <= 1}
              selected={browsing && lineIndex === selected}
              reduceMotion={reduceMotion}
              lineIndex={lineIndex}
              onObserve={observeRow}
            />
          ))}
        </div>
      </div>
      {browsing && (
        <>
          <div className="pointer-events-none absolute top-1/2 right-3 left-3 z-30 flex -translate-y-1/2 items-center gap-2">
            <IconKey
              variant="primary"
              size="sm"
              className="pointer-events-auto"
              disabled={!canSeek || busy}
              aria-label={`从 ${formatTime(parsed.lines[selected]?.start ?? 0)} 播放`}
              onClick={() => void playSelected()}
            >
              <Play />
            </IconKey>
            <Separator className="flex-1" />
            <span className="font-mono text-xs font-semibold text-primary tabular-nums">
              {formatTime(parsed.lines[selected]?.start ?? 0)}
            </span>
          </div>
          <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1">
            {!canSeek && <span className="text-xs text-muted-foreground">当前音乐 App 不支持从歌词定位播放</span>}
            <Key size="sm" variant="secondary" onClick={follow}>
              回到当前
            </Key>
          </div>
        </>
      )}
    </div>
  );
});

const LyricRow = memo(function LyricRow({
  line,
  translation,
  active,
  nearby,
  selected,
  reduceMotion,
  lineIndex,
  onObserve,
}: {
  line: LyricLine;
  translation?: string;
  active: boolean;
  nearby: boolean;
  selected: boolean;
  reduceMotion: boolean;
  lineIndex: number;
  onObserve: (el: HTMLDivElement, lineIndex: number) => () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const focused = active || selected;

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    return onObserve(el, lineIndex);
  }, [lineIndex, onObserve, line.text, translation]);

  return (
    <div ref={rowRef} className="mx-auto w-full max-w-[720px] shrink-0">
      <div
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 px-7 py-3 text-center',
          !reduceMotion && 'transition-[transform,opacity] duration-200 ease-out',
          focused ? 'scale-100 opacity-100' : nearby ? 'scale-[0.82] opacity-60' : 'scale-[0.82] opacity-25',
        )}
      >
        <p
          className={cn(
            'm-0 text-2xl leading-snug font-bold',
            focused ? 'text-foreground [text-shadow:var(--text-glow-amber)]' : 'text-muted-foreground',
          )}
        >
          {line.text}
        </p>
        {translation && (
          <p className={cn('m-0 text-base text-muted-foreground', focused ? 'opacity-90' : 'opacity-55')}>
            {translation}
          </p>
        )}
      </div>
    </div>
  );
});
