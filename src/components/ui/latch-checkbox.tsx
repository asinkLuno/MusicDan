import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { CheckboxGroup } from '@base-ui/react/checkbox-group';
import { Field } from '@base-ui/react/field';
import { cn } from 'cn';
import { useBevelFeedback } from '@/lib/feedback';

/**
 * A checkbox as a latching push-key. Press it and it sinks and stays down
 * with its mark lit; press again and it springs back up. Mixed sits the key
 * half-down with a dash. A Base UI Checkbox: Space toggles it.
 */
function LatchCheckbox({ className, onCheckedChange, ...props }: CheckboxPrimitive.Root.Props) {
  const feedback = useBevelFeedback();
  return (
    <CheckboxPrimitive.Root
      data-slot="latch-checkbox"
      onCheckedChange={(checked, details) => {
        feedback.click();
        onCheckedChange?.(checked, details);
      }}
      className={cn(
        'group/latch bevel-recessed inline-flex size-(--latch-checkbox-size) shrink-0 cursor-pointer items-start justify-center rounded-(--bevel-radius-xs) pt-px',
        'outline-none focus-visible:ring-2 focus-visible:ring-(--latch-checkbox-focus) focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'data-disabled:cursor-not-allowed data-disabled:opacity-60',
        'in-data-[slot=latch-checkbox-field]:row-span-2 in-data-[slot=latch-checkbox-field]:mt-px',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        data-slot="latch-checkbox-cap"
        className={cn(
          'bevel-raised grid size-(--latch-checkbox-cap) place-items-center rounded-(--latch-checkbox-cap-radius)',
          // Released: springs back up. Pressed: goes down fast and latches.
          'transition-[translate] duration-(--bevel-duration-move) ease-(--bevel-ease-spring) motion-reduce:transition-none',
          'group-data-checked/latch:bevel-pressed group-data-checked/latch:translate-y-(--latch-checkbox-travel) group-data-checked/latch:duration-(--bevel-duration-press) group-data-checked/latch:ease-(--bevel-ease-out)',
          'group-data-indeterminate/latch:translate-y-(--latch-checkbox-half) group-data-indeterminate/latch:duration-(--bevel-duration-press) group-data-indeterminate/latch:ease-(--bevel-ease-out)',
        )}
      >
        <CheckboxPrimitive.Indicator
          keepMounted
          data-slot="latch-checkbox-mark"
          className="latch-checkbox-mark grid size-full place-items-center opacity-0 transition-opacity duration-(--bevel-duration-small) ease-(--bevel-ease-out) data-checked:opacity-100 data-indeterminate:opacity-100 motion-reduce:transition-none"
        >
          <svg
            viewBox="0 0 12 12"
            fill="none"
            className="size-(--latch-checkbox-glyph) group-data-indeterminate/latch:hidden"
          >
            <path
              d="M2.5 6.25 5 8.75l4.5-5.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <svg
            viewBox="0 0 12 12"
            fill="none"
            className="hidden size-(--latch-checkbox-glyph) group-data-indeterminate/latch:block"
          >
            <path d="M3 6h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}

/**
 * One checkbox with its label and an optional description: the key on the
 * left, the words beside it. Base UI Field, so clicking the label presses
 * the key and the description is announced with it.
 */
function LatchCheckboxField({ className, ...props }: Field.Root.Props) {
  return (
    <Field.Root
      data-slot="latch-checkbox-field"
      className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2.5 gap-y-0.5', className)}
      {...props}
    />
  );
}

function LatchCheckboxLabel({ className, ...props }: Field.Label.Props) {
  return (
    <Field.Label
      data-slot="latch-checkbox-label"
      className={cn('col-start-2 text-sm leading-(--latch-checkbox-size) font-medium text-foreground', className)}
      {...props}
    />
  );
}

function LatchCheckboxDescription({ className, ...props }: Field.Description.Props) {
  return (
    <Field.Description
      data-slot="latch-checkbox-description"
      className={cn('col-start-2 text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

/**
 * A set of checkboxes sharing one value: the values that are down. Name it
 * with aria-labelledby. A LatchCheckbox with parent toggles them all and
 * shows mixed when some are down (pass allValues).
 */
function LatchCheckboxGroup({ className, ...props }: CheckboxGroup.Props) {
  return (
    <CheckboxGroup data-slot="latch-checkbox-group" className={cn('flex flex-col gap-2.5', className)} {...props} />
  );
}

export { LatchCheckbox, LatchCheckboxField, LatchCheckboxLabel, LatchCheckboxDescription, LatchCheckboxGroup };
