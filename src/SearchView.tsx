import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge, BadgeLamp } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card/card';
import { Key } from '@/components/ui/key';
import { LatchCheckbox } from '@/components/ui/latch-checkbox';
import { NumberWheel } from '@/components/ui/number-wheel';
import { TextField, TextFieldAdornment, TextFieldInput, TextFieldSlot } from '@/components/ui/text-field';
import { durationsMatch, formatTime } from './types';
import type { NowPlaying, Song } from './types';
import { invoke } from './commands';

export interface SearchRequest {
  keyword: string;
  nonce: number;
}

export default function SearchView({
  nowPlaying,
  currentKey,
  selectedSongs,
  onSelectSongs,
  onClearSelection,
  onApplied,
  onClearError,
  onError,
  autoSearch,
}: {
  nowPlaying: NowPlaying | null | undefined;
  currentKey: string;
  selectedSongs: Song[];
  onSelectSongs: (songs: Song[], selected: boolean) => void;
  onClearSelection: () => void;
  onApplied: () => void;
  onClearError: () => void;
  onError: (error: unknown) => void;
  autoSearch: SearchRequest | null;
}) {
  const [query, setQuery] = useState(autoSearch?.keyword ?? '');
  const [results, setResults] = useState<Song[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<number, number | null>>({});
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const searchId = useRef(0);
  const lastAutoNonce = useRef<number | null>(null);

  const searchSongs = useCallback(
    async (rawKeyword: string) => {
      const keyword = rawKeyword.trim();
      if (!keyword) return;
      const id = ++searchId.current;
      setSearching(true);
      onClearError();
      setSearched(false);
      try {
        const songs = await invoke('search_songs', { keyword });
        if (id === searchId.current) {
          setResults(songs);
          setSearched(true);
          let next = 0;
          const ids = [...new Set(songs.map((song) => song.songId))];
          const loadCounts = async () => {
            while (id === searchId.current && next < ids.length) {
              const songId = ids[next++];
              let count: number | null = null;
              try {
                count = await invoke('get_song_comment_count', { songId });
              } catch {
                /* Keep the song selectable if counts fail. */
              }
              if (id === searchId.current) setCommentCounts((previous) => ({ ...previous, [songId]: count }));
            }
          };
          void Promise.all(Array.from({ length: Math.min(4, ids.length) }, loadCounts));
        }
      } catch (e) {
        if (id === searchId.current) onError(e);
      } finally {
        if (id === searchId.current) setSearching(false);
      }
    },
    [onClearError, onError],
  );

  useEffect(() => {
    if (!autoSearch || lastAutoNonce.current === autoSearch.nonce) return;
    lastAutoNonce.current = autoSearch.nonce;
    setQuery(autoSearch.keyword);
    if (autoSearch.keyword) {
      void searchSongs(autoSearch.keyword);
    } else {
      searchId.current++;
      setSearching(false);
      setSearched(false);
      setResults([]);
    }
  }, [autoSearch, searchSongs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await searchSongs(query);
  }

  async function mergeMatches() {
    if (!currentKey || busy || !selectedSongs.length) return;
    setBusy(true);
    onClearError();
    try {
      await invoke('set_song_matches', { key: currentKey, songs: selectedSongs });
      onApplied();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      <div className="flex shrink-0 flex-col gap-1">
        <h1 className="m-0 text-xl font-bold">搜索匹配</h1>
        <p className="m-0 font-mono text-xs text-muted-foreground">
          选择与当前播放一致的歌曲版本
          {nowPlaying && nowPlaying.duration > 0 ? ` · 当前时长 ${formatTime(nowPlaying.duration)}` : ''}
        </p>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex shrink-0 items-center gap-2">
        <TextField className="flex-1">
          <TextFieldSlot>
            <TextFieldAdornment>
              <Search />
            </TextFieldAdornment>
            <TextFieldInput
              aria-label="搜索歌名或歌手"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索歌名、歌手"
            />
          </TextFieldSlot>
        </TextField>
        <Key type="submit" size="md" variant="secondary" pending={searching} disabled={searching || !query.trim()}>
          {searching ? '搜索中' : '搜索'}
        </Key>
      </form>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-1.5 text-xs text-muted-foreground">
          <span>勾选多首可合并弹幕 · 已选</span>
          <NumberWheel value={selectedSongs.length} tone="black" className="text-xs" />
          <span>首</span>
        </div>
        <Key size="sm" variant="secondary" disabled={!selectedSongs.length || busy} onClick={onClearSelection}>
          清空
        </Key>
        <Key
          size="sm"
          variant="primary"
          pending={busy}
          disabled={!nowPlaying || busy || !selectedSongs.length}
          onClick={() => void mergeMatches()}
        >
          应用选择
        </Key>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex flex-col gap-2.5">
          {searching && (
            <p role="status" className="py-8 text-center text-sm text-muted-foreground">
              正在搜索歌曲版本…
            </p>
          )}
          {!searching && (
            <SearchResults
              songs={results}
              selectedSongs={selectedSongs}
              onSelect={onSelectSongs}
              commentCounts={commentCounts}
              playingDuration={nowPlaying?.duration || 0}
              disabled={!nowPlaying || busy}
            />
          )}
          {!searching && !searched && (
            <p className="py-8 text-center text-sm text-muted-foreground">输入歌名或歌手，查找这首歌的评论</p>
          )}
          {!searching && searched && !results.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">没有找到歌曲，试试更短的关键词</p>
          )}
        </div>
      </div>
    </div>
  );
}

const SearchResults = memo(function SearchResults({
  songs,
  selectedSongs,
  onSelect,
  commentCounts,
  playingDuration,
  disabled,
}: {
  songs: Song[];
  selectedSongs: Song[];
  onSelect: (songs: Song[], selected: boolean) => void;
  commentCounts: Record<number, number | null>;
  playingDuration: number;
  disabled: boolean;
}) {
  const selected = useMemo(() => new Set(selectedSongs.map((song) => song.songId)), [selectedSongs]);
  const visibleSongs = useMemo(() => {
    const resultIds = new Set(songs.map((result) => result.songId));
    return [...selectedSongs.filter((song) => !resultIds.has(song.songId)), ...songs];
  }, [selectedSongs, songs]);

  return visibleSongs.map((song) => {
    const isSelected = selected.has(song.songId);
    const count = commentCounts[song.songId];
    return (
      <Card
        key={song.songId}
        data-song-id={song.songId}
        className="shrink-0 [contain-intrinsic-size:auto_84px] [content-visibility:auto]"
      >
        <CardContent className="flex items-center gap-3 p-3.5">
          <LatchCheckbox
            aria-label={`选择 ${song.name} · ${song.album}`}
            checked={isSelected}
            disabled={disabled}
            onCheckedChange={(checked) => onSelect([song], checked === true)}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="m-0 truncate text-sm font-semibold text-foreground">{song.name}</p>
            <p className="m-0 truncate text-xs text-muted-foreground">
              {[song.artists, song.album].filter(Boolean).join(' · ')}
            </p>
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
              <span>{song.duration > 0 ? formatTime(song.duration) : '时长未知'}</span>
              {durationsMatch(song.duration, playingDuration) && (
                <Badge tone="warning" lit>
                  <BadgeLamp />
                  时长一致
                </Badge>
              )}
              <span>
                {count === undefined
                  ? '评论数加载中…'
                  : count === null
                    ? '评论数暂不可用'
                    : `${count.toLocaleString()} 条评论`}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  });
});
