'use client';

import * as React from 'react';
import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cn } from 'cn';
import { useBevelFeedback } from '@/lib/feedback';

type Bit = { value: string; label: string; id: string };

type DipSwitchContextValue = {
  bits: Bit[];
  on: string[];
  disabled: boolean;
  register: (bit: Bit) => () => void;
  set: (value: string, checked: boolean) => void;
};

const DipSwitchContext = React.createContext<DipSwitchContextValue | null>(null);

function useDipSwitch() {
  const context = React.useContext(DipSwitchContext);
  if (!context) throw new Error('DipSwitch parts must be inside <DipSwitch>');
  return context;
}

type DipSwitchProps = Omit<React.ComponentProps<'div'>, 'defaultValue' | 'onChange'> & {
  /** The switches that are on, by value. */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  /** Locks every switch. Say why with aria-describedby. */
  disabled?: boolean;
  /** Housing colour. */
  variant?: 'red' | 'blue' | 'black';
};

/**
 * A bank of DIP switches: tiny numbered slide switches for flags and config
 * bits, ON at the top. List them as DipSwitchToggle children inside
 * DipSwitchBank; switch 1 is the lowest bit. Give it an aria-label.
 */
function DipSwitch({
  className,
  value: valueProp,
  defaultValue = [],
  onValueChange,
  disabled = false,
  variant = 'red',
  children,
  ...props
}: DipSwitchProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const on = valueProp ?? uncontrolled;
  const [bits, setBits] = React.useState<Bit[]>([]);

  const register = React.useCallback((bit: Bit) => {
    // Switches keep the order they mounted in, which is their order on the bank.
    setBits((all) =>
      all.some((b) => b.value === bit.value) ? all.map((b) => (b.value === bit.value ? bit : b)) : [...all, bit],
    );
    return () => setBits((all) => all.filter((b) => b.value !== bit.value));
  }, []);

  const set = React.useCallback(
    (value: string, checked: boolean) => {
      const next = checked ? [...on.filter((v) => v !== value), value] : on.filter((v) => v !== value);
      if (valueProp === undefined) setUncontrolled(next);
      onValueChange?.(next);
    },
    [on, valueProp, onValueChange],
  );

  const context = React.useMemo(() => ({ bits, on, disabled, register, set }), [bits, on, disabled, register, set]);
  return (
    <DipSwitchContext value={context}>
      <div
        role="group"
        data-slot="dip-switch"
        data-variant={variant}
        data-disabled={disabled ? '' : undefined}
        className={cn('inline-flex flex-col gap-4', className)}
        {...props}
      >
        {children}
      </div>
    </DipSwitchContext>
  );
}

