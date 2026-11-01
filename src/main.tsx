import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button as TamaguiButton, Card, Checkbox, H3, Input, Label, Paragraph, Progress, Separator, Slider, Switch, TamaguiProvider, Text, XStack, YStack, styled, useMedia } from 'tamagui';
import { musicAtmosphere, tamaguiConfig } from './tamagui.config';
import { LyricsPanel } from './Lyrics';
import { Danmaku } from './Danmaku';
import { MarqueeText } from './MarqueeText';
import { defaults, durationsMatch, formatTime, invoke, trackKey } from './types';
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
  const [lyricChoice, setLyricChoice] = useState<{ key: string; id: number | null }>({ key: '', id: null });
  const [tab, setTab] = useState('danmaku');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [cfg, setCfg] = useState<Settings>(defaults);
  const [commentLimitDraft, setCommentLimitDraft] = useState('');
  const [overlay, setOverlay] = useState({ granted: false, running: false, supported: true });
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedSongs, setSelectedSongs] = useState<Song[]>([]);
  const [results, setResults] = useState<Song[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<number, number | null>>({});
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  const searchId = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const np = snapshot?.nowPlaying;
  const currentKey = np ? trackKey(np) : '';
  const playbackDuration = np?.duration || snapshot?.song?.duration || 0;
  const playbackProgress = playbackDuration > 0 ? Math.max(0, Math.min(100, (np?.position || 0) / playbackDuration * 100)) : 0;
  const merged = (snapshot?.songs?.length || 0) > 1;
  const lyricSongs = snapshot?.songs?.length ? snapshot.songs : snapshot?.song ? [snapshot.song] : [];
  const lyricKey = `${currentKey}:${lyricSongs.map(song => song.songId).sort((a, b) => a - b).join(',')}`;
  const selectionKey = useRef<string | null>(null);
  useEffect(() => { selectionKey.current = null; setSelectedSongs([]); }, [currentKey]);
  useEffect(() => {
    if (currentKey && snapshot?.song && selectionKey.current !== currentKey) {
      setSelectedSongs(snapshot.songs?.length ? snapshot.songs : [snapshot.song]);
      selectionKey.current = currentKey;
    }
  }, [currentKey, snapshot?.song, snapshot?.songs]);
  const selectSongs = useCallback((songs: Song[], selected: boolean) => {
    setSelectedSongs(previous => {
      const next = new Map(previous.map(song => [song.songId, song]));
      for (const song of songs) { if (selected) next.set(song.songId, song); else next.delete(song.songId); }
      return [...next.values()];
    });
  }, []);
  const fail = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);
  useEffect(() => {
    let stopped = false;
    let revision: number | undefined;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [state, status] = await Promise.all([invoke<Omit<Snapshot, 'comments'> & { comments?: Snapshot['comments'] }>('get_player_state', { sinceRevision: revision }), invoke<typeof overlay>('plugin:media|overlay_status')]);
        if (stopped) return;
        revision = state.revision;
        setSnapshot(previous => ({ ...state, comments: state.comments ?? previous?.comments ?? [] }));
        setOverlay(previous => previous.granted === status.granted && previous.running === status.running && previous.supported === status.supported ? previous : status);
        if (!initialized.current) { initialized.current = true; setCfg(state.settings); setCommentLimitDraft(state.settings.commentLimit == null ? '' : String(state.settings.commentLimit)); }
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
    try {
      const songs = await invoke<Song[]>('search_songs', { keyword });
      if (id === searchId.current) {
        setResults(songs); setSearched(true);
        // Show results immediately; at most four count requests run at once.
        let next = 0;
        const ids = [...new Set(songs.map(song => song.songId))];
        const loadCounts = async () => {
          while (id === searchId.current && next < ids.length) {
            const songId = ids[next++];
            let count: number | null = null;
            try { count = await invoke<number>('get_song_comment_count', { songId }); } catch { /* Keep the song selectable if counts fail. */ }
            if (id === searchId.current) setCommentCounts(previous => ({ ...previous, [songId]: count }));
          }
        };
        void Promise.all(Array.from({ length: Math.min(4, ids.length) }, loadCounts));
      }
    }
    catch (e) { if (id === searchId.current) fail(e); }
    finally { if (id === searchId.current) setSearching(false); }
  }
  function openManualMatch() {
    const keyword = np ? `${np.title} ${np.artist}`.trim() : '';
    setQuery(keyword);
    setSelectedSongs(snapshot?.songs || (snapshot?.song ? [snapshot.song] : []));
    setTab('search');
    if (keyword) void searchSongs(keyword);
    else {
      searchId.current++;
      setSearching(false);
      setSearched(false);
      setResults([]);
    }
  }
  async function mergeMatches() {
    if (!currentKey || busy || !selectedSongs.length) return;
    setBusy(true); setError('');
    try { await invoke('set_song_matches', { key: currentKey, songs: selectedSongs }); setTab('danmaku'); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function toggleOverlay() {
    setBusy(true); setError('');
    try {
      if (!overlay.granted) { await invoke('plugin:media|open_overlay_settings'); }
      else { await invoke('plugin:media|set_overlay', { enabled: !overlay.running }); setOverlay({ ...overlay, running: !overlay.running }); }
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  const waiting = !snapshot?.permissionGranted ? '需要授权读取播放信息' : !np ? '在音乐 App 播放一首歌' : snapshot.comments.length ? '' : snapshot.loading ? '正在加载热评…' : snapshot.error ? '暂时没有匹配成功' : '这首歌还没有可用评论';
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
                <YStack flex={1} minWidth={0} gap="2">
                  <XStack alignItems="center" justifyContent="space-between" gap="2">
                    <Text fontSize="xs" color="color-10" numberOfLines={1}>{snapshot?.comments.reduce((sum, comment) => sum + (comment.occurrences || 1), 0) || 0} 条评论 · 显示 {Math.min(snapshot?.comments.length || 0, cfg.commentLimit ?? Infinity)} 条{snapshot?.loading && snapshot.comments.length > 0 ? ' · 后台补充中' : ''}</Text>
                    <Text fontSize="xs" color="color-10" flexShrink={0}>{formatTime(np?.position || 0)} / {formatTime(playbackDuration)}</Text>
                  </XStack>
                  <Progress value={playbackProgress} height={4} width="100%" borderRadius="4" backgroundColor="color-3"
                    aria-label="播放进度" aria-valuetext={`${formatTime(np?.position || 0)} / ${formatTime(playbackDuration)}`}>
                    <Progress.Indicator backgroundColor="accent-background" borderRadius="4"/>
                  </Progress>
                </YStack>
                <Button size="sm" variant="quiet" aria-label="全屏弹幕" onPress={() => setFull(true)}>全屏</Button>
              </XStack>
            </Card.Footer>}
        </Card>
        {!full && <XStack alignItems="center" gap="3" flexShrink={0} paddingVertical="2">
          <YStack flex={1} minWidth={0} gap="1">
            <Text fontSize="xs" color="color-10">{snapshot?.songs && snapshot.songs.length > 1 ? `已合并 ${snapshot.songs.length} 首歌曲的评论` : snapshot?.manualMatch ? '已保存的匹配' : '自动匹配'}</Text>
            {!merged && <>
              <MarqueeText text={snapshot?.song ? `${snapshot.song.name} · ${snapshot.song.artists}` : '等待识别当前歌曲'}/>
              {snapshot?.song?.album ? <MarqueeText text={`专辑 · ${snapshot.song.album}`} kind="caption"/> : null}
            </>}
          </YStack>
          <Button size="sm" flexShrink={0} aria-label="手动匹配" onPress={openManualMatch}>手动匹配</Button>
        </XStack>}
      </>}
      {tab === 'lyrics' && <LyricsPanel snapshot={snapshot} songs={lyricSongs} selectedId={lyricChoice.key === lyricKey ? lyricChoice.id : null} onSelect={id => setLyricChoice({ key: lyricKey, id })}/>}
      {tab === 'search' && <YStack flex={1} minHeight={0} gap="4">
        <YStack gap="1" flexShrink={0}><H3>搜索匹配</H3><Paragraph size="sm" color="color-10">选择与当前播放一致的歌曲版本{np && np.duration > 0 ? ` · 当前时长 ${formatTime(np.duration)}` : ''}</Paragraph></YStack>
        <XStack render={<form onSubmit={search}/>} gap="2" alignItems="center" flexShrink={0}>
          <Input flex={1} minWidth={0} size="md" aria-label="搜索歌名或歌手" value={query} onChangeText={setQuery} placeholder="搜索歌名、歌手"/>
          <Button type="submit" flexShrink={0} theme="accent" disabled={searching || !query.trim()}>{searching ? '搜索中' : '搜索'}</Button>
        </XStack>
        <XStack gap="2" alignItems="center" flexWrap="wrap" flexShrink={0}>
          <Paragraph size="sm" flex={1}>勾选多首可合并弹幕 · 已选 {selectedSongs.length} 首</Paragraph>
          <Button size="sm" disabled={!selectedSongs.length || busy} onPress={() => setSelectedSongs([])}>清空</Button>
          <Button size="sm" theme="accent" disabled={!np || busy || !selectedSongs.length} onPress={() => void mergeMatches()}>应用选择</Button>
        </XStack>
        <YStack flex={1} minHeight={0} gap="3" overflowY="auto" paddingBottom="2">
          {searching && <Paragraph role="status" textAlign="center" padding="6">正在搜索歌曲版本…</Paragraph>}
          {!searching && <SearchResults songs={results} selectedSongs={selectedSongs} onSelect={selectSongs} commentCounts={commentCounts} playingDuration={np?.duration || 0} disabled={!np || busy}/>}
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
        <YStack render="section" aria-labelledby="comments-title" gap="3">
          <H3 id="comments-title" fontSize="sm" color="color-10" paddingHorizontal="1">评论更新与显示</H3>
          <Card padding="4" gap="3" borderRadius="6" borderWidth={1} borderColor="border-color">
            <SettingSlider id="comment-refresh-percent" label="评论增长后重新抓取" value={cfg.commentRefreshPercent} min={1} max={100} unit="%" onChange={v => change({ commentRefreshPercent: v })}/>
            <Paragraph size="sm" color="color-10">默认增长 10% 后更新。每分钟检查一次总评论数，未达到阈值时继续使用本地缓存。</Paragraph>
            <Separator/>
            <Label htmlFor="comment-limit">合并后的弹幕显示上限</Label>
            <Input id="comment-limit" aria-label="合并后的弹幕显示上限" inputMode="numeric"
              placeholder="不限，显示全部合并弹幕" value={commentLimitDraft} onChangeText={setCommentLimitDraft}/>
            <Button size="sm" alignSelf="flex-start" onPress={() => {
              const value = commentLimitDraft.trim();
              if (!value) { change({ commentLimit: null }); return; }
              const limit = Number(value);
              if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 1 || limit > 4294967295) {
                fail('请输入有效的正整数，或留空表示不限'); return;
              }
              change({ commentLimit: limit });
            }}>保存显示上限</Button>
            <Paragraph size="sm" color="color-10">后台始终全量抓取，每新增 1000 条更新弹幕。合并后的一组算一条，留空则全部显示；设置上限后优先显示高赞弹幕。修改显示上限无需重新抓取。</Paragraph>
          </Card>
        </YStack>
        <YStack render="section" aria-labelledby="appearance-title" gap="3">
          <H3 id="appearance-title" fontSize="sm" color="color-10" paddingHorizontal="1">弹幕外观</H3>
          <Card padding="4" gap="5" borderRadius="6" borderWidth={1} borderColor="border-color">
            <SettingSlider id="font-size" label="字号" value={cfg.fontSize} min={12} max={32} unit="px" onChange={v => change({ fontSize: v })}/>
            <Separator/>
            <SettingSlider id="opacity" label="不透明度" value={Math.round(cfg.opacity * 100)} min={20} max={80} unit="%" onChange={v => change({ opacity: v / 100 })}/>
            <Paragraph size="sm" color="color-10">轨道数量与穿屏速度随屏幕和评论量自动调整，允许弹幕重叠。</Paragraph>
          </Card>
        </YStack>
      </YStack>}
    </YStack>
    {!full && <YStack flexShrink={0}>
      <Separator/>
      <XStack render="nav" aria-label="主导航" width="100%" maxWidth={850} alignSelf="center" paddingHorizontal="4" paddingVertical="2" gap="2" justifyContent="center">
        {([{ id: 'danmaku', label: '弹幕' }, { id: 'lyrics', label: '歌词' }, { id: 'search', label: '搜索匹配' }, { id: 'settings', label: '设置' }]).map(({ id, label }) =>
          <Button key={id} size="sm" minHeight={44} flex={1} theme={tab === id ? 'accent' : undefined} variant={tab === id ? undefined : 'quiet'} aria-current={tab === id ? 'page' : undefined} onPress={() => setTab(id)}>{label}</Button>)}
      </XStack>
    </YStack>}
  </YStack>;
}

const SearchResults = memo(function SearchResults({ songs, selectedSongs, onSelect, commentCounts, playingDuration, disabled }: {
  songs: Song[]; selectedSongs: Song[]; onSelect: (songs: Song[], selected: boolean) => void; commentCounts: Record<number, number | null>; playingDuration: number; disabled: boolean;
}) {
  const selected = new Set(selectedSongs.map(song => song.songId));
  // Keep selected versions visible when a later search does not include them.
  const visibleSongs = [...selectedSongs.filter(song => !songs.some(result => result.songId === song.songId)), ...songs];
  return visibleSongs.map(song => <Card key={song.songId} padding="4" borderRadius="6" borderWidth={1} borderColor={selected.has(song.songId) ? 'color-6' : 'border-color'} flexShrink={0}>
    <XStack alignItems="center" gap="3">
      <Checkbox width={44} height={44} padding="0" flexShrink={0} borderWidth={0} borderRadius="4" backgroundColor="transparent hover:background-hover"
        aria-label={`选择 ${song.name} · ${song.album}`} checked={selected.has(song.songId)} disabled={disabled}
        onCheckedChange={checked => onSelect([song], checked === true)}>
        <YStack width={20} height={20} borderRadius={6} borderWidth={1} pointerEvents="none" alignItems="center" justifyContent="center"
          backgroundColor={selected.has(song.songId) ? 'accent-background' : 'background'}
          borderColor={selected.has(song.songId) ? 'accent-background' : 'color-6'}>
          <Checkbox.Indicator><Text fontSize={12} lineHeight={16} fontWeight="700" color="accent-color">✓</Text></Checkbox.Indicator>
        </YStack>
      </Checkbox>
      <YStack flex={1} minWidth={0} gap="1">
        <Paragraph fontWeight="600" numberOfLines={2}>{song.name}</Paragraph>
        <Text fontSize="sm" color="color-10" numberOfLines={1}>{song.artists}</Text>
        <Text fontSize="xs" color="color-10" numberOfLines={1}>{song.album}</Text>
        <XStack gap="2" flexWrap="wrap" alignItems="center">
          <Text fontSize="xs" color="color-10">{song.duration > 0 ? formatTime(song.duration) : '时长未知'}</Text>
          {durationsMatch(song.duration, playingDuration) && <Text fontSize="xs" theme="accent" color="color">时长一致</Text>}
          <Text fontSize="xs" color="color-10">{commentCounts[song.songId] === undefined ? '评论数加载中…' : commentCounts[song.songId] === null ? '评论数暂不可用' : `${commentCounts[song.songId]!.toLocaleString()} 条评论`}</Text>
        </XStack>
      </YStack>
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
