import * as React from 'react';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Tabs } from '@base-ui/react/tabs';
import { cn } from 'cn';
import { useBevelFeedback } from '@/lib/feedback';

/*
 * A row of interlocked preset keys, as on a car radio or a tape deck: press
 * one and it latches down, and the one that was down springs back up. Only
 * one is ever down. PresetTabs switches panels (Base UI Tabs); PresetKeys
 * picks a value (Base UI RadioGroup).
 */

type Size = 'sm' | 'md';

const bed =
  'bevel-recessed inline-flex max-w-full items-stretch gap-(--preset-keys-gap) overflow-x-auto rounded-(--bevel-radius-sm) p-(--preset-keys-inset) focus-visible:outline-none';

const key = cn(
  'bevel-raised group/key inline-flex h-(--preset-keys-height) shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-(--preset-keys-key-radius) px-(--preset-keys-pad) text-(length:--preset-keys-text) font-medium whitespace-nowrap text-(--preset-keys-print) select-none',
  // Popping up: released by the next key, it springs back.
  'transition-[translate] duration-(--bevel-duration-move) ease-(--bevel-ease-spring) motion-reduce:transition-none',
  'outline-none focus-visible:ring-2 focus-visible:ring-(--preset-keys-focus) focus-visible:ring-inset',
  'data-disabled:cursor-not-allowed data-disabled:opacity-50',
  '[&_svg]:size-3.5 [&_svg]:shrink-0',
);

function Lamp() {
  return <span aria-hidden data-slot="preset-keys-lamp" className="preset-keys-lamp size-1.5 shrink-0 rounded-full" />;
}

/* Panels */

type PresetTabsProps = Tabs.Root.Props;

/** Tabs whose tabs are preset keys. Base UI Tabs: arrow keys move along the row, Enter or Space presses. */
function PresetTabs({ className, onValueChange, ...props }: PresetTabsProps) {
  const feedback = useBevelFeedback();
  return (
    <Tabs.Root
      data-slot="preset-tabs"
      onValueChange={(value, details) => {
        feedback.click();
        onValueChange?.(value, details);
      }}
      className={cn('flex flex-col gap-3', className)}
      {...props}
    />
  );
}

type PresetTabsListProps = Tabs.List.Props & {
  /** sm for a page's Preview/Code row and toolbars; md for a screen's main sections. */
  size?: Size;
};

/** The keybed the tabs sit in. */
function PresetTabsList({ className, size = 'md', ...props }: PresetTabsListProps) {
  return <Tabs.List data-slot="preset-tabs-list" data-size={size} className={cn(bed, 'w-fit', className)} {...props} />;
}

/** One tab: a key with a lamp that lights while it's down. */
function PresetTabsTab({ className, children, ...props }: Tabs.Tab.Props) {
  return (
    <Tabs.Tab
      data-slot="preset-tabs-tab"
      className={cn(
        key,
        // Down: pressed in fast, and latched.
        'data-active:bevel-pressed data-active:translate-y-(--preset-keys-travel) data-active:text-(--preset-keys-print-down) data-active:duration-(--bevel-duration-press) data-active:ease-(--bevel-ease-out)',
        className,
      )}
      {...props}
    >
      <Lamp />
      {children}
    </Tabs.Tab>
  );
}

function PresetTabsPanel({ className, ...props }: Tabs.Panel.Props) {
  return (
    <Tabs.Panel
      data-slot="preset-tabs-panel"
      className={cn(
        'rounded-(--bevel-radius-sm) outline-none focus-visible:ring-2 focus-visible:ring-(--preset-keys-focus)',
        className,
      )}
      {...props}
    />
  );
}

/* Values */

type PresetKeysProps<Value = string> = RadioGroup.Props<Value> & {
  size?: Size;
};

/**
 * A segmented control: one value from a few, as interlocked keys. Base UI
 * RadioGroup, so exactly one is down, arrow keys move and press, and it
 * submits with a form under name. Give it an aria-label.
 */
function PresetKeys<Value = string>({ className, size = 'md', onValueChange, ...props }: PresetKeysProps<Value>) {
  const feedback = useBevelFeedback();
  return (
    <RadioGroup<Value>
      data-slot="preset-keys"
      data-size={size}
      onValueChange={(value, details) => {
        feedback.click();
        onValueChange?.(value, details);
      }}
      className={cn(bed, 'w-fit', className)}
      {...props}
    />
  );
}

/** One key in PresetKeys. */
function PresetKey<Value = string>({ className, children, ...props }: Radio.Root.Props<Value>) {
  return (
    <Radio.Root<Value>
      data-slot="preset-key"
      className={cn(
        key,
        'data-checked:bevel-pressed data-checked:translate-y-(--preset-keys-travel) data-checked:text-(--preset-keys-print-down) data-checked:duration-(--bevel-duration-press) data-checked:ease-(--bevel-ease-out)',
        className,
      )}
      {...props}
    >
      <Lamp />
      {children}
    </Radio.Root>
  );
}

export { PresetTabs, PresetTabsList, PresetTabsTab, PresetTabsPanel, PresetKeys, PresetKey };
export type { PresetTabsProps, PresetTabsListProps, PresetKeysProps };
