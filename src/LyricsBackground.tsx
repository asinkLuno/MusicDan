import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ScrollView, Text, useMedia, XStack, YStack } from 'tamagui';
import { Play } from './icons';
import { activeLine, prepareLyrics } from './lyrics';
import type { LyricLine, Lyrics } from './lyrics';
import { PlaybackClock } from './playbackClock';
import { musicAtmosphere } from './tamagui.config';
import { formatTime, invoke } from './types';
import type { Snapshot } from './types';

// Row pitch follows the lyric font size so lines stay close: one focused line
// (LYRIC_FONT_SIZE × LYRIC_LINE_HEIGHT) plus roughly one blank line of air.
const LYRIC_FONT_SIZE = 28;
const LYRIC_LINE_HEIGHT = 1.36;
const TRANSLATION_FONT_SIZE = 20;
// 行高由每行内容实测（onLayout），避免两行正文加翻译被固定行距裁剪；
// 首尾留白跟随实际行高，保证第一行和最后一行也能居中。
const EST_ROW_HEIGHT = 96;

export function LyricsBackground({ snapshot, songId, onError }: {
  snapshot: Snapshot | null; songId?: number; onError: (error: unknown) => void;
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
  const manual = useRef(false);
  const dragging = useRef(false);
  const submitting = useRef(false);
  const initialized = useRef(false);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clock = useRef(new PlaybackClock());
  const np = snapshot?.nowPlaying;

  useEffect(() => {
    clock.current.update(snapshot, performance.now(), Date.now());
    if (requested && snapshot && np && snapshot.sampledAt > requested.sentAt
      && Math.abs(np.position - requested.target) < 1000) {
      clearTimeout(requestTimer.current);
      setRequested(null);
    }
  }, [snapshot, np, requested]);
  useEffect(() => () => {
    clearTimeout(returnTimer.current);
    clearTimeout(snapTimer.current);
    clearTimeout(requestTimer.current);
  }, []);
  useEffect(() => {
    if (!songId) return;
    let cancelled = false;
    setResult(null);
    void invoke<Lyrics>('fetch_lyrics', { songId }).then(data => { if (!cancelled) setResult({ id: songId, data }); }, error => { if (!cancelled) setResult({ id: songId, error: String(error) }); });
    return () => { cancelled = true; };
  }, [songId, retry]);
  const data = result && result.id === songId ? result.data : undefined;
  const parsed = useMemo(() => prepareLyrics(data), [data]);
  useEffect(() => {
    const tick = () => {
      if (!document.hidden) setPosition(previous => {
        const next = clock.current.position(performance.now());
        return activeLine(parsed.lines, previous) === activeLine(parsed.lines, next) ? previous : next;
      });
    };
    tick();
    const timer = setInterval(tick, 100);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [parsed.lines]);
  const lineCount = parsed.lines.length;
  const index = activeLine(parsed.lines, requested?.target ?? (np?.isPlaying ? position : np?.position ?? position));
  const center = Math.max(0, index);
  const canSeek = Boolean(np?.packageName && np.duration > 0 && ((np.playbackActions || 0) & 256)
    && (np.isPlaying || ((np.playbackActions || 0) & (4 | 512))));

  // Keep measurements tied to the lyric result and reactive so wrapping,
  // focus changes and viewport resizing all trigger a new centering pass.
  const [measurements, setMeasurements] = useState<{ source: typeof parsed; heights: number[] }>({ source: parsed, heights: [] });
  const heights = useMemo(() => measurements.source === parsed ? measurements.heights : [], [measurements, parsed]);
  const measured = lineCount > 0 && heights.filter(value => value > 0).length === lineCount;
  useEffect(() => { initialized.current = false; }, [parsed]);
  const reportHeight = useCallback((lineIndex: number, rowHeight: number) => {
    setMeasurements(previous => {
      const current = previous.source === parsed ? previous.heights : [];
      if (current[lineIndex] === rowHeight) return previous;
      const next = [...current];
      next[lineIndex] = rowHeight;
      return { source: parsed, heights: next };
    });
  }, [parsed]);
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
  const centerScroll = useCallback((line: number): number => {
    return Math.max(0, (offsets[line] ?? 0) - Math.max(0, height - (heights[line] ?? 0)) / 2);
  }, [height, offsets, heights]);
  const nearestRow = useCallback((offsetY: number): number => {
    const viewportCenter = offsetY + height / 2;
    let best = 0; let bestDist = Infinity;
    for (let i = 0; i < offsets.length; i++) {
      const dist = Math.abs(offsets[i] + (heights[i] ?? 0) / 2 - viewportCenter);
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
  }, [height, offsets, heights]);

  useEffect(() => {
    if (browsing || !height || !lineCount || !measured) return;
    scroll.current?.scrollTo({ y: centerScroll(center), animated: initialized.current && !reduceMotion });
    initialized.current = true;
  }, [center, browsing, height, lineCount, measured, parsed, reduceMotion, centerScroll]);

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
    if (!manual.current) scroll.current?.scrollTo({ y: offset.current, animated: false });
    manual.current = true;
    setBrowsing(true);
    setSelected(Math.max(0, Math.min(lineCount - 1, nearestRow(offset.current))));
    scheduleReturn();
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
      if (!np.isPlaying) await invoke('plugin:media|control_playback', {
        control: { packageName: np.packageName, action: 'play', position: null },
      });
    } catch (error) {
      clearTimeout(requestTimer.current);
      setRequested(null);
      onError(error);
    } finally { submitting.current = false; setBusy(false); }
  }

  if (!np || !songId) return null;
  if (!parsed.lines.length) return result?.id === songId && result.error
    ? <YStack position="absolute" inset={0} alignItems="center" justifyContent="center" gap="3" padding="4">
      <Text textAlign="center">歌词加载失败</Text>
      <Button size="sm" onPress={() => setRetry(value => value + 1)}>重试歌词</Button>
    </YStack>
    : null;
  return <YStack position="absolute" inset={0} zIndex={0} overflow="hidden" aria-label="同步歌词"
    backgroundColor="lyricSurface" backgroundImage={musicAtmosphere.lyrics}>
    <ScrollView ref={scroll} flex={1} minHeight={0} onLayout={event => setHeight(event.nativeEvent.layout.height)} showsVerticalScrollIndicator={false} tabIndex={0}
      aria-label="上下滑动浏览歌词" scrollEventThrottle={16}
      onWheel={browse}
      onPointerDown={() => { dragging.current = true; browse(); }}
      onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag}
      onKeyDown={event => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) browse();
      }}
      onScroll={event => {
        offset.current = event.nativeEvent.contentOffset.y;
        if (!manual.current) return;
        setSelected(Math.max(0, Math.min(lineCount - 1, nearestRow(offset.current))));
        scheduleReturn();
      }}>
      <YStack flexShrink={0} paddingTop={topPadding} paddingBottom={bottomPadding}>
        {parsed.lines.map((line, lineIndex) => <LyricRow key={`${line.start}:${lineIndex}`}
          line={line} translation={parsed.translations.get(line.start)} active={lineIndex === index}
          nearby={Math.abs(lineIndex - (browsing ? selected : center)) <= 1}
          selected={browsing && lineIndex === selected} reduceMotion={reduceMotion}
          lineIndex={lineIndex} onHeight={reportHeight}/>)}
      </YStack>
    </ScrollView>
    <YStack position="absolute" inset={0} pointerEvents="none" backgroundImage={musicAtmosphere.lyricEdges}/>
    {browsing && <>
      <XStack position="absolute" top="50%" left="3" right="3" height={44} y={-22}
        alignItems="center" gap="2" pointerEvents="box-none">
        <Button circular size="sm" width={44} height={44} minWidth={44} disabled={!canSeek || busy}
          aria-label={`从 ${formatTime(parsed.lines[selected]?.start ?? 0)} 播放`}
          onPress={() => void playSelected()} icon={<Play size={20}/>}/>
        <YStack flex={1} height={1} backgroundColor="border-color" opacity={0.5} pointerEvents="none"/>
        <Text fontSize="xs" color="color-10" pointerEvents="none">
          {formatTime(parsed.lines[selected]?.start ?? 0)}
        </Text>
      </XStack>
      <YStack position="absolute" bottom="2" alignSelf="center" gap="1" alignItems="center">
        {!canSeek && <Text fontSize="xs" color="color-10">当前音乐 App 不支持从歌词定位播放</Text>}
        <Button size="sm" onPress={follow}>回到当前</Button>
      </YStack>
    </>}
  </YStack>;
}

