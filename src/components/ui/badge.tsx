import * as React from 'react';
import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cn } from 'cn';

type BadgeProps = useRender.ComponentProps<'span'> & {
  /** The colour of the lamp's glass. The label says what it means; colour only backs it up. */
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  /** Whether the lamp is on. Off still shows the tone's glass, dark. Lamps never blink. */
  lit?: boolean;
};

/**
 * A status plate: a small printed label with an indicator lamp. Steady,
 * inline, and small enough for table rows and headings.
 */
function Badge({ className, render, tone = 'neutral', lit = true, ...props }: BadgeProps) {
  return useRender({
    defaultTagName: 'span',
    render,
    props: mergeProps<'span'>(
      {
        'data-slot': 'badge',
        'data-tone': tone,
        'data-lit': lit ? '' : undefined,
        className: cn(
          'inline-flex h-5 max-w-full shrink-0 items-center gap-1.5 rounded-(--bevel-radius-xs) bg-(--badge-plate) px-1.5 align-middle text-(length:--bevel-fine) leading-none font-semibold tracking-(--bevel-tracking-print) whitespace-nowrap text-(--badge-foreground) uppercase shadow-(--badge-plate-edge)',
          'forced-colors:border forced-colors:border-[CanvasText]',
          '[&_svg]:pointer-events-none [&_svg]:size-3 [&_svg]:shrink-0',
          className,
        ),
      } as React.ComponentProps<'span'>,
      props,
    ),
  });
}

/** The indicator lamp. Lit or dark with the badge; decorative, since the label carries the status. */
function BadgeLamp({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      data-slot="badge-lamp"
      className={cn(
        'relative size-1.5 shrink-0 rounded-full bg-(--badge-lamp-off) shadow-(--bevel-depth-pressed)',
        className,
      )}
      {...props}
    >
      <span className="bevel-led absolute inset-0 rounded-full opacity-0 transition-opacity duration-(--bevel-duration-small) ease-(--bevel-ease-out) in-data-lit:opacity-100 motion-reduce:transition-none" />
    </span>
  );
}

export { Badge, BadgeLamp };
export type { BadgeProps };
