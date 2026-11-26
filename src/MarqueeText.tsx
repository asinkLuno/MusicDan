import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from './useReducedMotion';

type MarqueeTextProps = { text: string; kind?: 'title' | 'body' | 'caption'; className?: string };

// Measure container & text widths via ResizeObserver; only overflowing lines animate.
export const MarqueeText = memo(function MarqueeText({ text, kind = 'body', className }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const reduceMotion = useReducedMotion();
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const measure = () => {
      const box = containerRef.current?.clientWidth ?? 0;
      const content = textRef.current?.scrollWidth ?? 0;
      setDistance(box > 0 && !reduceMotion ? Math.max(0, content - box) : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    if (textRef.current) observer.observe(textRef.current);
    return () => observer.disconnect();
  }, [text, reduceMotion]);

  const Tag = kind === 'title' ? 'h1' : 'span';
  return (
    <div ref={containerRef} className="w-full min-w-0 overflow-hidden">
      <MarqueeMotion key={`${text}:${distance}:${reduceMotion}`} distance={distance} wrap={reduceMotion}>
        <Tag
          ref={textRef as React.RefObject<HTMLHeadingElement & HTMLSpanElement>}
          className={cn(
            'm-0 block',
            reduceMotion ? 'whitespace-normal' : 'whitespace-nowrap',
            kind === 'title' && 'text-lg leading-tight font-bold tracking-[-0.015em] text-foreground',
            kind === 'body' && 'text-sm text-foreground/85',
            kind === 'caption' && 'text-xs text-muted-foreground',
            className,
          )}
        >
          {text}
        </Tag>
      </MarqueeMotion>
    </div>
  );
});

function MarqueeMotion({ distance, wrap, children }: { distance: number; wrap: boolean; children: React.ReactNode }) {
  const [atEnd, setAtEnd] = useState(false);
  const duration = Math.max(1200, (distance / 28) * 1000);
  useEffect(() => {
    if (distance <= 1) return;
    let timer: ReturnType<typeof setTimeout>;
    function advance() {
      setAtEnd((previous) => !previous);
      timer = setTimeout(advance, duration + 1400);
    }
    timer = setTimeout(advance, 1400);
    return () => clearTimeout(timer);
  }, [distance, duration]);
  return (
    <div
      className={cn('inline-flex shrink-0', wrap ? 'w-full max-w-full' : 'w-max')}
      style={{
        transform: `translate3d(${atEnd ? -distance : 0}px, 0, 0)`,
        transition: distance > 1 ? `transform ${duration}ms linear` : 'none',
      }}
    >
      {children}
    </div>
  );
}
