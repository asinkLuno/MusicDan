import { useState } from 'react';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Key } from '@/components/ui/key';
import { PresetKey, PresetKeys } from '@/components/ui/preset-keys';
import { formatTime } from './types';
import type { Song } from './types';

export default function LyricsSourceDialog({
  songs,
  selectedId,
  onSelect,
}: {
  songs: Song[];
  selectedId?: number;
  onSelect: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Key size="sm" variant="secondary" />}>歌词来源</DialogTrigger>
      <DialogContent fasteners="screws">
        <DialogHeader>
          <DialogTitle>选择歌词来源</DialogTitle>
          <DialogDescription>从已合并评论的歌曲中选择背景歌词，弹幕保持合并显示。</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <PresetKeys
            aria-label="歌词来源列表"
            value={selectedId != null ? String(selectedId) : ''}
            onValueChange={(value) => {
              onSelect(Number(value));
              setOpen(false);
            }}
            className="flex w-full flex-col"
          >
            {songs.map((song) => (
              <PresetKey key={song.songId} value={String(song.songId)} className="h-auto w-full justify-start py-2">
                <span className="truncate">
                  {song.name} · {song.artists} ({formatTime(song.duration)})
                </span>
              </PresetKey>
            ))}
          </PresetKeys>
        </DialogBody>
        <DialogFooter>
          <DialogClose>取消</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
