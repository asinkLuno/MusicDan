import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button as TamaguiButton, Card, H3, Input, Label, Paragraph, Separator, Slider, Switch, TamaguiProvider, Text, XStack, YStack, styled, useMedia } from 'tamagui';
import { musicAtmosphere, tamaguiConfig } from './tamagui.config';
import { Danmaku } from './Danmaku';
import { MarqueeText } from './MarqueeText';
import { defaults, formatTime, invoke, trackKey } from './types';
import type { Settings, Snapshot, Song } from './types';
import '@tamagui/core/reset.css';

const AnimatedButton = styled(TamaguiButton, {
  transition: 'quickerLessBouncy',
  scale: '1 hover:1.015 press:0.97',
  minHeight: 44,
});

function Button(props: React.ComponentProps<typeof AnimatedButton>) {
  const { reduceMotion } = useMedia();
  return <AnimatedButton {...props} transition={reduceMotion ? undefined : 'quickerLessBouncy'} scale={reduceMotion ? 1 : '1 hover:1.015 press:0.97'}/>;
}

function App() {
  const media = useMedia();
  const [tab, setTab] = useState('danmaku');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [cfg, setCfg] = useState<Settings>(defaults);
  const [overlay, setOverlay] = useState({ granted: false, running: false, supported: true });
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  const searchId = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const np = snapshot?.nowPlaying;
  const currentKey = np ? trackKey(np) : '';
  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [state, status] = await Promise.all([invoke<Snapshot>('get_player_state'), invoke<typeof overlay>('plugin:media|overlay_status')]);
        if (stopped) return;
        setSnapshot(state);
        setOverlay(previous => previous.granted === status.granted && previous.running === status.running && previous.supported === status.supported ? previous : status);
        if (!initialized.current) { initialized.current = true; setCfg(state.settings); }
      } catch (e) { if (!stopped) fail(e); }
      if (!stopped) timer = setTimeout(poll, 750);
    }
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, []);
  useEffect(() => { const back = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); }; window.addEventListener('keydown', back); return () => window.removeEventListener('keydown', back); }, []);
  function change(patch: Partial<Settings>) {
    const next = { ...cfg, ...patch }; setCfg(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void invoke('update_settings', { settings: next }).catch(fail); }, 180);
  }
  async function search(e: React.FormEvent) {
    e.preventDefault();
    await searchSongs(query);
  }
  async function searchSongs(keyword: string) {
    keyword = keyword.trim();
    if (!keyword) return;
    const id = ++searchId.current; setSearching(true); setError(''); setSearched(false);
    try { const songs = await invoke<Song[]>('search_songs', { keyword }); if (id === searchId.current) { setResults(songs); setSearched(true); } }
    catch (e) { if (id === searchId.current) fail(e); }
    finally { if (id === searchId.current) setSearching(false); }
  }
  function openManualMatch() {
    const keyword = np ? `${np.title} ${np.artist}`.trim() : '';
    setQuery(keyword);
    setTab('search');
    if (keyword) void searchSongs(keyword);
    else {
      searchId.current++;
      setSearching(false);
      setSearched(false);
      setResults([]);
    }
  }
  const match = useCallback(async (song: Song | null) => {
    if (!currentKey || busy) return; setBusy(true); setError('');
    try { await invoke('set_song_match', { key: currentKey, song }); if (song) setTab('danmaku'); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }, [currentKey, busy, fail]);
  async function toggleOverlay() {
    setBusy(true); setError('');
    try {
      if (!overlay.granted) { await invoke('plugin:media|open_overlay_settings'); }
      else { await invoke('plugin:media|set_overlay', { enabled: !overlay.running }); setOverlay({ ...overlay, running: !overlay.running }); }
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  const waiting = !snapshot?.permissionGranted ? '需要授权读取播放信息' : !np ? '在音乐 App 播放一首歌' : snapshot.loading ? '正在加载评论…' : snapshot.error ? '暂时没有匹配成功' : !snapshot.comments.length ? '这首歌还没有可用评论' : '';
  return <YStack position="fixed" inset={0} backgroundColor="background" backgroundImage={musicAtmosphere.backdrop} overflow="hidden"
    paddingTop="max(env(safe-area-inset-top, 0px), var(--system-inset-top, 0px))"
    paddingBottom="max(env(safe-area-inset-bottom, 0px), var(--system-inset-bottom, 0px))"
    paddingLeft="max(env(safe-area-inset-left, 0px), var(--system-inset-left, 0px))"
    paddingRight="max(env(safe-area-inset-right, 0px), var(--system-inset-right, 0px))">
    {error && <XStack role="alert" padding="3" gap="3" alignItems="center" backgroundColor="background-hover">
      <Paragraph flex={1}>{error}</Paragraph>
      <Button size="sm" aria-label="关闭提示" onPress={() => setError('')}>关闭</Button>
    </XStack>}
    <YStack key={tab} render="main" transition={media.reduceMotion ? undefined : "quickLessBouncy"} opacity={media.reduceMotion ? 1 : "1 enter:0"} y={media.reduceMotion ? 0 : "0 enter:8px"}
      flex={1} minHeight={0} width="100%" maxWidth={full ? undefined : 850} alignSelf="center"
      padding={full ? '0' : media.sm ? '6' : '4'} gap="4" overflowY={tab === 'settings' ? 'auto' : 'hidden'}>
      {tab === 'danmaku' && <>
        {!full && np && <YStack minWidth={0} gap="1" flexShrink={0}>
          <MarqueeText text={np.title} kind="title"/>
          {np.artist ? <MarqueeText text={np.artist}/> : null}
          <MarqueeText text={`专辑 · ${np.album || snapshot?.song?.album || '未知专辑'}`} kind="caption"/>
        </YStack>}
        <Card flex={1} minHeight={100} borderRadius="8" borderWidth={1} borderColor="border-color" backgroundImage={musicAtmosphere.player} overflow="hidden" aria-label="弹幕播放器">
          <YStack position="relative" flex={1} minHeight={0} overflow="hidden">
            <Danmaku snapshot={snapshot} settings={cfg}/>
            {waiting && <YStack position="absolute" inset={0} padding="4" gap="4" alignItems="center" justifyContent="center">
              <Paragraph textAlign="center">{waiting}</Paragraph>
              {!snapshot?.permissionGranted
                ? <Button theme="accent" onPress={() => void invoke('plugin:media|open_permission_settings').catch(fail)}>授权读取播放信息</Button>
                : snapshot?.error
                  ? <Button onPress={() => void invoke('retry_match').catch(fail)}>重新匹配</Button>
                  : null}
            </YStack>}
          </YStack>
          {full
            ? <Button position="absolute" top={12} right={12} size="sm" aria-label="退出全屏" onPress={() => setFull(false)}>退出</Button>
            : <Card.Footer padding="3" borderTopWidth={1} borderColor="border-color">
              <XStack alignItems="center" justifyContent="space-between" gap="3" width="100%">
                <YStack flex={1} minWidth={0} gap="1">
                  <Text fontSize="xs" color="color-10" numberOfLines={1}>{np ? np.isPlaying ? '播放中' : '已暂停' : '等待播放'} · {snapshot?.comments.length || 0} 条评论</Text>
                  <Text fontSize="xs" color="color-10">{formatTime(np?.position || 0)} / {formatTime(np?.duration || snapshot?.song?.duration || 0)}</Text>
                </YStack>
                <Button size="sm" variant="quiet" aria-label="全屏弹幕" onPress={() => setFull(true)}>全屏</Button>
              </XStack>
            </Card.Footer>}
        </Card>
        {!full && <XStack alignItems="center" gap="3" flexShrink={0} paddingVertical="2">
          <YStack flex={1} minWidth={0} gap="1">
            <Text fontSize="xs" color="color-10">{snapshot?.manualMatch ? '已保存的匹配' : '自动匹配'}</Text>
            <MarqueeText text={snapshot?.song ? `${snapshot.song.name} · ${snapshot.song.artists}` : '等待识别当前歌曲'}/>
            {snapshot?.song?.album ? <MarqueeText text={`专辑 · ${snapshot.song.album}`} kind="caption"/> : null}
          </YStack>
          <Button size="sm" flexShrink={0} aria-label="手动匹配" onPress={openManualMatch}>手动匹配</Button>
        </XStack>}
      </>}
      {tab === 'search' && <YStack flex={1} minHeight={0} gap="4">
        <YStack gap="1" flexShrink={0}><H3>搜索匹配</H3><Paragraph size="sm" color="color-10">选择与当前播放一致的歌曲版本</Paragraph></YStack>
        <XStack render={<form onSubmit={search}/>} gap="2" alignItems="center" flexShrink={0}>
          <Input flex={1} minWidth={0} size="md" aria-label="搜索歌名或歌手" value={query} onChangeText={setQuery} placeholder="搜索歌名、歌手"/>
          <Button type="submit" flexShrink={0} theme="accent" disabled={searching || !query.trim()}>{searching ? '搜索中' : '搜索'}</Button>
        </XStack>
        <YStack flex={1} minHeight={0} gap="3" overflowY="auto" paddingBottom="2">
          {searching && <Paragraph role="status" textAlign="center" padding="6">正在搜索歌曲版本…</Paragraph>}
          {!searching && <SearchResults songs={results} matchedId={snapshot?.song?.songId} disabled={!np || busy} onMatch={match}/>}
          {!searching && !searched && <Paragraph textAlign="center" color="color-10" padding="6">输入歌名或歌手，查找这首歌的评论</Paragraph>}
          {!searching && searched && !results.length && <YStack padding="6" gap="3" alignItems="center">
            <Paragraph textAlign="center">没有找到歌曲，试试更短的关键词</Paragraph>
          </YStack>}
        </YStack>
      </YStack>}
      {tab === 'settings' && <YStack gap="7" paddingBottom="4" flexShrink={0}>
        <YStack gap="1" flexShrink={0}><H3>设置</H3><Paragraph size="sm" color="color-10">调整弹幕外观与跨应用显示</Paragraph></YStack>
        <YStack render="section" aria-labelledby="permissions-title" gap="3">
          <H3 id="permissions-title" fontSize="sm" color="color-10" paddingHorizontal="1">权限设置</H3>
          <Card padding="4" gap="4" borderRadius="6" borderWidth={1} borderColor="border-color">
            <XStack gap="3" minHeight={44} flexWrap="wrap" alignItems="center" justifyContent="space-between">
              <Paragraph flex={1}>播放信息权限</Paragraph>
              <Text fontSize="xs" color="color-10">{snapshot?.permissionGranted ? '已授权' : '未授权'}</Text>
              <Button size="sm" onPress={() => void invoke('plugin:media|open_permission_settings').catch(fail)}>管理</Button>
            </XStack>
            <Separator/>
            <YStack gap="3">
              <XStack gap="3" minHeight={44} alignItems="center">
                <Paragraph flex={1}>跨应用悬浮弹幕</Paragraph>
                <Switch transition="quickerLessBouncy" size="sm" aria-label="跨应用悬浮弹幕" checked={overlay.running} disabled={busy || !overlay.supported} onCheckedChange={() => void toggleOverlay()}><Switch.Thumb transition="quickLessBouncy"/></Switch>
              </XStack>
              {!overlay.granted && <Button size="sm" variant="quiet" alignSelf="flex-start" onPress={() => void toggleOverlay()}>允许显示在其他应用上层</Button>}
            </YStack>
          </Card>
        </YStack>
        <YStack render="section" aria-labelledby="appearance-title" gap="3">
          <H3 id="appearance-title" fontSize="sm" color="color-10" paddingHorizontal="1">弹幕外观</H3>
          <Card padding="4" gap="5" borderRadius="6" borderWidth={1} borderColor="border-color">
            <SettingSlider id="font-size" label="字号" value={cfg.fontSize} min={12} max={32} unit="px" onChange={v => change({ fontSize: v })}/>
            <Separator/>
            <SettingSlider id="cross-seconds" label="穿屏时长" value={cfg.crossSeconds} min={4} max={20} unit="秒" onChange={v => change({ crossSeconds: v })}/>
            <Separator/>
            <SettingSlider id="opacity" label="不透明度" value={Math.round(cfg.opacity * 100)} min={20} max={80} unit="%" onChange={v => change({ opacity: v / 100 })}/>
            <Separator/>
            <SettingSlider id="density" label="轨道数量" value={cfg.density} min={2} max={12} unit="条" onChange={v => change({ density: v })}/>
          </Card>
        </YStack>
      </YStack>}
    </YStack>
    {!full && <YStack flexShrink={0}>
      <Separator/>
      <XStack render="nav" aria-label="主导航" width="100%" maxWidth={850} alignSelf="center" paddingHorizontal="4" paddingVertical="2" gap="2" justifyContent="center">
        {([{ id: 'danmaku', label: '弹幕' }, { id: 'search', label: '搜索匹配' }, { id: 'settings', label: '设置' }]).map(({ id, label }) =>
          <Button key={id} size="sm" minHeight={44} flex={1} theme={tab === id ? 'accent' : undefined} variant={tab === id ? undefined : 'quiet'} aria-current={tab === id ? 'page' : undefined} onPress={() => setTab(id)}>{label}</Button>)}
      </XStack>
    </YStack>}
  </YStack>;
}

const SearchResults = memo(function SearchResults({ songs, matchedId, disabled, onMatch }: {
  songs: Song[]; matchedId?: number; disabled: boolean; onMatch: (song: Song) => Promise<void>;
}) {
  return songs.map(song => <Card key={song.songId} padding="4" borderRadius="6" borderWidth={1} borderColor="border-color" flexShrink={0}>
    <XStack alignItems="center" gap="3">
      <YStack flex={1} minWidth={0} gap="1">
        <Paragraph fontWeight="600" numberOfLines={2}>{song.name}</Paragraph>
        <Text fontSize="sm" color="color-10" numberOfLines={1}>{song.artists}</Text>
        <Text fontSize="xs" color="color-10" numberOfLines={1}>{song.album} · {formatTime(song.duration)}</Text>
      </YStack>
      <Button size="sm" minHeight={44} flexShrink={0} theme={matchedId === song.songId ? 'accent' : undefined} disabled={disabled} aria-label={`匹配 ${song.name}`} onPress={() => void onMatch(song)}>{matchedId === song.songId ? '已匹配' : '匹配'}</Button>
    </XStack>
  </Card>);
});

function SettingSlider({ id, label, value, min, max, unit, onChange }: { id: string; label: string; value: number; min: number; max: number; unit: string; onChange: (value: number) => void }) {
  return <YStack gap="3">
    <XStack alignItems="center" justifyContent="space-between"><Label id={`${id}-label`} htmlFor={id}>{label}</Label><Text fontSize="sm">{value} {unit}</Text></XStack>
    <Slider id={id} aria-labelledby={`${id}-label`} size="sm" value={[value]} min={min} max={max} step={1} onValueChange={([next]) => onChange(next)}>
      <Slider.Track><Slider.TrackActive/></Slider.Track>
      <Slider.Thumb index={0} aria-label={label}/>
    </Slider>
  </YStack>;
}

createRoot(document.getElementById('root')!).render(<TamaguiProvider config={tamaguiConfig} defaultTheme="dark"><App/></TamaguiProvider>);
