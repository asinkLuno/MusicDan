# 网易云表情包渲染 — 新手改动指南

> 交接文档 · 2026-11-02 · 范围：应用内弹幕（webview canvas）。跨应用悬浮窗（Kotlin）本次不改。
> 阅读前建议先通读 `src/Danmaku.tsx`（约 90 行）和 `src/plan.ts`（约 15 行），本指南引用的机制都在这两个文件里。

## 一、背景（先弄懂这三点）

1. **为什么现在显示的是 `[呲牙]` 文字**：弹幕内容是后端从网易云 API 拉的热评纯文本（`src-tauri/src/ncm.rs`），评论里的表情在数据里只是 `[呲牙]` 这样的代码，API 不返回图片地址。应用内弹幕画在 `<canvas>` 上（`src/Danmaku.tsx`），用 `ink.fillText(整条文本)` 直接绘制，所以代码只能原样显示。
2. **表情图从哪来**：网易云官方 web 版有一套经典表情（60 个），图片在网易 CDN 有固定网址：`https://s1.music.126.net/style/web2/emt/emoji_<编号>.png`（已验证可用，如 大笑=86、呲牙=343、爱心=33）。
3. **思路**：把评论内容切成「文字段 + 表情段」，绘制时文字用 `fillText`、表情用 `drawImage` 贴图。查不到映射的表情（如 `[doge]`）保持显示文字，与现状一致，不报错。

## 二、改动总览（两个文件）

| 文件 | 动作 | 内容 |
|---|---|---|
| `src/emotes.ts` | 新建 | 名字→图片 URL 映射表、`parseSegments` 分段函数、图片加载缓存 |
| `src/Danmaku.tsx` | 修改 | sprite 从"整条文本"改为"分段列表"，光栅化时内联画表情 |

跨应用悬浮窗（`plugins/tauri-plugin-media/.../overlay/OverlayCanvas.kt`）是另一套渲染代码，本次**不改**；悬浮窗里表情仍显示 `[文字]`。

## 三、第一步：新建 `src/emotes.ts`

```ts
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

// 图片缓存：值 null 表示「加载中或已失败」，避免重复发起请求
const cache = new Map<string, HTMLImageElement | null>();
/** 命中缓存返回 <img>；否则开始加载并返回 null，加载完成后回调 onLoaded */
export function getEmoteImage(url: string, onLoaded: () => void): HTMLImageElement | null {
  const hit = cache.get(url);
  if (hit !== undefined) return hit ?? null;
  const img = new Image();
  cache.set(url, null);
  img.onload = () => { cache.set(url, img); onLoaded(); };
  img.onerror = () => { /* 保持 null：退化显示文字 */ };
  img.src = url;
  return null;
}
```

## 四、第二步：修改 `src/Danmaku.tsx`

只改渲染光栅化那一段（`spriteFor` / `tileFor`），动画循环 `draw()` 和平铺(tile)机制不用动：

1. 顶部加 `import { parseSegments, getEmoteImage } from './emotes';`

2. 在 effect 内、`spriteHeight` 旁边定义表情边长与失效函数：

   ```ts
   const emoteSize = Math.round(settings.fontSize * 1.5);
   const invalidateTiles = () => { for (const s of sprites.values()) s.tiles.clear(); };
   ```

3. `spriteFor` 改为存分段，宽度 = 文字宽 + 每个表情 `emoteSize`：

   ```ts
   const segs = parseSegments(list[index].content.replaceAll('\n', ' '));
   let width = 0;
   for (const seg of segs) width += seg.type === 'text' ? context.measureText(seg.text).width : emoteSize;
   sprite = { segs, width: Math.ceil(width), tiles: new Map() };
   ```

   （sprite 的类型标注也要跟着改：`{ segs: Segment[]; width: number; tiles: ... }`）

4. `tileFor` 里把 `ink.fillText(sprite.text, padding - tile * tileWidth, ...)` 换成按 x 游标逐段绘制：

   ```ts
   let cursor = padding - tile * tileWidth; // 本贴图块的全局起点（沿用现有平移思路）
   for (const seg of sprite.segs) {
     const w = seg.type === 'text' ? context.measureText(seg.text).width : emoteSize;
     if (cursor + w >= 0 && cursor <= tileWidth) { // 只画与本块有交集的段
       if (seg.type === 'text') {
         ink.fillText(seg.text, cursor, spriteHeight / 2);
       } else {
         const img = getEmoteImage(seg.url, invalidateTiles);
         if (img) {
           ink.drawImage(img, cursor, (spriteHeight - emoteSize) / 2, emoteSize, emoteSize); // 垂直居中
         } else {
           ink.save(); ink.beginPath(); ink.rect(cursor, 0, emoteSize, spriteHeight); ink.clip();
           ink.fillText(`[${seg.name}]`, cursor, spriteHeight / 2); // 占位，clip 防止溢出压到下一段
           ink.restore();
         }
       }
     }
     cursor += w;
   }
   ```

5. **关键机制**：图片是异步加载的。图片 `onload` → `invalidateTiles()` 清空所有已画贴图块 → 下一帧重画时图片已就位。不要在 onload 里直接操作 canvas。

## 五、第三步：加单元测试 `src/emotes.test.ts`（仿照 `src/plan.test.ts`）

- `parseSegments('打卡[爱心]')` → 文字段 + 表情段（url 为 `.../emoji_33.png`）
- `parseSegments('[doge]你好')` → 整体是文字段（未收录不切）
- `parseSegments('晴天')` → 单个文字段
- `parseSegments('[大笑][呲牙]')` → 两个表情段

## 六、验收清单

1. `yarn test` 通过；`yarn build`（tsc 类型检查 + 构建）通过。
2. `yarn tauri dev`（或安卓装机）播放热评多的歌（如周杰伦《晴天》）：弹幕里 `[呲牙]`、`[爱心]` 显示为小黄脸表情图，垂直居中、随字号缩放、跟随弹幕滚动。
3. 图片加载慢/失败时先显示 `[文字]` 占位，加载完成自动替换成图。
4. 飞行模式下表情退化为 `[文字]`，不崩溃、无控制台报错。

## 七、注意事项 / 已知限制

- 映射表只覆盖官方**经典 60 个**；新式表情（`[doge]`、`[二哈]` 等动图）没有公开稳定映射，保持显示文字即可。
- 只 `drawImage` 不读像素（项目里没有 `getImageData`/`toDataURL`），不会触发 canvas 跨域污染；`tauri.conf.json` 的 CSP 为 null，无需改配置。
- 本改动全在 canvas 内部，不涉及 UI 样式，不违反 AGENTS.md 的 Tamagui 约束。
- 保持与现有代码一致的紧凑风格，不要引入新依赖。
- 包管理器用 **yarn**（见 AGENTS.md），不要跑 `npm install`。

## 附：背景调查记录（给想深究的人）

- 网易云评论 API（`/api/v1/resource/comments/R_SO_4_{id}`）实测返回的 `content`/`richContent` 都只含 `[代码]` 文本，无 `emotes` 字段、无图片 URL——所以必须本地维护映射。
- 映射数据来自 [NeteaseCloudMusicApi issue #1261](https://github.com/Binaryify/NeteaseCloudMusicApi/issues/1261)（作者爬取的网易云 web 端 emoji 数据），图片 CDN 地址已抽样验证 200 OK。
- 实际评论样本中出现过的代码（爱心/呲牙/可爱/大笑/蛋糕）全部在经典 60 个之内。
