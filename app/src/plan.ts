import type { Comment, Settings } from './types.ts';
/** At most one crossing per lane at a time; resize recomputes both capacity and lanes. */
export function makePlan(comments: Comment[], duration: number, height: number, cfg: Settings) {
  const lanes = Math.min(cfg.density, Math.max(1, Math.floor(height / (cfg.fontSize * 1.8))));
  const seen = new Set<string>();
  const unique = comments.filter(c => { const key = c.content.trim(); if (seen.has(key)) return false; seen.add(key); return true; });
  const capacity = Math.max(1, Math.floor(lanes * duration / (cfg.crossSeconds * 1000)));
  const list = unique.sort((a, b) => b.liked_count - a.liked_count).slice(0, capacity).sort((a, b) => a.time - b.time || a.commentId - b.commentId);
  return { list, lanes, spacing: duration / Math.max(1, list.length) };
}
export function visibleRange(position: number, crossing: number, spacing: number, count: number): [number, number] {
  return [Math.max(0, Math.ceil((position - crossing) / spacing)), Math.min(count - 1, Math.floor(position / spacing))];
}
