import '@fontsource-variable/figtree';
import '@fontsource-variable/azeret-mono';
import './index.css';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MessagesSquare, Search, Settings as SettingsIcon } from 'lucide-react';
import { BevelFeedback } from '@/lib/feedback';
import { Alert, AlertDescription } from '@/components/ui/alert/alert';
import { Badge, BadgeLamp } from '@/components/ui/badge';
import { Key } from '@/components/ui/key';
import { Panel, PanelContent, PanelFooter, PanelHeader } from '@/components/ui/panel/panel';
import { PresetTabs, PresetTabsList, PresetTabsTab } from '@/components/ui/preset-keys';
import { cn } from '@/lib/utils';
import { Danmaku } from './Danmaku';
import { LyricsBackground } from './LyricsBackground';
import { MarqueeText } from './MarqueeText';
import { PlaybackControls } from './PlaybackControls';
import type { SearchRequest } from './SearchView';
import { trackKey } from './types';
import type { Song } from './types';
import { invoke } from './commands';
import { usePlayerState } from './usePlayerState';

const loadSearchView = () => import('./SearchView');
const loadSettingsView = () => import('./SettingsView');
const SearchView = lazy(loadSearchView);
const SettingsView = lazy(loadSettingsView);

const EMPTY_SONGS: Song[] = [];
const SAFE_AREA_STYLE = {
  paddingTop: 'max(env(safe-area-inset-top, 0px), var(--system-inset-top, 0px))',
  paddingBottom: 'max(env(safe-area-inset-bottom, 0px), var(--system-inset-bottom, 0px))',
  paddingLeft: 'max(env(safe-area-inset-left, 0px), var(--system-inset-left, 0px))',
  paddingRight: 'max(env(safe-area-inset-right, 0px), var(--system-inset-right, 0px))',
} as const;
const PANEL_HEADER_STYLE = { justifyContent: 'space-between', padding: '0.65rem 0.9rem' } as const;
const PANEL_CONTENT_STYLE = { padding: 0 } as const;
const PANEL_FOOTER_STYLE = { padding: '0.75rem 0.9rem' } as const;
const TAB_FALLBACK = (
  <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">加载中…</div>
);