/** The plastic housing the switches sit in, with ON printed above them. */
function DipSwitchBank({ className, children, ...props }: React.ComponentProps<'div'>) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Arrow keys move along the bank; Space flips the switch in focus.
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const switches = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[role="switch"]:not([aria-disabled="true"])'),
    ];
    const i = switches.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    switches[Math.min(switches.length - 1, Math.max(0, i + step))]?.focus();
    event.preventDefault();
  };
  return (
    <div
      data-slot="dip-switch-bank"
      onKeyDown={onKeyDown}
      className={cn(
        'bevel-plastic relative inline-flex w-fit flex-col gap-1 rounded-(--bevel-radius-xs) px-2 pt-1.5 pb-1 text-(--dip-switch-print) in-data-disabled:opacity-60',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="flex items-center gap-1 text-(length:--dip-switch-print-size) leading-none font-bold tracking-(--bevel-tracking-print)"
      >
        <span className="dip-switch-arrow" />
        ON
      </span>
      <div className="flex gap-(--dip-switch-gap)">{children}</div>
    </div>
  );
}

type DipSwitchToggleProps = Omit<
  SwitchPrimitive.Root.Props,
  'checked' | 'defaultChecked' | 'onCheckedChange' | 'value' | 'children'
> & {
  value: string;
  /** What the switch controls; it's named by its number and this. */
  children: string;
};

/** One switch. Its number is its position on the bank; its label shows in DipSwitchLegend. */
function DipSwitchToggle({ className, value, children, disabled: disabledProp, ...props }: DipSwitchToggleProps) {
  const { bits, on, disabled, register, set } = useDipSwitch();
  const feedback = useBevelFeedback();
  const id = React.useId();
  React.useEffect(() => register({ value, label: children, id }), [value, children, id, register]);
  const index = bits.findIndex((b) => b.value === value);
  const number = index + 1;
  const checked = on.includes(value);
  return (
    <span data-slot="dip-switch-position" className="flex flex-col items-center gap-0.5">
      <SwitchPrimitive.Root
        id={id}
        data-slot="dip-switch-toggle"
        checked={checked}
        disabled={disabled || disabledProp}
        aria-label={number > 0 ? `${number}: ${children}` : children}
        onCheckedChange={(next) => {
          feedback.toggle();
          set(value, next);
        }}
        className={cn(
          'bevel-recessed relative flex h-(--dip-switch-slot-height) w-(--dip-switch-slot-width) cursor-pointer justify-center rounded-(--bevel-radius-xs) py-0.5',
          'outline-none focus-visible:ring-2 focus-visible:ring-(--dip-switch-focus) focus-visible:ring-offset-1 focus-visible:ring-offset-(--dip-switch-body) data-disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          data-slot="dip-switch-actuator"
          className={cn(
            'bevel-raised block h-(--dip-switch-actuator-height) w-full rounded-(--bevel-radius-xs)',
            'translate-y-(--dip-switch-throw) data-checked:translate-y-0',
            'transition-[translate] duration-(--bevel-duration-press) ease-(--bevel-ease-out) motion-reduce:transition-none',
          )}
        />
      </SwitchPrimitive.Root>
      <span aria-hidden className="text-(length:--dip-switch-print-size) leading-none font-bold tabular-nums">
        {number > 0 ? number : ''}
      </span>
    </span>
  );
}

/** The key printed beside the bank: each switch's number, what it does, and whether it's on. */
function DipSwitchLegend({ className, ...props }: React.ComponentProps<'ol'>) {
  const { bits, on } = useDipSwitch();
  return (
    <ol aria-hidden data-slot="dip-switch-legend" className={cn('flex flex-col gap-1 text-sm', className)} {...props}>
      {bits.map((bit, i) => {
        const checked = on.includes(bit.value);
        return (
          <li key={bit.value} data-checked={checked ? '' : undefined} className="flex items-baseline gap-2">
            <span className="w-4 text-right font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{bit.label}</span>
            <span className="font-mono text-xs font-semibold text-muted-foreground in-data-checked:text-foreground">
              {checked ? 'ON' : 'OFF'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

type DipSwitchReadoutProps = React.ComponentProps<'span'> & {
  /** How to show the bits: binary, hex or decimal. */
  format?: 'binary' | 'hex' | 'decimal';
};

/** The bank as a number. Switch 1 is the lowest bit; binary reads highest first, as written. */
function DipSwitchReadout({ className, format = 'hex', ...props }: DipSwitchReadoutProps) {
  const { bits, on } = useDipSwitch();
  const n = bits.reduce((sum, bit, i) => (on.includes(bit.value) ? sum + 2 ** i : sum), 0);
  const binary = bits
    .map((bit) => (on.includes(bit.value) ? '1' : '0'))
    .reverse()
    .join('');
  const text =
    format === 'binary'
      ? `0b${binary}`
      : format === 'decimal'
        ? String(n)
        : `0x${n
            .toString(16)
            .toUpperCase()
            .padStart(Math.max(1, Math.ceil(bits.length / 4)), '0')}`;
  return (
    <span data-slot="dip-switch-readout" className={cn('font-mono text-sm tabular-nums', className)} {...props}>
      {text}
    </span>
  );
}

export { DipSwitch, DipSwitchBank, DipSwitchToggle, DipSwitchLegend, DipSwitchReadout };
export type { DipSwitchProps, DipSwitchToggleProps, DipSwitchReadoutProps };
