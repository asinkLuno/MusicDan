import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ScrollView, Text, useMedia, XStack, YStack } from 'tamagui';
import { Play } from './icons';
import { activeLine, prepareLyrics } from './lyrics';
import type { LyricLine, Lyrics } from './lyrics';
import { PlaybackClock } from './playbackClock';
import { musicAtmosphere } from './tamagui.config';
import { formatTime } from './types';
import { invoke } from './commands';
import type { Snapshot } from './types';

// Row pitch follows the lyric font size so lines stay close: one focused line
// (LYRIC_FONT_SIZE × LYRIC_LINE_HEIGHT) plus roughly one blank line of air.
const LYRIC_FONT_SIZE = 28;
const LYRIC_LINE_HEIGHT = 1.36;
const TRANSLATION_FONT_SIZE = 20;
// 聚焦与非聚焦行保持同一排版字号，仅通过 GPU scale/opacity 过渡，避免切行或拖动时重排。
const UNFOCUSED_SCALE = 0.82;
const LYRIC_ROW_TRANSITION = { opacity: 'quickLessBouncy', transform: 'quickLessBouncy' } as const;
// 行高由每行内容实测（onLayout），避免两行正文加翻译被固定行距裁剪；
// 首尾留白跟随实际行高，保证第一行和最后一行也能居中。
const EST_ROW_HEIGHT = 96;

