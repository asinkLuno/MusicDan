import type { Comment, Song } from './types';
import type { Lyrics } from './lyrics';

export interface DemoFixture {
  schemaVersion: number;
  song: Song;
  searchResults: Song[];
  commentCounts: Record<string, number>;
  comments: Comment[];
  lyrics: Lyrics;
  tracks?: Record<string, { song: Song; comments: Comment[]; lyrics: Lyrics }>;
  previewSongIds?: number[];
}

export function fixtureComments(data: DemoFixture, selected: Song[]): Comment[] {
  if (!selected.length) throw new Error('至少选择一个歌曲版本');
  const merged = new Map<number, Comment>();
  for (const song of selected) {
    const batch = song.songId === data.song.songId ? data.comments : data.tracks?.[song.songId]?.comments;
    if (!batch) throw new Error('此版本的评论尚未录入测试数据');
    for (const comment of batch) {
      const previous = merged.get(comment.commentId);
      if (!previous || comment.liked_count > previous.liked_count) merged.set(comment.commentId, comment);
    }
  }
  return [...merged.values()];
}
