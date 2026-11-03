import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ScrollView, Text, useMedia, XStack, YStack } from 'tamagui';
import { Play } from './icons';
import { activeLine, prepareLyrics } from './lyrics';
import type { LyricLine, Lyrics } from './lyrics';
import { PlaybackClock } from './playbackClock';
import { musicAtmosphere } from './tamagui.config';
import { formatTime, invoke } from './types';
import type { Snapshot } from './types';

const ROW_HEIGHT = 144;

export function LyricsBackground({ snapshot, songId, onError }: {
  snapshot: Snapshot | null; songId?: number; onError: (error: unknown) => void;
}) {
  const { reduceMotion } = useMedia();
  const [result, setResult] = useState<{ id: number; data?: Lyrics; error?: string } | null>(null);
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
  useEffect(() => {
    const tick = () => setPosition(clock.current.position(performance.now()));
    tick(); const timer = setInterval(tick, 50); return () => clearInterval(timer);
  }, []);
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
  }, [songId]);
  const data = result && result.id === songId ? result.data : undefined;
  const parsed = useMemo(() => prepareLyrics(data), [data]);
  const index = activeLine(parsed.lines, requested?.target ?? position);
  const center = Math.max(0, index);
  const canSeek = Boolean(np?.packageName && np.duration > 0 && ((np.playbackActions || 0) & 256)
    && (np.isPlaying || ((np.playbackActions || 0) & (4 | 512))));

  useEffect(() => {
    if (browsing || !height || !parsed.lines.length) return;
    scroll.current?.scrollTo({ y: center * ROW_HEIGHT, animated: initialized.current && !reduceMotion });
    initialized.current = true;
  }, [center, browsing, height, parsed, reduceMotion]);

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
      const target = Math.max(0, Math.min(parsed.lines.length - 1, Math.round(offset.current / ROW_HEIGHT))) * ROW_HEIGHT;
      if (manual.current && Math.abs(offset.current - target) > 1) {
        scroll.current?.scrollTo({ y: target, animated: !reduceMotion });
      }
    }, 180);
    returnTimer.current = setTimeout(follow, 5000);
  }
  function browse() {
    if (!manual.current) scroll.current?.scrollTo({ y: offset.current, animated: false });
    manual.current = true;
    setBrowsing(true);
    setSelected(Math.max(0, Math.min(parsed.lines.length - 1, Math.round(offset.current / ROW_HEIGHT))));
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

  if (!np || !songId || !parsed.lines.length) return null;
  return <YStack position="absolute" inset={0} zIndex={0} overflow="hidden" aria-label="同步歌词"
    backgroundColor="lyricSurface" backgroundImage={musicAtmosphere.lyrics}
    onLayout={event => setHeight(event.nativeEvent.layout.height)}>
    <ScrollView ref={scroll} flex={1} showsVerticalScrollIndicator={false} tabIndex={0}
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
        setSelected(Math.max(0, Math.min(parsed.lines.length - 1, Math.round(offset.current / ROW_HEIGHT))));
        scheduleReturn();
      }}>
      <YStack flexShrink={0} paddingVertical={Math.max(0, (height - ROW_HEIGHT) / 2)}>
        {parsed.lines.map((line, lineIndex) => <LyricRow key={`${line.start}:${lineIndex}`}
          line={line} translation={parsed.translations.get(line.start)} active={lineIndex === index}
          nearby={Math.abs(lineIndex - (browsing ? selected : center)) <= 1}
          selected={browsing && lineIndex === selected} reduceMotion={reduceMotion}/>)}
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

const LyricRow = memo(function LyricRow({ line, translation, active, nearby, selected, reduceMotion }: {
  line: LyricLine; translation?: string; active: boolean; nearby: boolean; selected: boolean; reduceMotion: boolean;
}) {
  const focused = active || selected;
  return <YStack width="100%" maxWidth={720} alignSelf="center" height={ROW_HEIGHT} flexShrink={0}
    paddingHorizontal={28} gap="3" alignItems="center" justifyContent="center"
    transition={reduceMotion ? 'none' : 'quickLessBouncy'} scale={focused ? 1 : 0.94}
    opacity={focused ? 1 : nearby ? 0.38 : 0.16}>
    <Text fontSize={focused ? 28 : 23} lineHeight={1.36} fontWeight={focused ? '700' : '500'}
      transition={reduceMotion ? 'none' : 'quickLessBouncy'}
      backgroundImage={focused ? musicAtmosphere.lyricInk : undefined} backgroundClip={focused ? 'text' : undefined}
      textShadowColor="lyricGlow" textShadowRadius={focused ? 8 : 0}
      textShadowOffset={{ width: 0, height: 0 }}
      color={focused ? 'transparent' : nearby ? 'lyricNearby' : 'lyricRest'} textAlign="center" numberOfLines={2}>{line.text}</Text>
    {translation && <Text fontSize={15} lineHeight={1.5} color="lyricTranslation" opacity={focused ? 0.76 : 0.65}
      textAlign="center" numberOfLines={2}>{translation}</Text>}
  </YStack>;
});