export const LyricsBackground = memo(function LyricsBackground({
  snapshot,
  songId,
  onError,
}: {
  snapshot: Snapshot | null;
  songId?: number;
  onError: (error: unknown) => void;
}) {
  const { reduceMotion } = useMedia();
  const [result, setResult] = useState<{ id: number; data?: Lyrics; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [position, setPosition] = useState(0);
  const [height, setHeight] = useState(0);
  const [browsing, setBrowsing] = useState(false);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState<{ target: number; sentAt: number } | null>(null);
  const scroll = useRef<ScrollView>(null);
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
  const lineCount = parsed.lines.length;
  const index = activeLine(parsed.lines, requested?.target ?? (playing ? position : (np?.position ?? position)));
  const center = Math.max(0, index);
  const canSeek = Boolean(
    np?.packageName &&
    np.duration > 0 &&
    (np.playbackActions || 0) & 256 &&
    (playing || (np.playbackActions || 0) & (4 | 512)),
  );

  // Keep measurements tied to the lyric result and reactive so wrapping and
  // viewport resizing trigger a new centering pass.
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
  const reportHeight = useCallback(
    (lineIndex: number, rowHeight: number) => {
      setMeasurements((previous) => {
        const same = previous.source === parsed;
        const current = same ? previous.heights : [];
        const prevHeight = current[lineIndex];
        if (prevHeight === rowHeight) return previous;
        const next = [...current];
        next[lineIndex] = rowHeight;
        const prevCount = same ? previous.count : 0;
        const delta = (rowHeight > 0 ? 1 : 0) - ((prevHeight ?? 0) > 0 ? 1 : 0);
        return { source: parsed, heights: next, count: prevCount + delta };
      });
    },
    [parsed],
  );
  const topPadding = Math.max(0, (height - (heights[0] ?? EST_ROW_HEIGHT)) / 2);
  const bottomPadding = Math.max(0, (height - (heights[lineCount - 1] ?? EST_ROW_HEIGHT)) / 2);
  const offsets = useMemo(() => {
    const result: number[] = [];
    let y = topPadding;
    for (let i = 0; i < lineCount; i++) {
      result.push(y);
      y += heights[i] ?? EST_ROW_HEIGHT;
    }
    return result;
  }, [topPadding, heights, lineCount]);
  const centerScroll = useCallback(
    (line: number): number => {
      return Math.max(0, (offsets[line] ?? 0) - Math.max(0, height - (heights[line] ?? 0)) / 2);
    },
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
    scroll.current?.scrollTo({ y: centerScroll(center), animated: initialized.current && !reduceMotion });
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
    // Wait for touch momentum or wheel scrolling to settle, then center the nearest line.
    snapTimer.current = setTimeout(() => {
      const target = Math.max(0, Math.min(lineCount - 1, nearestRow(offset.current)));
      if (manual.current && Math.abs(offset.current - centerScroll(target)) > 1) {
        scroll.current?.scrollTo({ y: centerScroll(target), animated: !reduceMotion });
      }
    }, 180);
    returnTimer.current = setTimeout(follow, 5000);
  }
  function browse() {
    if (!manual.current) {
      scroll.current?.scrollTo({ y: offset.current, animated: false });
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
      <YStack position="absolute" inset={0} alignItems="center" justifyContent="center" gap="3" padding="4">
        <Text textAlign="center">歌词加载失败</Text>
        <Button size="sm" onPress={() => setRetry((value) => value + 1)}>
          重试歌词
        </Button>
      </YStack>
    ) : null;
  return (
    <YStack
      position="absolute"
      inset={0}
      zIndex={0}
      overflow="hidden"
      contain="layout paint"
      aria-label="同步歌词"
      backgroundColor="lyricSurface"
      backgroundImage={musicAtmosphere.lyrics}
    >
      <ScrollView
        ref={scroll}
        flex={1}
        minHeight={0}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        showsVerticalScrollIndicator={false}
        tabIndex={0}
        aria-label="上下滑动浏览歌词"
        scrollEventThrottle={16}
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
          offset.current = event.nativeEvent.contentOffset.y;
          if (!manual.current) return;
          updateSelected(nearestRow(offset.current));
          if (!dragging.current) scheduleReturn();
        }}
      >
        <YStack flexShrink={0} paddingTop={topPadding} paddingBottom={bottomPadding}>
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
              onHeight={reportHeight}
            />
          ))}
        </YStack>
      </ScrollView>
      <YStack position="absolute" inset={0} pointerEvents="none" backgroundImage={musicAtmosphere.lyricEdges} />
      {browsing && (
        <>
          <XStack
            position="absolute"
            top="50%"
            left="3"
            right="3"
            height={44}
            y={-22}
            alignItems="center"
            gap="2"
            pointerEvents="box-none"
          >
            <Button
              circular
              size="sm"
              width={44}
              height={44}
              minWidth={44}
              disabled={!canSeek || busy}
              aria-label={`从 ${formatTime(parsed.lines[selected]?.start ?? 0)} 播放`}
              onPress={() => void playSelected()}
              icon={<Play size={20} />}
            />
            <YStack flex={1} height={1} backgroundColor="border-color" opacity={0.5} pointerEvents="none" />
            <Text fontSize="xs" color="color-10" pointerEvents="none">
              {formatTime(parsed.lines[selected]?.start ?? 0)}
            </Text>
          </XStack>
          <YStack position="absolute" bottom="2" alignSelf="center" gap="1" alignItems="center">
            {!canSeek && (
              <Text fontSize="xs" color="color-10">
                当前音乐 App 不支持从歌词定位播放
              </Text>
            )}
            <Button size="sm" onPress={follow}>
              回到当前
            </Button>
          </YStack>
        </>
      )}
    </YStack>
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
  onHeight,
}: {
  line: LyricLine;
  translation?: string;
  active: boolean;
  nearby: boolean;
  selected: boolean;
  reduceMotion: boolean;
  lineIndex: number;
  onHeight: (lineIndex: number, height: number) => void;
}) {
  const focused = active || selected;
  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      onHeight(lineIndex, event.nativeEvent.layout.height);
    },
    [lineIndex, onHeight],
  );
  // Measure the unscaled layout; the visual scale belongs to the inner row.
  return (
    <YStack
      width="100%"
      maxWidth={720}
      alignSelf="center"
      flexShrink={0}
      contain="layout style"
      onLayout={handleLayout}
    >
      <YStack
        width="100%"
        paddingHorizontal={28}
        paddingVertical={Math.round(LYRIC_FONT_SIZE * 0.55)}
        gap="3"
        alignItems="center"
        justifyContent="center"
        transition={reduceMotion ? 'none' : LYRIC_ROW_TRANSITION}
        scale={focused ? 1 : UNFOCUSED_SCALE}
        opacity={focused ? 1 : nearby ? 0.38 : 0.16}
      >
        <Text
          fontSize={LYRIC_FONT_SIZE}
          lineHeight={LYRIC_LINE_HEIGHT}
          fontWeight="700"
          backgroundImage={focused ? musicAtmosphere.lyricInk : undefined}
          backgroundClip={focused ? 'text' : undefined}
          color={focused ? 'transparent' : nearby ? 'lyricNearby' : 'lyricRest'}
          textAlign="center"
        >
          {line.text}
        </Text>
        {translation && (
          <Text
            fontSize={TRANSLATION_FONT_SIZE}
            lineHeight={1.4}
            color="lyricTranslation"
            opacity={focused ? 0.76 : 0.65}
            textAlign="center"
          >
            {translation}
          </Text>
        )}
      </YStack>
    </YStack>
  );
});
