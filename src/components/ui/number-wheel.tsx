import * as React from 'react';
import { cn } from 'cn';
import { formatAmountParts, type AmountFormat } from '@/lib/format-amount';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

type NumberWheelProps = AmountFormat &
  Omit<React.ComponentProps<'span'>, 'children'> & {
    /** Drum colour: ivory with dark figures, or black with light ones. */
    tone?: 'ivory' | 'black';
    /**
     * Announce changes to screen readers. Leave "off" while a value ticks
     * continuously and switch to "polite" when it settles.
     */
    live?: 'off' | 'polite';
  };

/**
 * Mechanical rolling digits. Each digit is a printed drum that turns to its
 * figure; separators and symbols are fixed plates between the drums.
 */
function NumberWheel({
  value,
  currency,
  locale,
  format,
  tone = 'ivory',
  live = 'off',
  className,
  ...props
}: NumberWheelProps) {
  const parts = React.useMemo(
    () => formatAmountParts({ value, currency, locale, format }),
    [value, currency, locale, format],
  );
  const text = parts.map((part) => part.value).join('');
  // Key characters from the right so the ones digit keeps its drum as the number grows.
  const chars = text.split('');

  return (
    <span
      data-slot="number-wheel"
      data-tone={tone}
      className={cn(
        'bevel-recessed relative inline-flex items-stretch gap-px overflow-hidden rounded-(--bevel-radius-xs) p-px leading-none font-semibold',
        className,
      )}
      {...props}
    >
      <span className="sr-only" aria-live={live}>
        {text}
      </span>
      {chars.map((char, i) => {
        const fromRight = chars.length - 1 - i;
        const digit = DIGITS.indexOf(char);
        if (digit === -1) {
          return (
            <span
              key={`s${fromRight}`}
              aria-hidden
              data-slot="number-wheel-separator"
              className="number-wheel-drum flex h-(--number-wheel-cell) items-center px-(--number-wheel-plate)"
            >
              {char}
            </span>
          );
        }
        return (
          <span
            key={`d${fromRight}`}
            aria-hidden
            data-slot="number-wheel-drum"
            className="number-wheel-drum relative h-(--number-wheel-cell) w-(--number-wheel-drum) overflow-hidden"
          >
            <span
              className="absolute inset-x-0 top-0 flex flex-col tabular-nums transition-[translate] duration-(--bevel-duration-move) ease-(--bevel-ease-in-out) motion-reduce:transition-none"
              style={{
                translate: `0 calc(var(--number-wheel-cell) * ${-digit})`,
                // Lower digits turn first, like a real counter.
                transitionDelay: `calc(var(--bevel-stagger) * ${fromRight})`,
              }}
            >
              {DIGITS.map((d) => (
                <span key={d} className="flex h-(--number-wheel-cell) items-center justify-center">
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
      <span aria-hidden className="bevel-glass absolute inset-0" />
    </span>
  );
}

export { NumberWheel };
export type { NumberWheelProps };
