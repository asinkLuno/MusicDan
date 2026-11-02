import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, YStack } from 'tamagui';
import { activeLine, prepareLyrics } from './lyrics';
import type { Lyrics } from './lyrics';
import { PlaybackClock } from './playbackClock';
import { invoke } from './types';
import type { Snapshot } from './types';

export function LyricsBackground({ snapshot, songId }: { snapshot: Snapshot | null; songId?: number }) {
  const [result, setResult] = useState<{ id: number; data?: Lyrics; error?: string } | null>(null);
  const [position, setPosition] = useState(0);
  const clock = useRef(new PlaybackClock());
  useEffect(() => {
    clock.current.update(snapshot, performance.now(), Date.now());
  }, [snapshot]);
  useEffect(() => {
    const tick = () => setPosition(clock.current.position(performance.now()));
    tick(); const timer = setInterval(tick, 50); return () => clearInterval(timer);
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
  const index = activeLine(parsed.lines, position);
  const first = Math.max(0, index - 1);
  if (!snapshot?.nowPlaying || !songId) return null;
  return <YStack position="absolute" inset={0} zIndex={0} pointerEvents="none"
    padding="5" gap="5" alignItems="center" justifyContent="center" overflow="hidden" aria-label="同步背景歌词">
    {result?.id === songId && result.error
      ? <Text fontSize="sm" color="color-10" opacity={0.5}>歌词暂时无法加载</Text>
      : !data
        ? <Text fontSize="sm" color="color-10" opacity={0.5}>正在加载歌词…</Text>
        : !parsed.lines.length
          ? <Text fontSize="sm" color="color-10" opacity={0.5}>暂无歌词</Text>
          : <>
            {index < 0 && <Text color="color-10" opacity={0.5}>前奏 · 等待歌词开始</Text>}
            {parsed.lines.slice(first, first + 3).map((line, offset) => {
              const active = first + offset === index;
              const translation = parsed.translations.get(line.start);
              return <YStack key={`${line.start}:${first + offset}`} width="100%" maxWidth={720}
                gap="2" alignItems="center" flexShrink={0} opacity={active ? 0.6 : 0.2}>
                <Text fontSize={active ? 'xl' : 'lg'} fontWeight={active ? '700' : '400'}
                  color="color" textAlign="center" numberOfLines={2}>{line.text || '♪'}</Text>
                {translation && <Text fontSize="sm" color="color-10" textAlign="center" numberOfLines={2}>{translation}</Text>}
              </YStack>;
            })}
          </>}
  </YStack>;
}
