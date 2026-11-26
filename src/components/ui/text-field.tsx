'use client';

import * as React from 'react';
import { Field } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';
import { cn } from 'cn';

type TextFieldProps = Field.Root.Props & {
  /** Row height: sm for dense forms and toolbars, md for everything else. */
  size?: 'sm' | 'md';
};

/**
 * A text field: a printed label, a slot cut into the panel, and the lines
 * under it. Focus lights the slot's edge; an invalid field lights a red lamp
 * by its label. Wraps Base UI Field, so label, description and error are
 * wired to the control for you.
 */
function TextField({ className, size = 'md', ...props }: TextFieldProps) {
  return (
    <Field.Root
      data-slot="text-field"
      data-size={size}
      className={cn('flex min-w-0 flex-col gap-1.5', className)}
      {...props}
    />
  );
}

/** The printed label. Carries the error lamp, lit while the field is invalid. */
function TextFieldLabel({ className, children, ...props }: Field.Label.Props) {
  return (
    <Field.Label
      data-slot="text-field-label"
      className={cn(
        'flex w-fit items-center gap-1.5 text-(length:--bevel-label) font-semibold tracking-(--bevel-tracking-label) text-(--text-field-print) uppercase',
        className,
      )}
      {...props}
    >
      {children}
      <span
        aria-hidden
        data-slot="text-field-lamp"
        className="bevel-led size-1.5 shrink-0 rounded-full opacity-0 transition-opacity duration-(--bevel-duration-small) ease-(--bevel-ease-out) in-data-invalid:opacity-100 motion-reduce:transition-none"
      />
    </Field.Label>
  );
}

// flex-1 only inside a slot: on a bare input in the field's column, its 0% basis beats the height.
const control =
  'min-w-0 in-data-[slot=text-field-slot]:flex-1 text-sm text-foreground focus-visible:outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:text-muted-foreground';

/**
 * The slot, when the field has adornments: an icon, a unit, a key hint.
 * Put TextFieldAdornment, TextFieldKbd and the control inside it; pressing
 * anywhere in the slot focuses the control.
 */
function TextFieldSlot({ className, onPointerDown, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="text-field-slot"
      onPointerDown={(event) => {
        onPointerDown?.(event);
        const target = event.target as HTMLElement;
        if (event.defaultPrevented || target.closest('input, textarea, button, a')) return;
        const field = event.currentTarget.querySelector<HTMLElement>('input, textarea');
        if (!field || (field as HTMLInputElement).disabled) return;
        event.preventDefault();
        field.focus();
      }}
      className={cn(
        'text-field-well flex min-h-(--text-field-height) w-full cursor-text items-center gap-2 rounded-(--bevel-radius-sm) px-3 in-data-disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
}

/** The input. Alone it is its own slot; inside TextFieldSlot it fills the slot. */
function TextFieldInput({ className, ...props }: Input.Props) {
  return (
    <Input
      data-slot="text-field-input"
      className={cn(
        control,
        'text-field-well h-(--text-field-height) rounded-(--bevel-radius-sm) px-3',
        'in-data-[slot=text-field-slot]:h-auto in-data-[slot=text-field-slot]:self-stretch in-data-[slot=text-field-slot]:rounded-none in-data-[slot=text-field-slot]:px-0',
        className,
      )}
      {...props}
    />
  );
}

/** A multi-line input in the same slot. Grows with its rows; resize vertically. */
function TextFieldTextarea({
  className,
  ...props
}: Omit<Field.Control.Props, 'render'> & React.ComponentProps<'textarea'>) {
  return (
    <Field.Control
      data-slot="text-field-textarea"
      render={<textarea />}
      className={cn(
        control,
        'text-field-well min-h-(--text-field-textarea-height) resize-y rounded-(--bevel-radius-sm) px-3 py-2 leading-relaxed',
        'in-data-[slot=text-field-slot]:rounded-none in-data-[slot=text-field-slot]:px-0',
        className,
      )}
      {...(props as Field.Control.Props)}
    />
  );
}

/** Something printed in the slot beside the text: an icon, a unit, a prefix. Decorative unless you label it. */
function TextFieldAdornment({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="text-field-adornment"
      className={cn(
        'flex shrink-0 items-center text-sm text-(--text-field-print) select-none [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}

/** A small keycap in the slot: the shortcut that focuses the field. */
function TextFieldKbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="text-field-kbd"
      className={cn(
        'bevel-raised inline-flex h-5 shrink-0 items-center rounded-(--bevel-radius-xs) px-1.5 font-mono text-(length:--bevel-fine) leading-none text-(--text-field-key-print) select-none',
        className,
      )}
      {...props}
    />
  );
}

/** A line under the slot saying what goes in it. Linked to the control with aria-describedby. */
function TextFieldDescription({ className, ...props }: Field.Description.Props) {
  return (
    <Field.Description
      data-slot="text-field-description"
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

/**
 * What's wrong, shown while the field is invalid and announced as it
 * appears. Pass match to show it for one validity state (valueMissing,
 * typeMismatch…), or match={true} to show it whenever it's rendered.
 */
function TextFieldError({ className, ...props }: Field.Error.Props) {
  return (
    <Field.Error
      data-slot="text-field-error"
      role="alert"
      className={cn('text-xs font-medium text-(--text-field-error-print)', className)}
      {...props}
    />
  );
}

export {
  TextField,
  TextFieldLabel,
  TextFieldSlot,
  TextFieldInput,
  TextFieldTextarea,
  TextFieldAdornment,
  TextFieldKbd,
  TextFieldDescription,
  TextFieldError,
};
export type { TextFieldProps };
