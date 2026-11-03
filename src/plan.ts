import type { Comment, Settings } from './types.ts';
/** Fit tracks to the viewport; dense comments overlap rather than being discarded. */
export function makePlan(comments: Comment[], duration: number, height: number, cfg: Settings, width = 360) {
  const lanes = Math.max(1, Math.floor(height / (cfg.fontSize * 1.8)));
  const seen = new Set<number>();
  const groups = new Map<string, Comment>();
  for (const comment of comments) {
    if (seen.has(comment.commentId)) continue;
    seen.add(comment.commentId);
    const key = commentKey(comment.content);
    const previous = groups.get(key);
    const occurrences = (previous?.occurrences || 0) + (comment.occurrences || 1);
    groups.set(key, { ...(previous && previous.liked_count >= comment.liked_count ? previous : comment), occurrences, time: Math.min(previous?.time ?? comment.time, comment.time) });
  }
  const unique = [...groups.values()];
  if (cfg.commentLimit != null) unique.sort((a, b) => b.liked_count - a.liked_count || a.time - b.time);
  const list = (cfg.commentLimit == null ? unique : unique.slice(0, cfg.commentLimit)).sort((a, b) => a.time - b.time || a.commentId - b.commentId);
  // 阅读时间超过穿屏时间的评论单独成队，在顶部驻留显示；其余继续穿屏
  let crossing = crossingDuration(width, cfg.fontSize, lanes, list.length, duration);
  const flow: Comment[] = [];
  const pinned: Comment[] = [];
  for (const comment of list) {
    if (cfg.pinLongComments && readingDurationMs(comment.content) > crossing) pinned.push(comment);
    else flow.push(comment);
  }
  crossing = crossingDuration(width, cfg.fontSize, lanes, flow.length, duration);
  return {
    list: flow,
    lanes,
    spacing: duration / Math.max(1, flow.length),
    crossing,
    pinned: { list: pinned },
  };
}

/** 读完一条评论所需的时间：起读开销 + 按字数的阅读速度 */
export function readingDurationMs(content: string): number {
  const chars = Array.from(content.replaceAll('\n', ' ').trim()).length;
  return 1200 + chars * 140;
}

/** 驻留时长随评论长度伸缩，上下限保证可读 */
export function pinDurationMs(content: string): number {
  return Math.min(12000, Math.max(6000, 4000 + Array.from(content).length * 80));
}
export function visibleRange(position: number, crossing: number, spacing: number, count: number): [number, number] {
  return [Math.max(0, Math.ceil((position - crossing) / spacing)), Math.min(count - 1, Math.floor(position / spacing))];
}

/** Prefer a readable speed, shortening dense crossings while allowing overlap. */
export function crossingDuration(width: number, fontSize: number, lanes: number, count: number, duration: number): number {
  const readable = Math.max(4000, Math.min(12000, width / (fontSize * 6) * 1000));
  const dense = lanes * 8 * Math.max(1, duration) / Math.max(1, count);
  return Math.max(3000, Math.min(readable, dense));
}

export function commentKey(content: string): string {
  const chars = Array.from(content.toLowerCase().replace(/[\s!！?？。.，,~～…、]/gu, ''));
  if (!chars.length) return content.trim();
  const prefix = new Uint32Array(chars.length);
  for (let i = 1; i < chars.length; i++) {
    let j = prefix[i - 1];
    while (j > 0 && chars[i] !== chars[j]) j = prefix[j - 1];
    if (chars[i] === chars[j]) j++;
    prefix[i] = j;
  }
  const period = chars.length - prefix[chars.length - 1];
  const unit = chars.slice(0, period).join('');
  return chars.length % period === 0 && /[a-z\p{L}\P{ASCII}]/u.test(unit) ? unit : chars.join('');
}

export function commentFontSize(base: number, occurrences = 1): number {
  return Math.round(base * (1 + Math.min(1, Math.log2(Math.max(1, occurrences)) * .15)));
}
