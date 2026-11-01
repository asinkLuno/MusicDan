import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, H3, Paragraph, Text, XStack, YStack } from 'tamagui';
import { activeLine, parseLrc, parseYrc } from './lyrics';
import type { Lyrics } from './lyrics';
import { PlaybackClock } from './playbackClock';
import { formatTime, invoke } from './types';
import type { Snapshot, Song } from './types';

export function LyricsPanel({ snapshot, songs, selectedId, onSelect }: { snapshot: Snapshot | null; songs: Song[]; selectedId: number | null; onSelect: (id: number | null) => void }) {
  const song = songs.length === 1 ? songs[0] : songs.find(song => song.songId === selectedId);
  const songId = song?.songId;
  const [result, setResult] = useState<{ id: number; data?: Lyrics; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
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
  }, [songId, retry]);
  const data = result && result.id === songId ? result.data : undefined;
  const parsed = useMemo(() => {
    const yrc = parseYrc(data?.yrc || '');
    return { lines: yrc.length ? yrc : parseLrc(data?.lrc || ''), wordTimed: yrc.length > 0, translations: new Map(parseLrc(data?.translation || '').map(line => [line.start, line.text])) };
  }, [data]);
  const index = activeLine(parsed.lines, position);
  const first = Math.max(0, index - 2);
  return <YStack flex={1} minHeight={0} gap="4">
    <H3>歌词</H3>
    {!snapshot?.nowPlaying ? <Paragraph>在音乐 App 播放一首歌</Paragraph> : !songs.length ? <Paragraph>等待歌曲匹配，可在搜索匹配中选择歌曲</Paragraph> : !song ? <YStack gap="3" overflowY="auto">
      <Paragraph>弹幕合并了多首歌曲，请选择用哪首的歌词：</Paragraph>
      {songs.map(candidate => <Button key={candidate.songId} minHeight={64} height="auto" padding="3" onPress={() => onSelect(candidate.songId)}><Text flex={1}>{candidate.name} · {candidate.artists} · {candidate.album} · {formatTime(candidate.duration)}</Text></Button>)}
    </YStack> : <>
      <XStack gap="3" alignItems="center"><YStack flex={1} minWidth={0}><Paragraph numberOfLines={1}>{song.name} · {song.artists}</Paragraph><Text fontSize="xs" color="color-10">{song.album} · {parsed.wordTimed ? '逐字歌词' : '行级歌词'}</Text></YStack>{songs.length > 1 && <Button size="sm" onPress={() => onSelect(null)}>更换歌词</Button>}</XStack>
      <Card flex={1} minHeight={0} padding="4" gap="4" overflowY="auto" justifyContent="center" aria-label="同步歌词">
        {result && result.id === songId && result.error ? <YStack gap="3"><Paragraph role="alert">{result.error}</Paragraph><Button onPress={() => setRetry(value => value + 1)}>重试</Button></YStack> : !data ? <Paragraph role="status">正在加载歌词…</Paragraph> : !parsed.lines.length ? <Paragraph>这首歌暂无可用歌词（可能为纯音乐）</Paragraph> : <>
          {index < 0 && <Text color="color-10">前奏 · 等待歌词开始</Text>}
          {parsed.lines.slice(first, first + 6).map((line, offset) => {
            const active = first + offset === index;
            return <YStack key={`${line.start}:${first + offset}`} gap="2" flexShrink={0} opacity={active ? 1 : 0.5}>
              <Text fontSize={active ? 'xl' : 'lg'} fontWeight={active ? '700' : '400'} color="color">
                {line.words.length ? line.words.map((word, i) => <Text key={i} color={active && position >= word.start ? 'accent-background' : 'color'}>{word.text}</Text>) : line.text || '♪'}
              </Text>
              {parsed.translations.get(line.start) && <Text fontSize="sm" color="color-10">{parsed.translations.get(line.start)}</Text>}
            </YStack>;
          })}
        </>}
      </Card>
      <Text fontSize="xs" color="color-10">网易云音乐 · 与弹幕使用相同歌曲来源 · {formatTime(position)}</Text>
    </>}
  </YStack>;
}
