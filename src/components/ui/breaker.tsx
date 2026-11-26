import * as React from 'react';
import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cn } from 'cn';
import { useBevelFeedback } from '@/lib/feedback';

/** A panel of breakers, like a fuse box. Label it with BreakerPanelTitle. */
function BreakerPanel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      data-slot="breaker-panel"
      className={cn(
        'bevel-metal bevel-object flex flex-col gap-4 rounded-(--bevel-radius-md) p-5 text-(--breaker-lever)',
        className,
      )}
      {...props}
    />
  );
}

function BreakerPanelTitle({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="breaker-panel-title"
      className={cn(
        'bevel-deboss text-(length:--bevel-label) font-semibold tracking-(--bevel-tracking-label) uppercase',
        className,
      )}
      {...props}
    />
  );
}

function BreakerRow({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="breaker-row" className={cn('flex flex-wrap gap-4', className)} {...props} />;
}

type BreakerState = 'on' | 'off' | 'tripped';

type BreakerProps = Omit<SwitchPrimitive.Root.Props, 'children'> & {
  /** Tripped: the lever drops to the middle and a red flag shows until it's reset. */
  tripped?: boolean;
  /** What this breaker protects, shown on the label strip. */
  label: React.ReactNode;
  /** A second line under the label: the limit, or why it's locked. */
  description?: React.ReactNode;
};

const stateText: Record<BreakerState, string> = { on: 'On', off: 'Off', tripped: 'Tripped' };

/**
 * One breaker. A switch with a third, tripped state. Switching a tripped
 * breaker resets it: handle that in onCheckedChange by clearing `tripped`.
 */
function Breaker({
  className,
  tripped = false,
  label,
  description,
  checked: checkedProp,
  defaultChecked,
  onCheckedChange,
  disabled,
  ...props
}: BreakerProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultChecked ?? false);
  const checked = checkedProp ?? uncontrolled;
  const state: BreakerState = tripped ? 'tripped' : checked ? 'on' : 'off';
  const labelId = React.useId();
  const statusId = React.useId();
  const descriptionId = React.useId();
  const feedback = useBevelFeedback();

  return (
    <div
      data-slot="breaker"
      data-state={state}
      data-disabled={disabled ? '' : undefined}
      className={cn('group/breaker flex w-24 flex-col items-center gap-2 text-center', className)}
    >
      <SwitchPrimitive.Root
        data-slot="breaker-switch"
        checked={checked && !tripped}
        onCheckedChange={(next, details) => {
          if (checkedProp === undefined) setUncontrolled(next);
          feedback.thunk();
          onCheckedChange?.(next, details);
        }}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={description ? `${statusId} ${descriptionId}` : statusId}
        className={cn(
          'bevel-recessed relative flex h-(--breaker-slot-height) w-12 items-center justify-center rounded-(--bevel-radius-sm) outline-none',
          'cursor-pointer focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-(--breaker-panel)',
          'data-disabled:cursor-not-allowed',
        )}
        {...props}
      >
        <span
          aria-hidden
          className="absolute top-1.5 left-1/2 hidden h-2 w-5 -translate-x-1/2 rounded-full bg-(--breaker-tripped) group-data-[state=tripped]/breaker:block"
        />
        <SwitchPrimitive.Thumb
          data-slot="breaker-lever"
          className={cn(
            'bevel-raised block h-7 w-8 rounded-(--bevel-radius-xs)',
            'translate-y-(--breaker-throw) data-checked:-translate-y-(--breaker-throw) group-data-[state=tripped]/breaker:translate-y-0',
            'transition-[translate] duration-(--bevel-duration-small) ease-(--bevel-ease-spring) motion-reduce:transition-none',
          )}
        />
      </SwitchPrimitive.Root>
      <span className="flex items-center gap-1.5 text-(length:--bevel-fine) font-semibold tracking-(--bevel-tracking-print) uppercase">
        <span aria-hidden className="bevel-led size-1.5 rounded-full" />
        <span id={statusId}>{stateText[state]}</span>
      </span>
      <span
        data-slot="breaker-label"
        className="bevel-paper w-full rounded-(--bevel-radius-xs) px-1.5 py-1 text-(length:--bevel-fine) leading-tight font-semibold"
      >
        <span id={labelId}>{label}</span>
        {description && (
          <span id={descriptionId} className="block font-normal text-(--bevel-paper-muted)">
            {description}
          </span>
        )}
      </span>
    </div>
  );
}

export { BreakerPanel, BreakerPanelTitle, BreakerRow, Breaker };
export type { BreakerProps, BreakerState };
