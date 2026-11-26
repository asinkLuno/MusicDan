// 网易云官方经典表情（web 端同款）：名字 → CDN 图片编号
import emoteIds from '../public/emotes/map.json' with { type: 'json' };
const EMOTE_ID: Record<string, number> = emoteIds;
const EMOTE_TOKEN_RE = /\[([^\][]{1,12})\]/g;

export type Segment = { type: 'text'; text: string } | { type: 'emote'; name: string; url: string };

/** 把 "打卡[爱心]" 切成文字段和表情段；映射表里没有的 [xxx] 原样保留为文字 */
export function parseSegments(content: string): Segment[] {
  if (!content.includes('[')) return [{ type: 'text', text: content }];
  const segs: Segment[] = [];
  EMOTE_TOKEN_RE.lastIndex = 0;
  let last = 0;
  for (let m: RegExpExecArray | null; (m = EMOTE_TOKEN_RE.exec(content));) {
    if (!Object.hasOwn(EMOTE_ID, m[1])) continue; // 未收录的代码：留在文本里
    if (m.index > last) segs.push({ type: 'text', text: content.slice(last, m.index) });
    segs.push({ type: 'emote', name: m[1], url: `/emotes/emoji_${EMOTE_ID[m[1]]}.png` });
    last = m.index + m[0].length;
  }
  if (last < content.length) segs.push({ type: 'text', text: content.slice(last) });
  return segs.length ? segs : [{ type: 'text', text: content }];
}

// Pending consumers all need notification, including effects created during a load.
const cache = new Map<string, { image: HTMLImageElement | null; listeners: Set<() => void>; pending: boolean }>();
const listenerUrls = new WeakMap<() => void, Set<string>>();

function trackListener(url: string, listener: () => void) {
  let urls = listenerUrls.get(listener);
  if (!urls) {
    urls = new Set();
    listenerUrls.set(listener, urls);
  }
  urls.add(url);
}

export function getEmoteImage(url: string, onLoaded: () => void): HTMLImageElement | null {
  const hit = cache.get(url);
  if (hit) {
    if (hit.pending) {
      hit.listeners.add(onLoaded);
      trackListener(url, onLoaded);
    }
    return hit.image;
  }
  const entry = { image: null as HTMLImageElement | null, listeners: new Set([onLoaded]), pending: true };
  cache.set(url, entry);
  trackListener(url, onLoaded);
  const img = new Image();
  img.onload = () => {
    entry.image = img;
    entry.pending = false;
    for (const listener of entry.listeners) {
      listenerUrls.get(listener)?.delete(url);
      listener();
    }
    entry.listeners.clear();
  };
  img.onerror = () => {
    entry.pending = false;
    for (const listener of entry.listeners) listenerUrls.get(listener)?.delete(url);
    entry.listeners.clear();
  };
  img.src = url;
  return null;
}

export function removeEmoteListener(listener: () => void) {
  const urls = listenerUrls.get(listener);
  if (!urls || urls.size === 0) return;
  for (const url of urls) cache.get(url)?.listeners.delete(listener);
  urls.clear();
}
