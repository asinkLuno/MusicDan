import { View, useTheme } from 'tamagui';
import { useEffect, useRef, useState } from 'react';
import type { Settings, Snapshot } from './types';
import { commentFontSize, crossingDuration, makePlan, visibleRange } from './plan';
import { getEmoteImage, parseSegments, removeEmoteListener, type Segment } from './emotes';
import { danmakuEffects } from './tamagui.config';
import { PlaybackClock } from './playbackClock';
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
    const { list, lanes, spacing } = makePlan(snapshot?.comments || [], duration, height, settings);
    const crossing = crossingDuration(size.width, settings.fontSize, lanes, list.length, duration);
    // Dense screens need many cached tiles; bound their resolution and memory.
    const concurrent = list.length * crossing / Math.max(1, duration);
    const rasterScale = Math.min(dpr, 2, Math.max(1, Math.sqrt(160 / Math.max(1, concurrent))));
    const tileWidth = 512;
    const padding = 8;
    // Rasterize only visible text tiles, once; long comments do not allocate giant canvases.
    const sprites = new Map<number, { segs: Segment[]; widths: number[]; font: string; badgeFont: string; fontSize: number; height: number; emoteSize: number; effect: 'high' | 'top' | null; badge: string; textWidth: number; width: number; tiles: Map<number, HTMLCanvasElement>; invalidate: () => void }>();
    function spriteFor(index: number) {
      let sprite = sprites.get(index);
      if (!sprite) {
        const comment = list[index];
        const fontSize = commentFontSize(settings.fontSize, comment.occurrences);
        const font = `500 ${fontSize}px system-ui, sans-serif`;
        const badgeFont = `600 ${Math.round(fontSize * .65)}px system-ui, sans-serif`;
        const emoteSize = Math.round(fontSize * 1.5);
        const height = Math.ceil(fontSize * 2.2) + padding * 2;
        context.font = font;
        const label = comment.content.replaceAll('\n', ' ');
        const badge = [comment.liked_count > 0 ? `♥${comment.liked_count}` : '', (comment.occurrences || 1) > 1 ? `×${comment.occurrences}` : ''].filter(Boolean).join('  ');
        const segs = parseSegments(label);
        const widths = segs.map(seg => seg.type === 'text' ? context.measureText(seg.text).width : emoteSize);
        let width = widths.reduce((sum, width) => sum + width, 0);
        const textWidth = width;
        if (badge) {
          context.font = badgeFont;
          width += fontSize * .25 + context.measureText(badge).width;
          context.font = font;
        }
        const effect = comment.liked_count >= danmakuEffects.top.minLikes ? 'top' : comment.liked_count >= danmakuEffects.high.minLikes ? 'high' : null;
        const tiles = new Map<number, HTMLCanvasElement>();
        // An arriving emote only invalidates the comment that uses it.
        const invalidate = () => tiles.clear();
        sprite = { segs, widths, font, badgeFont, fontSize, height, emoteSize, effect, badge, textWidth, width: Math.ceil(width), tiles, invalidate };
        sprites.set(index, sprite);
      }
      return sprite;
    }
    function tileFor(sprite: ReturnType<typeof spriteFor>, tile: number) {
      const { font, badgeFont, fontSize, height: spriteHeight, emoteSize } = sprite;
      let image = sprite.tiles.get(tile);
      if (!image) {
        image = document.createElement('canvas');
        image.width = Math.ceil((tileWidth + padding * 2) * rasterScale);
        image.height = Math.ceil(spriteHeight * rasterScale);
        const ink = image.getContext('2d')!;
        ink.scale(rasterScale, rasterScale); ink.font = font; ink.textBaseline = 'middle';
        ink.fillStyle = textColor;
        if (sprite.effect) {
          // Anchor the gradient to the whole comment, so tile boundaries remain seamless.
          const left = padding - tile * tileWidth;
          const gradient = ink.createLinearGradient(left, 0, left + Math.max(1, sprite.textWidth), 0);
          const colors = danmakuEffects[sprite.effect].colors;
          colors.forEach((color, index) => gradient.addColorStop(index / (colors.length - 1), color));
          ink.fillStyle = gradient;
        }
        function drawText(text: string, x: number, y: number) {
          ink.save();
          if (sprite.effect === 'top') {
            ink.shadowColor = danmakuEffects.top.colors[0];
            ink.shadowBlur = Math.min(6, fontSize * .2) * rasterScale;
          }
          ink.fillText(text, x, y);
          ink.restore();
        }
        let cursor = padding - tile * tileWidth;
        for (const [index, seg] of sprite.segs.entries()) {
          const width = sprite.widths[index];
          if (cursor + width >= 0 && cursor <= tileWidth + padding * 2) {
            if (seg.type === 'text') {
              drawText(seg.text, cursor, spriteHeight / 2);
            } else {
              const img = getEmoteImage(seg.url, sprite.invalidate);
              if (img) ink.drawImage(img, cursor, (spriteHeight - emoteSize) / 2, emoteSize, emoteSize);
              else {
                ink.save(); ink.beginPath(); ink.rect(cursor, 0, emoteSize, spriteHeight); ink.clip();
                ink.fillText(`[${seg.name}]`, cursor, spriteHeight / 2);
                ink.restore();
              }
            }
          }
          cursor += width;
        }
        if (sprite.badge) {
          ink.font = badgeFont;
          ink.fillStyle = textColor;
          ink.fillText(sprite.badge, cursor + fontSize * .25, spriteHeight / 2 - fontSize * .55);
        }
        sprite.tiles.set(tile, image);
      }
      return image;
    }
    let animation = 0;
    function draw(frameTime: number) {
      animation = 0;
      context.clearRect(0, 0, size.width, size.height);
      if (playing && list.length && !document.hidden) {
        const position = clock.current.position(frameTime);
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
          const spriteHeight = sprite.height;
          const progress = (position - i * spacing) / crossing;
          const x = size.width - (size.width + sprite.width) * progress;
          const y = ((i % lanes) + .5) * height / lanes - spriteHeight / 2;
          const first = Math.max(0, Math.floor(-x / tileWidth));
          const last = Math.min(Math.floor(sprite.width / tileWidth), Math.floor((size.width - x) / tileWidth));
          for (const tile of sprite.tiles.keys()) if (tile < first || tile > last) sprite.tiles.delete(tile);
          for (let tile = first; tile <= last; tile++) {
            const image = tileFor(sprite, tile);
            context.drawImage(image, padding * rasterScale, 0, tileWidth * rasterScale, image.height,
              x + tile * tileWidth, y, tileWidth, spriteHeight);
          }
        }
      }
      if (playing && list.length && !document.hidden) animation = requestAnimationFrame(draw);
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
      wake.current = null;
      document.removeEventListener('visibilitychange', resume);
    };
  }, [size, playing, snapshot?.revision, snapshot?.nowPlaying?.duration, snapshot?.song?.duration, settings, textColor]);
  return <View render="canvas" position="absolute" inset={0} width="100%" height="100%" pointerEvents="none" ref={element => { if (element instanceof HTMLCanvasElement) canvasRef.current = element; }} aria-label="实时弹幕" />;
}
