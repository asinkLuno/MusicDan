import * as React from 'react';

export type AmountFormat = {
  value: number;
  /** ISO 4217 code. Omit for a plain number (credits, tokens…). */
  currency?: string;
  /** Fixed by default so server and client render the same string. */
  locale?: Intl.LocalesArgument;
  /** Merged over the defaults. */
  format?: Intl.NumberFormatOptions;
};

export function formatAmountParts({ value, currency, locale = 'en-US', format }: AmountFormat) {
  return new Intl.NumberFormat(locale, {
    ...(currency ? { style: 'currency', currency } : { maximumFractionDigits: 0 }),
    ...format,
  }).formatToParts(value);
}

export function formatAmount(options: AmountFormat) {
  return formatAmountParts(options)
    .map((part) => part.value)
    .join('');
}

export function useAmountParts({ value, currency, locale, format }: AmountFormat) {
  return React.useMemo(() => formatAmountParts({ value, currency, locale, format }), [value, currency, locale, format]);
}

// Tabular figures keep digits from shifting as amounts change, but some
// fonts make separators tabular too, so apply them to digit groups only.
export const isDigitPart = (type: Intl.NumberFormatPartTypes) => type === 'integer' || type === 'fraction';
