'use client';

import * as React from 'react';
import { Meter as MeterPrimitive } from '@base-ui/react/meter';
import { cn } from 'cn';
import { formatAmount } from '@/lib/format-amount';

/* The needle sweeps 270°, from bottom-left (-135°) to bottom-right (135°). */
const SWEEP = 270;
const START = -SWEEP / 2;

type Scale = { min: number; max: number };
const ScaleContext = React.createContext<Scale & { value: number }>({ min: 0, max: 100, value: 0 });

function angleFor(value: number, { min, max }: Scale) {
  const t = max === min ? 0 : (Math.min(Math.max(value, min), max) - min) / (max - min);
  return START + t * SWEEP;
}

/** Ticks, marks, needle and glass. Shared by Gauge and Dial. */
function Face({ ticks, dragging, children }: { ticks: number; dragging?: boolean; children?: React.ReactNode }) {
  const { value, ...scale } = React.useContext(ScaleContext);
  return (
    <span
      data-slot="dial-face"
      className="bevel-metal relative block aspect-square w-full rounded-full p-(--bevel-stitch-inset) shadow-(--bevel-depth-object)"
    >
      <span className="relative block size-full overflow-hidden rounded-full bg-(--bevel-ivory) text-(--bevel-ivory-foreground) shadow-(--bevel-depth-recessed)">
        <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 size-full">
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const major = i % 5 === 0 || i === ticks;
            return (
              <line
                key={i}
                x1="50"
                y1={major ? 9 : 11}
                x2="50"
                y2="16"
                stroke="currentColor"
                strokeWidth={major ? 1.6 : 0.8}
                transform={`rotate(${START + (i / ticks) * SWEEP} 50 50)`}
              />
            );
          })}
        </svg>
        {children}
        <span
          aria-hidden
          data-slot="dial-needle"
          data-dragging={dragging ? '' : undefined}
          className="absolute inset-0 transition-[rotate] duration-(--bevel-duration-ambient) ease-(--bevel-ease-spring) data-dragging:duration-0 motion-reduce:transition-none"
          style={{ rotate: `${angleFor(value, scale)}deg` }}
        >
          <svg viewBox="0 0 100 100" className="size-full drop-shadow-(--bevel-depth-cast-sm)">
            <path d="M50 12 L52 50 L48 50 Z" fill="var(--bevel-needle)" />
            <path d="M48 50 L52 50 L51 60 L49 60 Z" fill="currentColor" />
          </svg>
        </span>
        <span aria-hidden className="bevel-metal absolute top-1/2 left-1/2 size-[12%] -translate-1/2 rounded-full" />
        <span aria-hidden className="bevel-glass absolute inset-0 rounded-full" />
      </span>
    </span>
  );
}

type DialMarkProps = Omit<React.ComponentProps<'span'>, 'children'> & {
  value: number;
  tone?: 'red' | 'amber' | 'green';
};

/** A painted mark on the scale: a threshold, a limit, a target. Decorative; describe it in text too. */
function DialMark({ value, tone = 'red', className, style, ...props }: DialMarkProps) {
  const scale = React.useContext(ScaleContext);
  return (
    <span
      aria-hidden
      data-slot="dial-mark"
      data-tone={tone}
      className={cn('absolute inset-0', className)}
      style={{ rotate: `${angleFor(value, scale)}deg`, ...style }}
      {...props}
    >
      <svg viewBox="0 0 100 100" className="size-full">
        <path d="M48.2 6 L51.8 6 L51 18 L49 18 Z" fill="var(--dial-mark)" />
      </svg>
    </span>
  );
}

type GaugeProps = MeterPrimitive.Root.Props & {
  /** Number of tick intervals on the scale. */
  ticks?: number;
  /** Marks (DialMark) painted on the face. */
  marks?: React.ReactNode;
};

