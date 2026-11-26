'use client';

import * as React from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from 'cn';
import { useBevelFeedback } from '@/lib/feedback';

type KeyContextValue = { pending: boolean };

const KeyContext = React.createContext<KeyContextValue>({ pending: false });

type KeyProps = ButtonPrimitive.Props & {
  /** primary: the lit key for the main action. secondary: a plain cap. ghost: engraved, no body until pressed. danger: a red key. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** Heights match shadcn's buttons: sm 32px, md 36px, lg 40px, side included. */
  size?: 'sm' | 'md' | 'lg';
  /** The key latches down while its action runs and pops back up when this goes false. */
  pending?: boolean;
  /** A square cap for a single icon. Prefer IconKey, which also requires a label. */
  square?: boolean;
};

/**
 * A keycap button. The cap sits on a visible side and travels down by its
 * depth when pressed, by pointer, Space or Enter. While `pending`, it latches
 * down and stays there until the work is done.
 */
function Key({
  className,
  variant = 'primary',
  size = 'md',
  pending = false,
  square = false,
  disabled = false,
  focusableWhenDisabled,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  onBlur,
  children,
  ...props
}: KeyProps) {
  const [down, setDown] = React.useState(false);
  const feedback = useBevelFeedback();
  const live = !disabled && !pending;
  const press = () => {
    if (!live) return;
    setDown(true);
    feedback.click();
  };
  const release = () => setDown(false);

  React.useEffect(() => {
    if (!live) setDown(false);
  }, [live]);

  const context = React.useMemo(() => ({ pending }), [pending]);
  return (
    <KeyContext value={context}>
      <ButtonPrimitive
        {...props}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (event.button === 0) press();
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          release();
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          release();
        }}
        onPointerCancel={(event) => {
          onPointerCancel?.(event);
          release();
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) press();
        }}
        onKeyUp={(event) => {
          onKeyUp?.(event);
          if (event.key === ' ' || event.key === 'Enter') release();
        }}
        onBlur={(event) => {
          onBlur?.(event);
          release();
        }}
        // A busy key keeps focus so keyboard users don't lose their place.
        disabled={disabled || pending}
        focusableWhenDisabled={focusableWhenDisabled ?? pending}
        aria-busy={pending || undefined}
        data-slot="key"
        data-variant={variant}
        data-size={size}
        data-square={square ? '' : undefined}
        data-pressed={down ? '' : undefined}
        data-state={pending ? 'pending' : disabled ? 'disabled' : undefined}
        className={cn(
          'group/key relative isolate inline-flex shrink-0 flex-col rounded-(--bevel-radius-sm) pb-(--key-depth) align-middle outline-none select-none',
          'h-9 data-[size=lg]:h-10 data-[size=sm]:h-8',
          'data-square:w-9 data-square:data-[size=lg]:w-10 data-square:data-[size=sm]:w-8',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          'data-[state=disabled]:cursor-not-allowed data-[state=pending]:cursor-progress',
          'forced-colors:border forced-colors:border-[ButtonText]',
          className as string,
        )}
      >
        {/* The side of the key: visible below the cap until it travels down over it. */}
        <span
          aria-hidden
          data-slot="key-side"
          className="absolute inset-x-0 top-(--key-depth) bottom-0 -z-1 rounded-(--bevel-radius-sm) bg-(--key-cap-side) shadow-(--key-cast)"
        />
        <span
          data-slot="key-cap"
          className={cn(
            'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-(--bevel-radius-sm) px-3 text-sm font-semibold whitespace-nowrap text-(--key-cap-foreground)',
            'group-data-[size=lg]/key:px-4 group-data-[size=sm]/key:gap-1 group-data-[size=sm]/key:px-2.5 group-data-[size=sm]/key:text-xs group-data-square/key:px-0',
            'bg-(--key-cap) bg-linear-to-b from-(--key-cap-sheen) to-transparent to-60% shadow-(--key-cap-light)',
            // Released: the spring pushes the cap back up with a small overshoot.
            'transition-[translate,filter] duration-(--bevel-duration-move) ease-(--bevel-ease-spring) motion-reduce:transition-none',
            'group-hover/key:brightness-105',
            // Pressed: down by the side's depth, quickly.
            'group-data-pressed/key:translate-y-(--key-depth) group-data-pressed/key:duration-(--bevel-duration-press) group-data-pressed/key:ease-(--bevel-ease-out)',
            // Busy: latched down and dimmed.
            'group-data-[state=pending]/key:translate-y-(--key-depth) group-data-[state=pending]/key:brightness-90 group-data-[state=pending]/key:duration-(--bevel-duration-press) group-data-[state=pending]/key:ease-(--bevel-ease-out)',
            // Disabled: sunk into its housing, matte.
            'group-data-[state=disabled]/key:translate-y-(--key-depth) group-data-[state=disabled]/key:bg-none group-data-[state=disabled]/key:text-(--key-cap-foreground)/60 group-data-[state=disabled]/key:saturate-50 group-data-[state=disabled]/key:brightness-100',
            "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 group-data-[size=sm]/key:[&_svg:not([class*='size-'])]:size-3.5",
          )}
        >
          {children}
        </span>
      </ButtonPrimitive>
    </KeyContext>
  );
}

/**
 * A small lamp on the cap. Dark at rest; it glows while the key is pending.
 * Put it first or last among the key's children.
 */
function KeyLamp({ className, ...props }: React.ComponentProps<'span'>) {
  const { pending } = React.useContext(KeyContext);
  return (
    <span
      aria-hidden
      data-slot="key-lamp"
      data-lit={pending ? '' : undefined}
      className={cn(
        'relative size-1.5 shrink-0 rounded-full bg-(--key-lamp-off) shadow-(--bevel-depth-pressed)',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'bevel-led absolute inset-0 rounded-full opacity-0 transition-opacity duration-(--bevel-duration-small) ease-(--bevel-ease-out) motion-reduce:transition-none',
          'in-data-lit:opacity-100',
        )}
      />
    </span>
  );
}

export { Key, KeyLamp };
export type { KeyProps };
