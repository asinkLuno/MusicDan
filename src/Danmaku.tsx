import { View, useTheme } from 'tamagui';
import { useEffect, useRef, useState } from 'react';
import type { Settings, Snapshot } from './types';
import { makePlan, visibleRange } from './plan';
import { getEmoteImage, parseSegments, removeEmoteListener, type Segment } from './emotes';
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
    const font = `500 ${settings.fontSize}px system-ui, sans-serif`;
    context.font = font;
    const tileWidth = 512;
    const padding = 8;
    const spriteHeight = Math.ceil(settings.fontSize * 2.2) + padding * 2;
    const emoteSize = Math.round(settings.fontSize * 1.5);
    // Rasterize only visible text tiles, once; long comments do not allocate giant canvases.
    const sprites = new Map<number, { segs: Segment[]; width: number; tiles: Map<number, HTMLCanvasElement> }>();
    const invalidateTiles = () => { for (const sprite of sprites.values()) sprite.tiles.clear(); };
    function spriteFor(index: number) {
      let sprite = sprites.get(index);
      if (!sprite) {
        const segs = parseSegments(list[index].content.replaceAll('\n', ' '));
        let width = 0;
        for (const seg of segs) width += seg.type === 'text' ? context.measureText(seg.text).width : emoteSize;
        sprite = { segs, width: Math.ceil(width), tiles: new Map() };
        sprites.set(index, sprite);
      }
      return sprite;
    }
    function tileFor(sprite: ReturnType<typeof spriteFor>, tile: number) {
      let image = sprite.tiles.get(tile);
      if (!image) {
        image = document.createElement('canvas');
        image.width = Math.ceil((tileWidth + padding * 2) * dpr);
        image.height = Math.ceil(spriteHeight * dpr);
        const ink = image.getContext('2d')!;
        ink.scale(dpr, dpr); ink.font = font; ink.textBaseline = 'middle';
        ink.fillStyle = textColor;
        let cursor = padding - tile * tileWidth;
        for (const seg of sprite.segs) {
          const width = seg.type === 'text' ? context.measureText(seg.text).width : emoteSize;
          if (cursor + width >= 0 && cursor <= tileWidth + padding * 2) {
            if (seg.type === 'text') {
              ink.fillText(seg.text, cursor, spriteHeight / 2);
            } else {
              const img = getEmoteImage(seg.url, invalidateTiles);
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
        sprite.tiles.set(tile, image);
      }
      return image;
    }
    let animation = 0;
    function draw() {
      animation = 0;
      context.clearRect(0, 0, size.width, size.height);
      if (playing && list.length && !document.hidden) {
        const position = clock.current.position(performance.now());
        const crossing = settings.crossSeconds * 1000;
        const [start, end] = visibleRange(position, crossing, spacing, list.length);
        context.globalAlpha = settings.opacity;
        for (const index of sprites.keys()) if (index < start || index > end) sprites.delete(index);
        for (let i = start; i <= end; i++) {
          const sprite = spriteFor(i);
          const progress = (position - i * spacing) / crossing;
          const x = size.width - (size.width + sprite.width) * progress;
          const y = ((i % lanes) + .5) * height / lanes - spriteHeight / 2;
          const first = Math.max(0, Math.floor(-x / tileWidth));
          const last = Math.min(Math.floor(sprite.width / tileWidth), Math.floor((size.width - x) / tileWidth));
          for (let tile = first; tile <= last; tile++) {
            const image = tileFor(sprite, tile);
            context.drawImage(image, padding * dpr, 0, tileWidth * dpr, image.height,
              x + tile * tileWidth, y, tileWidth, spriteHeight);
          }
        }
      }
      if (playing && list.length && !document.hidden) animation = requestAnimationFrame(draw);
    }
    function resume() {
      cancelAnimationFrame(animation);
      draw();
    }
    wake.current = resume;
    document.addEventListener('visibilitychange', resume);
    draw();
    return () => {
      cancelAnimationFrame(animation);
      removeEmoteListener(invalidateTiles);
      wake.current = null;
      document.removeEventListener('visibilitychange', resume);
    };
  }, [size, playing, snapshot?.revision, snapshot?.nowPlaying?.duration, snapshot?.song?.duration, settings, textColor]);
  return <View render="canvas" position="absolute" inset={0} width="100%" height="100%" pointerEvents="none" ref={element => { if (element instanceof HTMLCanvasElement) canvasRef.current = element; }} aria-label="实时弹幕" />;
}