/** A read-only instrument: the needle shows a value on a scale. Announced as a meter. */
function Gauge({ className, value, min = 0, max = 100, ticks = 20, marks, children, ...props }: GaugeProps) {
  return (
    <ScaleContext value={{ min, max, value }}>
      <MeterPrimitive.Root
        data-slot="gauge"
        value={value}
        min={min}
        max={max}
        className={cn('flex w-48 flex-col items-center gap-3 text-center', className)}
        {...props}
      >
        <Face ticks={ticks}>{marks}</Face>
        {children}
      </MeterPrimitive.Root>
    </ScaleContext>
  );
}

function GaugeLabel({ className, ...props }: MeterPrimitive.Label.Props) {
  return (
    <MeterPrimitive.Label
      data-slot="gauge-label"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function GaugeValue({ className, ...props }: MeterPrimitive.Value.Props) {
  return (
    <MeterPrimitive.Value
      data-slot="gauge-value"
      className={cn('text-lg font-semibold tabular-nums', className)}
      {...props}
    />
  );
}

type DialProps = Omit<React.ComponentProps<'div'>, 'defaultValue' | 'onChange' | 'children'> & {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Number of tick intervals on the scale. */
  ticks?: number;
  /** Formats the value for the readout and for screen readers. */
  currency?: string;
  format?: Intl.NumberFormatOptions;
  locale?: Intl.LocalesArgument;
  /** Marks (DialMark) painted on the face. */
  marks?: React.ReactNode;
  /** A name for the control, shown below the dial. */
  label: React.ReactNode;
  disabled?: boolean;
};

/**
 * An adjustable dial: turn it with a drag, or arrow keys, Page Up/Down, Home and End.
 * Announced as a slider.
 */
function Dial({
  className,
  value: valueProp,
  defaultValue,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  ticks = 20,
  currency,
  format,
  locale,
  marks,
  label,
  disabled,
  ...props
}: DialProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? min);
  const value = valueProp ?? uncontrolled;
  const [dragging, setDragging] = React.useState(false);
  const labelId = React.useId();
  const text = formatAmount({ value, currency, format, locale });

  const commit = (next: number) => {
    const snapped = Math.min(max, Math.max(min, Math.round((next - min) / step) * step + min));
    if (snapped === value) return;
    if (valueProp === undefined) setUncontrolled(snapped);
    onValueChange?.(snapped);
  };

  const fromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    // 0° points up; clockwise is positive. Below the scale, snap to the nearer end.
    let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (angle > SWEEP / 2) angle = SWEEP / 2;
    if (angle < -SWEEP / 2) angle = -SWEEP / 2;
    commit(min + ((angle - START) / SWEEP) * (max - min));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const big = Math.max(step, (max - min) / 10);
    const next = {
      ArrowUp: value + step,
      ArrowRight: value + step,
      ArrowDown: value - step,
      ArrowLeft: value - step,
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    commit(next);
  };

  return (
    <ScaleContext value={{ min, max, value }}>
      <div
        data-slot="dial"
        data-disabled={disabled ? '' : undefined}
        className={cn('flex w-48 flex-col items-center gap-3 text-center data-disabled:opacity-60', className)}
        {...props}
      >
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={labelId}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={text}
          aria-disabled={disabled || undefined}
          data-slot="dial-control"
          className="w-full cursor-grab touch-none rounded-full outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:cursor-grabbing aria-disabled:cursor-not-allowed"
          onKeyDown={disabled ? undefined : onKeyDown}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
            fromPointer(event);
          }}
          onPointerMove={(event) => {
            if (dragging) fromPointer(event);
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
        >
          <Face ticks={ticks} dragging={dragging}>
            {marks}
          </Face>
        </div>
        <span id={labelId} data-slot="dial-label" className="text-sm text-muted-foreground">
          {label}
        </span>
        <span aria-hidden data-slot="dial-value" className="text-lg font-semibold tabular-nums">
          {text}
        </span>
      </div>
    </ScaleContext>
  );
}

export { Gauge, GaugeLabel, GaugeValue, Dial, DialMark };
export type { GaugeProps, DialProps, DialMarkProps };
