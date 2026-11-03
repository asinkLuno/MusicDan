import { View, useTheme } from 'tamagui';
import { useEffect, useRef, useState } from 'react';
import type { Settings, Snapshot, Comment } from './types';
import { commentFontSize, makePlan, pinDurationMs, visibleRange } from './plan';
import { getEmoteImage, parseSegments, removeEmoteListener, type Segment } from './emotes';
import { danmakuEffects } from './tamagui.config';
import { PlaybackClock } from './playbackClock';

type SpriteLine = { segs: Segment[]; widths: number[]; width: number };
type Sprite = { lines: SpriteLine[]; lineHeight: number; font: string; badgeFont: string; fontSize: number; height: number; emoteSize: number; effect: 'high' | 'top' | null; badge: string; width: number; tiles: Map<number, HTMLCanvasElement>; invalidate: () => void };

export function Danmaku({ snapshot, settings }: { snapshot: Snapshot | null; settings: Settings }) {
  const theme = useTheme();
  // Canvas cannot resolve the CSS variable returned by .get(); use the literal color.
  const textColor = theme.color.val;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clock = useRef(new PlaybackClock());
  const playing = snapshot?.nowPlaying?.isPlaying ?? false;
  const wake = useRef<(() => void) | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    clock.current.update(snapshot, performance.now(), Date.now());
    wake.current?.();
  }, [snapshot]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(canvasRef.current!); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!size.width || !size.height) return;
    const drawingContext = canvas.getContext('2d');
    if (!drawingContext) return;
    const context = drawingContext;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr); canvas.height = Math.round(size.height * dpr);
    context.scale(dpr, dpr);
    const height = size.height;
    const duration = snapshot?.nowPlaying?.duration || snapshot?.song?.duration || 240000;
    const { list, lanes, spacing, crossing, pinned } = makePlan(snapshot?.comments || [], duration, height, settings, size.width);
    // Dense screens need many cached tiles; bound their resolution and memory.
    const concurrent = list.length * crossing / Math.max(1, duration);
    const rasterScale = Math.min(dpr, 2, Math.max(1, Math.sqrt(160 / Math.max(1, concurrent))));
    const tileWidth = 512;
    const padding = 8;
    // Rasterize only visible text tiles, once; long comments do not allocate giant canvases.
    const sprites = new Map<number, Sprite>();
    const pinnedSprites = new Map<number, Sprite>();

    /** 驻留弹幕排版：超出一行的评论按字符折行（最多 maxLines 行，末尾省略） */
    function wrapLines(segs: Segment[], widths: number[], maxWidth: number, maxLines: number): SpriteLine[] {
      const lines: SpriteLine[] = [{ segs: [], widths: [], width: 0 }];
      let truncated = false;
      const newLine = () => {
        if (lines.length >= maxLines) truncated = true;
        else lines.push({ segs: [], widths: [], width: 0 });
        return lines[lines.length - 1];
      };
      const push = (line: SpriteLine, seg: Segment, width: number) => { line.segs.push(seg); line.widths.push(width); line.width += width; };
      for (const [index, seg] of segs.entries()) {
        if (truncated) break;
        const width = widths[index];
        let line = lines[lines.length - 1];
        if (line.width > 0 && line.width + width > maxWidth) line = newLine();
        if (truncated) break;
        if (seg.type === 'text' && line.width + width > maxWidth) {
          let text = ''; let measured = 0;
          for (const character of Array.from(seg.text)) {
            const charWidth = context.measureText(character).width;
            if (line.width + measured + charWidth > maxWidth) {
              if (measured) push(line, { type: 'text', text }, measured);
              line = newLine();
              if (truncated) { text = ''; break; }
              text = ''; measured = 0;
            }
            text += character; measured += charWidth;
          }
          if (text) push(line, { type: 'text', text }, measured);
          continue;
        }
        push(line, seg, width);
      }
      if (truncated) {
        const last = lines[lines.length - 1];
        const ellipsis = context.measureText('…').width;
        push(last, { type: 'text', text: '…' }, ellipsis);
      }
      return lines;
    }

    function makeSprite(comment: Comment, maxWidth?: number): Sprite {
      const fontSize = commentFontSize(settings.fontSize, comment.occurrences);
      const lineHeight = Math.round(fontSize * 1.3);
      const font = `500 ${fontSize}px system-ui, sans-serif`;
      const badgeFont = `600 ${Math.round(fontSize * .65)}px system-ui, sans-serif`;
      const emoteSize = Math.round(fontSize * 1.5);
      context.font = font;
      const label = comment.content.replaceAll('\n', ' ');
      const badge = [comment.liked_count > 0 ? `♥${comment.liked_count}` : '', (comment.occurrences || 1) > 1 ? `×${comment.occurrences}` : ''].filter(Boolean).join('  ');
      const segs = parseSegments(label);
      const widths = segs.map(seg => seg.type === 'text' ? context.measureText(seg.text).width : emoteSize);
      const textWidth = widths.reduce((sum, width) => sum + width, 0);
      const lines = maxWidth != null && textWidth > maxWidth
        ? wrapLines(segs, widths, maxWidth, 2)
        : [{ segs, widths, width: textWidth }];
      context.font = badgeFont;
      const measuredBadge = badge ? context.measureText(badge).width : 0;
      context.font = font;
      const width = Math.ceil(Math.max(...lines.map(line => line.width)) + (badge ? fontSize * .25 + measuredBadge : 0));
      const effect = comment.liked_count >= danmakuEffects.top.minLikes ? 'top' : comment.liked_count >= danmakuEffects.high.minLikes ? 'high' : null;
      const tiles = new Map<number, HTMLCanvasElement>();
      // An arriving emote only invalidates the comment that uses it.
      const invalidate = () => tiles.clear();
      return { lines, lineHeight, font, badgeFont, fontSize, height: lines.length * lineHeight + padding * 2, emoteSize, effect, badge, width, tiles, invalidate };
    }
    function spriteFor(index: number) {
      let sprite = sprites.get(index);
      if (!sprite) { sprite = makeSprite(list[index]); sprites.set(index, sprite); }
      return sprite;
    }
    // 长评驻留队列：按各自驻留时长首尾相接，读一条换一条
    const pinList = pinned.list;
    const pinEnters: number[] = [];
    { let acc = 0; for (const comment of pinList) { pinEnters.push(acc); acc += pinDurationMs(comment.content); } }
    function pinnedSpriteFor(index: number) {
      let sprite = pinnedSprites.get(index);
      if (!sprite) { sprite = makeSprite(pinList[index], size.width - 24); pinnedSprites.set(index, sprite); }
      return sprite;
    }
    function activePinned(position: number): number {
      let lo = 0; let hi = pinEnters.length - 1; let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (pinEnters[mid] <= position) { found = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (found < 0) return -1;
      return position - pinEnters[found] < pinDurationMs(pinList[found].content) ? found : -1;
    }
    function tileFor(sprite: Sprite, tile: number) {
      const { font, badgeFont, fontSize, lineHeight, emoteSize, lines } = sprite;
      let image = sprite.tiles.get(tile);
      if (!image) {
        image = document.createElement('canvas');
        image.width = Math.ceil((tileWidth + padding * 2) * rasterScale);
        image.height = Math.ceil(sprite.height * rasterScale);
        const ink = image.getContext('2d')!;
        ink.scale(rasterScale, rasterScale); ink.font = font; ink.textBaseline = 'middle';
        if (sprite.effect) ink.fillStyle = textColor;
        lines.forEach((line, lineIndex) => {
          const y = padding + lineHeight * (lineIndex + .5);
          const left = padding - tile * tileWidth;
          if (sprite.effect) {
            // Anchor the gradient to each whole line, so tile boundaries remain seamless.
            const gradient = ink.createLinearGradient(left, 0, left + Math.max(1, line.width), 0);
            const colors = danmakuEffects[sprite.effect].colors;
            colors.forEach((color, index) => gradient.addColorStop(index / (colors.length - 1), color));
            ink.fillStyle = gradient;
          } else ink.fillStyle = textColor;
          let cursor = padding - tile * tileWidth;
          for (const [index, seg] of line.segs.entries()) {
            const segWidth = line.widths[index];
            if (cursor + segWidth >= 0 && cursor <= tileWidth + padding * 2) {
              if (seg.type === 'text') {
                ink.save();
                if (sprite.effect === 'top') {
                  ink.shadowColor = danmakuEffects.top.colors[0];
                  ink.shadowBlur = Math.min(6, fontSize * .2) * rasterScale;
                }
                ink.fillText(seg.text, cursor, y);
                ink.restore();
              } else {
                const img = getEmoteImage(seg.url, sprite.invalidate);
                if (img) ink.drawImage(img, cursor, y - emoteSize / 2, emoteSize, emoteSize);
                else {
                  ink.save(); ink.beginPath(); ink.rect(cursor, 0, emoteSize, sprite.height); ink.clip();
                  ink.fillText(`[${seg.name}]`, cursor, y);
                  ink.restore();
                }
              }
            }
            cursor += segWidth;
          }
          if (lineIndex === lines.length - 1 && sprite.badge) {
            ink.font = badgeFont;
            ink.fillStyle = textColor;
            ink.fillText(sprite.badge, cursor + fontSize * .25, y - fontSize * .55);
            ink.font = font;
          }
        });
        sprite.tiles.set(tile, image);
      }
      return image;
    }
    function drawSprite(sprite: Sprite, x: number, y: number) {
      const first = Math.max(0, Math.floor(-x / tileWidth));
      const last = Math.min(Math.floor(sprite.width / tileWidth), Math.floor((size.width - x) / tileWidth));
      for (const tile of sprite.tiles.keys()) if (tile < first || tile > last) sprite.tiles.delete(tile);
      for (let tile = first; tile <= last; tile++) {
        const image = tileFor(sprite, tile);
        context.drawImage(image, padding * rasterScale, 0, tileWidth * rasterScale, image.height,
          x + tile * tileWidth, y, tileWidth, sprite.height);
      }
    }
    let animation = 0;
    function draw(frameTime: number) {
      animation = 0;
      context.clearRect(0, 0, size.width, size.height);
      if (playing && !document.hidden) {
        const position = clock.current.position(frameTime);
        if (list.length) {
          const [start, end] = visibleRange(position, crossing, spacing, list.length);
          context.globalAlpha = settings.opacity;
          for (const [index, sprite] of sprites) {
            if (index < start || index > end) {
              removeEmoteListener(sprite.invalidate);
              sprites.delete(index);
            }
          }
          for (let i = start; i <= end; i++) {
            const sprite = spriteFor(i);
            const progress = (position - i * spacing) / crossing;
            const x = size.width - (size.width + sprite.width) * progress;
            const y = ((i % lanes) + .5) * height / lanes - sprite.height / 2;
            drawSprite(sprite, x, y);
          }
        }
        // 长评驻留：顶部/底部交替居中（避开中央正在显示的歌词），淡入停留淡出，逐条接续
        const pinIndex = activePinned(position);
        if (pinIndex >= 0) {
          const elapsed = position - pinEnters[pinIndex];
          const dwell = pinDurationMs(pinList[pinIndex].content);
          const fade = Math.max(0, Math.min(1, elapsed / 400, (dwell - elapsed) / 400));
          for (const [index, sprite] of pinnedSprites) {
            if (index < pinIndex - 1 || index > pinIndex + 2) {
              removeEmoteListener(sprite.invalidate);
              pinnedSprites.delete(index);
            }
          }
          const sprite = pinnedSpriteFor(pinIndex);
          const y = pinIndex % 2 === 0 ? 4 : height - sprite.height - 4;
          context.globalAlpha = fade * settings.opacity;
          drawSprite(sprite, (size.width - sprite.width) / 2, y);
        }
      }
      if (playing && (list.length || pinList.length) && !document.hidden) animation = requestAnimationFrame(draw);
    }
    function resume() {
      // Polling updates the clock without interrupting the vsync frame already queued.
      if (document.hidden) {
        cancelAnimationFrame(animation);
        animation = 0;
      } else if (!animation) {
        animation = requestAnimationFrame(draw);
      }
    }
    wake.current = resume;
    document.addEventListener('visibilitychange', resume);
    resume();
    return () => {
      cancelAnimationFrame(animation);
      for (const sprite of sprites.values()) removeEmoteListener(sprite.invalidate);
      for (const sprite of pinnedSprites.values()) removeEmoteListener(sprite.invalidate);
      wake.current = null;
      document.removeEventListener('visibilitychange', resume);
    };
  }, [size, playing, snapshot?.revision, snapshot?.nowPlaying?.duration, snapshot?.song?.duration, settings, textColor]);
  return <View render="canvas" position="absolute" inset={0} width="100%" height="100%" pointerEvents="none" ref={element => { if (element instanceof HTMLCanvasElement) canvasRef.current = element; }} aria-label="实时弹幕" />;
}
