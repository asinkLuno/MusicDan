import { useEffect, useRef, useState } from 'react';
import type { Settings, Snapshot } from './types';
import { makePlan, visibleRange } from './plan';
import { PlaybackClock } from './playbackClock';
export function Danmaku({ snapshot, settings }: { snapshot: Snapshot | null; settings: Settings }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clock = useRef(new PlaybackClock());
  const playing = useRef(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    clock.current.update(snapshot, performance.now(), Date.now());
    playing.current = snapshot?.nowPlaying?.isPlaying ?? false;
  }, [snapshot]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(canvasRef.current!); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
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
    // Rasterize only visible text tiles, once; long comments do not allocate giant canvases.
    const sprites = new Map<number, { text: string; width: number; tiles: Map<number, HTMLCanvasElement> }>();
    function spriteFor(index: number) {
      let sprite = sprites.get(index);
      if (!sprite) {
        const text = list[index].content.replaceAll('\n', ' ');
        sprite = { text, width: Math.ceil(context.measureText(text).width), tiles: new Map() };
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
        ink.fillStyle = '#f2f8f6'; ink.shadowColor = '#000'; ink.shadowBlur = 3;
        ink.fillText(sprite.text, padding - tile * tileWidth, spriteHeight / 2);
        sprite.tiles.set(tile, image);
      }
      return image;
    }
    let animation = 0;
    function draw() {
      context.clearRect(0, 0, size.width, size.height);
      if (playing.current && list.length) {
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
      animation = requestAnimationFrame(draw);
    }
    draw(); return () => cancelAnimationFrame(animation);
  }, [size, snapshot?.revision, snapshot?.nowPlaying?.duration, snapshot?.song?.duration, settings]);
  return <canvas className="danmaku-canvas" ref={canvasRef} aria-label="实时弹幕" />;
}