function App() {
  const [lyricChoice, setLyricChoice] = useState<{ key: string; id: number | null }>({ key: '', id: null });
  const [tab, setTab] = useState('danmaku');
  const { snapshot, cfg, overlay, setOverlay, error, setError, fail, change } = usePlayerState();
  const [full, setFull] = useState(false);
  const [selectedSongs, setSelectedSongs] = useState<Song[]>(EMPTY_SONGS);
  const [autoSearch, setAutoSearch] = useState<SearchRequest | null>(null);
  const autoSearchNonce = useRef(0);

  const np = snapshot?.nowPlaying;
  const currentKey = np ? trackKey(np) : '';
  const merged = (snapshot?.songs?.length || 0) > 1;
  const lyricSongs = useMemo(
    () => (snapshot?.songs?.length ? snapshot.songs : snapshot?.song ? [snapshot.song] : EMPTY_SONGS),
    [snapshot?.songs, snapshot?.song],
  );
  const lyricKey = useMemo(
    () =>
      `${currentKey}:${lyricSongs
        .map((song) => song.songId)
        .sort((a, b) => a - b)
        .join(',')}`,
    [currentKey, lyricSongs],
  );
  const lyricSong =
    lyricSongs.find((song) => song.songId === (lyricChoice.key === lyricKey ? lyricChoice.id : null)) ??
    lyricSongs.find((song) => song.songId === snapshot?.song?.songId) ??
    lyricSongs[0];
  const totalComments = useMemo(
    () => snapshot?.comments.reduce((sum, comment) => sum + (comment.occurrences || 1), 0) || 0,
    [snapshot?.comments],
  );
  const visibleComments = Math.min(snapshot?.comments.length || 0, cfg.commentLimit ?? Infinity);
  const loadingMore = Boolean(snapshot?.loading && snapshot.comments.length > 0);

  const selectionKey = useRef<string | null>(null);
  useEffect(() => {
    selectionKey.current = null;
    setSelectedSongs(EMPTY_SONGS);
  }, [currentKey]);
  useEffect(() => {
    if (currentKey && snapshot?.song && selectionKey.current !== currentKey) {
      setSelectedSongs(snapshot.songs?.length ? snapshot.songs : [snapshot.song]);
      selectionKey.current = currentKey;
    }
  }, [currentKey, snapshot?.song, snapshot?.songs]);

  const selectSongs = useCallback((songs: Song[], selected: boolean) => {
    setSelectedSongs((previous) => {
      const next = new Map(previous.map((song) => [song.songId, song]));
      for (const song of songs) {
        if (selected) next.set(song.songId, song);
        else next.delete(song.songId);
      }
      return [...next.values()];
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedSongs(EMPTY_SONGS), []);
  const clearError = useCallback(() => setError(''), [setError]);
  const toggleFull = useCallback(() => setFull((value) => !value), []);
  const returnToDanmaku = useCallback(() => setTab('danmaku'), []);
  const selectLyric = useCallback((id: number) => setLyricChoice({ key: lyricKey, id }), [lyricKey]);

  const openManualMatch = useCallback(() => {
    const keyword = np ? `${np.title} ${np.artist}`.trim() : '';
    setSelectedSongs(snapshot?.songs || (snapshot?.song ? [snapshot.song] : EMPTY_SONGS));
    setAutoSearch({ keyword, nonce: ++autoSearchNonce.current });
    setTab('search');
  }, [np, snapshot?.song, snapshot?.songs]);

  useEffect(() => {
    if (!full || tab !== 'danmaku' || !cfg.keepScreenOnFullscreen) return;
    void invoke('plugin:media|set_keep_screen_on', { enabled: true }).catch(fail);
    return () => {
      void invoke('plugin:media|set_keep_screen_on', { enabled: false }).catch(fail);
    };
  }, [full, tab, cfg.keepScreenOnFullscreen, fail]);

  useEffect(() => {
    const back = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', back);
    return () => window.removeEventListener('keydown', back);
  }, []);

  useEffect(() => {
    if (full || tab !== 'danmaku') {
      const back = () => {
        if (full) setFull(false);
        else setTab('danmaku');
      };
      if (window.history.state?.musicdanBack) window.history.replaceState({ musicdanBack: true }, '');
      else window.history.pushState({ musicdanBack: true }, '');
      window.addEventListener('popstate', back);
      return () => window.removeEventListener('popstate', back);
    }
    if (window.history.state?.musicdanBack) window.history.back();
    return undefined;
  }, [tab, full]);

  const waiting = !snapshot?.permissionGranted
    ? '需要授权读取播放信息'
    : !np
      ? '在音乐 App 播放一首歌'
      : snapshot.comments.length
        ? ''
        : snapshot.loading
          ? '正在加载热评…'
          : snapshot.error
            ? '暂时没有匹配成功'
            : '这首歌还没有可用评论';

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background text-foreground" style={SAFE_AREA_STYLE}>
      {error && (
        <Alert variant="WARNING" className="shrink-0">
          <div className="flex items-center justify-between gap-3">
            <AlertDescription>{error}</AlertDescription>
            <Key size="sm" variant="secondary" aria-label="关闭提示" onClick={clearError}>
              关闭
            </Key>
          </div>
        </Alert>
      )}

      <PresetTabs
        value={tab}
        onValueChange={(value) => {
          setTab(String(value));
          void invoke('plugin:media|haptic_feedback', { kind: 'tick' }).catch(() => {});
        }}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <main
          className={cn(
            'mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden',
            full ? 'p-0' : 'max-w-[850px] gap-3 px-4 pt-4 pb-3 sm:px-6',
          )}
        >
          {tab === 'danmaku' && (
            <Panel notch={full ? 'none' : 'md'} aria-label="弹幕播放器" className="flex min-h-[120px] flex-1 flex-col">
              {(np || !full) && (
                <PanelHeader style={PANEL_HEADER_STYLE}>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <MarqueeText text={np ? np.title : 'MusicDan'} kind="title" />
                    <MarqueeText
                      text={
                        np
                          ? [np.artist, np.album || snapshot?.song?.album].filter(Boolean).join(' · ') || '未知专辑'
                          : '等待识别当前播放歌曲'
                      }
                      kind="caption"
                    />
                  </div>
                  {!full && (
                    <Badge
                      tone={merged ? 'warning' : snapshot?.song ? 'success' : 'neutral'}
                      lit={Boolean(merged || snapshot?.song)}
                      className="max-w-[52%] shrink-0"
                    >
                      <BadgeLamp />
                      <span className="truncate">
                        {merged && snapshot?.songs
                          ? `已合并 ${snapshot.songs.length} 首歌曲的评论`
                          : snapshot?.manualMatch
                            ? `已保存的匹配${snapshot.song && np && snapshot.song.name !== np.title ? ` · ${snapshot.song.name}` : ''}`
                            : snapshot?.song
                              ? `自动匹配${np && snapshot.song.name !== np.title ? ` · ${snapshot.song.name}` : ''}`
                              : '等待识别当前歌曲'}
                      </span>
                    </Badge>
                  )}
                </PanelHeader>
              )}

              <PanelContent className="scanlines relative flex min-h-0 flex-1 flex-col p-0" style={PANEL_CONTENT_STYLE}>
                <LyricsBackground
                  key={`${currentKey}:${lyricSong?.songId}`}
                  snapshot={snapshot}
                  songId={lyricSong?.songId}
                  onError={fail}
                />
                <div className="pointer-events-none absolute inset-0 z-10">
                  <Danmaku snapshot={snapshot} settings={cfg} />
                </div>
                {waiting && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 p-5 text-center">
                    <p className="m-0 text-sm text-muted-foreground">{waiting}</p>
                    {!snapshot?.permissionGranted ? (
                      <Key
                        variant="primary"
                        onClick={() => void invoke('plugin:media|open_permission_settings').catch(fail)}
                      >
                        授权读取播放信息
                      </Key>
                    ) : snapshot?.error ? (
                      <Key variant="secondary" onClick={() => void invoke('retry_match').catch(fail)}>
                        重新匹配
                      </Key>
                    ) : null}
                  </div>
                )}
              </PanelContent>

              <PanelFooter style={PANEL_FOOTER_STYLE}>
                <PlaybackControls
                  key={`${currentKey}:${np?.packageName || ''}`}
                  snapshot={snapshot}
                  full={full}
                  totalComments={totalComments}
                  visibleComments={visibleComments}
                  loadingMore={loadingMore}
                  lyricSongs={lyricSongs}
                  lyricKey={lyricKey}
                  lyricSongId={lyricSong?.songId}
                  onError={fail}
                  onToggleFull={toggleFull}
                  onOpenManualMatch={openManualMatch}
                  onSelectLyric={selectLyric}
                />
              </PanelFooter>
            </Panel>
          )}

          {tab === 'search' && (
            <Suspense fallback={TAB_FALLBACK}>
              <SearchView
                nowPlaying={np}
                currentKey={currentKey}
                selectedSongs={selectedSongs}
                onSelectSongs={selectSongs}
                onClearSelection={clearSelection}
                onApplied={returnToDanmaku}
                onClearError={clearError}
                onError={fail}
                autoSearch={autoSearch}
              />
            </Suspense>
          )}

          {tab === 'settings' && (
            <Suspense fallback={TAB_FALLBACK}>
              <SettingsView
                permissionGranted={Boolean(snapshot?.permissionGranted)}
                cfg={cfg}
                overlay={overlay}
                onSetOverlay={setOverlay}
                onChange={change}
                onClearError={clearError}
                onError={fail}
              />
            </Suspense>
          )}
        </main>

        {!full && (
          <nav aria-label="主导航" className="w-full shrink-0 px-4 pt-1 pb-3">
            <div className="mx-auto w-full max-w-[850px]">
              <PresetTabsList className="grid w-full grid-cols-3">
                <PresetTabsTab value="danmaku" className="w-full">
                  <MessagesSquare />
                  弹幕
                </PresetTabsTab>
                <PresetTabsTab
                  value="search"
                  className="w-full"
                  onPointerEnter={() => void loadSearchView()}
                  onFocus={() => void loadSearchView()}
                >
                  <Search />
                  搜索匹配
                </PresetTabsTab>
                <PresetTabsTab
                  value="settings"
                  className="w-full"
                  onPointerEnter={() => void loadSettingsView()}
                  onFocus={() => void loadSettingsView()}
                >
                  <SettingsIcon />
                  设置
                </PresetTabsTab>
              </PresetTabsList>
            </div>
          </nav>
        )}
      </PresetTabs>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <BevelFeedback haptics>
    <App />
  </BevelFeedback>,
);