const LyricRow = memo(function LyricRow({ line, translation, active, nearby, selected, reduceMotion, lineIndex, onHeight }: {
  line: LyricLine; translation?: string; active: boolean; nearby: boolean; selected: boolean; reduceMotion: boolean;
  lineIndex: number; onHeight: (lineIndex: number, height: number) => void;
}) {
  const focused = active || selected;
  // Measure the unscaled layout; the visual scale belongs to the inner row.
  return <YStack width="100%" maxWidth={720} alignSelf="center" flexShrink={0}
    onLayout={event => onHeight(lineIndex, event.nativeEvent.layout.height)}>
    <YStack width="100%"
      paddingHorizontal={28} paddingVertical={Math.round(LYRIC_FONT_SIZE * .55)} gap="3"
      alignItems="center" justifyContent="center"
      transition={reduceMotion ? 'none' : 'quickLessBouncy'} scale={focused ? 1 : 0.94}
      opacity={focused ? 1 : nearby ? 0.38 : 0.16}>
      <Text fontSize={focused ? LYRIC_FONT_SIZE : 23} lineHeight={LYRIC_LINE_HEIGHT} fontWeight={focused ? '700' : '500'}
        transition={reduceMotion ? 'none' : 'quickLessBouncy'}
        backgroundImage={focused ? musicAtmosphere.lyricInk : undefined} backgroundClip={focused ? 'text' : undefined}
        textShadowColor="lyricGlow" textShadowRadius={focused ? 8 : 0}
        textShadowOffset={{ width: 0, height: 0 }}
        color={focused ? 'transparent' : nearby ? 'lyricNearby' : 'lyricRest'} textAlign="center">{line.text}</Text>
      {translation && <Text fontSize={focused ? TRANSLATION_FONT_SIZE : TRANSLATION_FONT_SIZE - 3} lineHeight={1.4}
        color="lyricTranslation" opacity={focused ? 0.76 : 0.65}
        textAlign="center">{translation}</Text>}
    </YStack>
  </YStack>;
});
