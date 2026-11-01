// 网易云官方经典表情（web 端同款）：名字 → CDN 图片编号
const EMOTE_ID: Record<string, number> = {
  大笑: 86, 可爱: 85, 憨笑: 359, 色: 95, 亲亲: 363, 惊恐: 96, 流泪: 356, 亲: 362,
  呆: 352, 哀伤: 342, 呲牙: 343, 吐舌: 348, 撇嘴: 353, 怒: 361, 奸笑: 341, 汗: 97,
  痛苦: 346, 惶恐: 354, 生病: 350, 口罩: 351, 大哭: 357, 晕: 355, 发怒: 115, 开心: 360,
  鬼脸: 94, 皱眉: 87, 流感: 358, 爱心: 33, 心碎: 34, 钟情: 303, 星星: 309, 生气: 314,
  便便: 89, 强: 13, 弱: 372, 拜: 14, 牵手: 379, 跳舞: 380, 禁止: 374, 这边: 262,
  爱意: 106, 示爱: 376, 嘴唇: 367, 狗: 81, 猫: 78, 猪: 100, 兔子: 459, 小鸡: 450,
  公鸡: 461, 幽灵: 116, 圣诞: 411, 外星: 101, 钻石: 52, 礼物: 107, 男孩: 0, 女孩: 1,
  蛋糕: 337, '18': 186, 圈: 312, 叉: 313,
};

export type Segment = { type: 'text'; text: string } | { type: 'emote'; name: string; url: string };

/** 把 "打卡[爱心]" 切成文字段和表情段；映射表里没有的 [xxx] 原样保留为文字 */
export function parseSegments(content: string): Segment[] {
  const segs: Segment[] = [];
  const re = /\[([^\[\]]{1,12})\]/g;
  let last = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(content)); ) {
    if (!Object.hasOwn(EMOTE_ID, m[1])) continue; // 未收录的代码：留在文本里
    if (m.index > last) segs.push({ type: 'text', text: content.slice(last, m.index) });
    segs.push({ type: 'emote', name: m[1], url: `https://s1.music.126.net/style/web2/emt/emoji_${EMOTE_ID[m[1]]}.png` });
    last = m.index + m[0].length;
  }
  if (last < content.length) segs.push({ type: 'text', text: content.slice(last) });
  return segs.length ? segs : [{ type: 'text', text: content }];
}

// Pending consumers all need notification, including effects created during a load.
const cache = new Map<string, { image: HTMLImageElement | null; listeners: Set<() => void>; pending: boolean }>();
export function getEmoteImage(url: string, onLoaded: () => void): HTMLImageElement | null {
  const hit = cache.get(url);
  if (hit) {
    if (hit.pending) hit.listeners.add(onLoaded);
    return hit.image;
  }
  const entry = { image: null as HTMLImageElement | null, listeners: new Set([onLoaded]), pending: true };
  cache.set(url, entry);
  const img = new Image();
  img.onload = () => {
    entry.image = img; entry.pending = false;
    for (const listener of entry.listeners) listener();
    entry.listeners.clear();
  };
  img.onerror = () => { entry.pending = false; entry.listeners.clear(); };
  img.src = url;
  return null;
}
export function removeEmoteListener(listener: () => void) {
  for (const entry of cache.values()) entry.listeners.delete(listener);
}
