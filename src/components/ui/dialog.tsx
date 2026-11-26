import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { cn } from 'cn';

type Fasteners = 'screws' | 'stitch' | 'none';

/* The room's lights go down slowly, and come back up quicker. */
const dim = cn(
  'dialog-dim fixed inset-0 z-50',
  'transition-opacity duration-(--bevel-duration-ambient) ease-(--bevel-ease-in-out) motion-reduce:transition-none',
  'data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-(--bevel-duration-move) data-ending-style:ease-(--bevel-ease-out)',
);

const viewport =
  'fixed inset-0 z-50 flex items-center justify-center p-4 data-[align=top]:items-start data-[align=top]:pt-(--dialog-top)';

/* The panel rises onto the desk and settles; it leaves quickly. */
const panel = cn(
  'dialog-panel relative flex max-h-full w-full flex-col overflow-hidden rounded-(--bevel-radius-lg) text-sm outline-none',
  'transition-[translate,opacity] duration-(--bevel-duration-move) ease-(--bevel-ease-spring) motion-reduce:transition-none',
  'data-starting-style:translate-y-(--dialog-rise) data-starting-style:opacity-0',
  'data-ending-style:translate-y-(--dialog-rise) data-ending-style:opacity-0 data-ending-style:duration-(--bevel-duration-small) data-ending-style:ease-(--bevel-ease-out)',
  'forced-colors:border forced-colors:border-[CanvasText]',
);

const key = cn(
  'bevel-raised inline-flex h-8 items-center justify-center gap-1.5 rounded-(--bevel-radius-sm) px-3 text-sm font-medium whitespace-nowrap text-(--dialog-key-ink) outline-none select-none',
  'transition-[translate] duration-(--bevel-duration-press) ease-(--bevel-ease-out) motion-reduce:transition-none',
  'active:translate-y-px active:bevel-pressed focus-visible:ring-2 focus-visible:ring-(--bevel-pen-blue)/60 focus-visible:ring-offset-1',
  'data-disabled:pointer-events-none data-disabled:opacity-50',
  'forced-colors:border forced-colors:border-[ButtonText]',
);

/** Screws at the four corners, each at its own angle, or a stitched edge. Decorative. */
function DialogFasteners({ fasteners }: { fasteners: Fasteners }) {
  if (fasteners === 'none') return null;
  if (fasteners === 'stitch')
    return (
      <span
        aria-hidden
        data-slot="dialog-stitch"
        className="pointer-events-none absolute inset-(--bevel-stitch-inset) rounded-[calc(var(--bevel-radius-lg)-var(--bevel-stitch-inset))] border-(length:--bevel-stitch-width) border-dashed border-(--dialog-stitch)"
      />
    );
  return (
    <span aria-hidden data-slot="dialog-screws" className="pointer-events-none absolute inset-(--dialog-screw-inset)">
      <span className="dialog-screw absolute top-0 left-0" />
      <span className="dialog-screw absolute top-0 right-0" />
      <span className="dialog-screw absolute bottom-0 left-0" />
      <span className="dialog-screw absolute right-0 bottom-0" />
    </span>
  );
}

function CornerClose() {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-corner-close"
      aria-label="Close"
      className="absolute top-4 right-4 z-10 inline-flex size-7 items-center justify-center rounded-(--bevel-radius-sm) text-(--dialog-panel-muted) outline-none hover:text-(--dialog-panel-foreground) focus-visible:ring-2 focus-visible:ring-(--bevel-pen-blue)/60"
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </DialogPrimitive.Close>
  );
}

/* Dialog ------------------------------------------------------------------ */

/** A trigger and the panel it brings up. Escape, the backdrop and Close all put it away, and focus returns to the trigger. */
function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

/** Opens the dialog. Renders a button; pass `render` to use your own. */
function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

type DialogContentProps = DialogPrimitive.Popup.Props & {
  /** "top" sits the panel near the top of the screen, for a command palette. */
  align?: 'center' | 'top';
  /** What holds the panel down at its corners. */
  fasteners?: Fasteners;
  /** A × in the top corner. Turn off when the content has its own way out. */
  showCloseButton?: boolean;
};

/**
 * The lights go down and the panel rises onto the desk. No padding of its
 * own: compose DialogHeader, DialogBody and DialogFooter, or put a command
 * palette straight in.
 */
function DialogContent({
  className,
  children,
  align = 'center',
  fasteners = 'screws',
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop data-slot="dialog-backdrop" className={dim} />
      <DialogPrimitive.Viewport data-slot="dialog-viewport" data-align={align} className={viewport}>
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          data-fasteners={fasteners}
          className={cn(panel, 'max-w-(--dialog-width)', className)}
          {...props}
        >
          <DialogFasteners fasteners={fasteners} />
          {children}
          {showCloseButton && <CornerClose />}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  );
}

/** Title and description. Leaves room for the corner ×. */
function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex shrink-0 flex-col gap-1.5 px-6 pt-6 pr-12', className)}
      {...props}
    />
  );
}

/** Names the dialog for screen readers. */
function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-base leading-tight font-semibold', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-(--dialog-panel-muted)', className)}
      {...props}
    />
  );
}

/** The content between header and footer. Scrolls when the panel runs out of room. */
function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-body"
      // Focusable, so a body that scrolls can be scrolled from the keyboard.
      tabIndex={0}
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        className,
      )}
      {...props}
    />
  );
}

/** A ledge along the bottom, behind an engraved rule, holding the keys. */
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'mt-4 flex shrink-0 flex-col-reverse gap-2 border-t border-t-(--dialog-rule-shade) bg-(--dialog-ledge) px-6 py-4 shadow-[inset_0_1px_0_var(--dialog-rule-light)] sm:flex-row sm:justify-end',
        '[[data-slot=dialog-body]+&]:mt-0',
        className,
      )}
      {...props}
    />
  );
}

type DialogCloseProps = DialogPrimitive.Close.Props & {
  /** "destructive" makes it the red key. */
  tone?: 'default' | 'destructive';
};

/** A key that closes the dialog. Use it for Cancel, Done, or an action that ends with closing. */
function DialogClose({ className, tone = 'default', ...props }: DialogCloseProps) {
  return <DialogPrimitive.Close data-slot="dialog-close" data-tone={tone} className={cn(key, className)} {...props} />;
}

/* Alert dialog ------------------------------------------------------------ */

/** A dialog that needs an answer: it doesn't close on an outside click. For destructive confirmation. */
function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

type AlertDialogContentProps = AlertDialogPrimitive.Popup.Props & {
  fasteners?: Fasteners;
};

/** The same panel, narrower, with no corner ×: answer it or press Escape. */
function AlertDialogContent({ className, children, fasteners = 'screws', ...props }: AlertDialogContentProps) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop data-slot="alert-dialog-backdrop" className={dim} />
      <AlertDialogPrimitive.Viewport data-slot="alert-dialog-viewport" className={viewport}>
        <AlertDialogPrimitive.Popup
          data-slot="alert-dialog-content"
          data-fasteners={fasteners}
          className={cn(panel, 'max-w-(--dialog-alert-width)', className)}
          {...props}
        >
          <DialogFasteners fasteners={fasteners} />
          {children}
        </AlertDialogPrimitive.Popup>
      </AlertDialogPrimitive.Viewport>
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <DialogHeader data-slot="alert-dialog-header" className={cn('pr-6', className)} {...props} />;
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('text-base leading-tight font-semibold', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-sm text-(--dialog-panel-muted)', className)}
      {...props}
    />
  );
}

function AlertDialogFooter(props: React.ComponentProps<'div'>) {
  return <DialogFooter data-slot="alert-dialog-footer" {...props} />;
}

/** The safe answer. Put it first: it takes focus when the dialog opens. */
function AlertDialogCancel({ className, children = 'Cancel', ...props }: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close data-slot="alert-dialog-cancel" className={cn(key, className)} {...props}>
      {children}
    </AlertDialogPrimitive.Close>
  );
}

type AlertDialogActionProps = AlertDialogPrimitive.Close.Props & {
  /** Red by default: alert dialogs are for things that can't be undone. */
  tone?: 'default' | 'destructive';
};

/** Does the thing and closes. Runs onClick first, so do the work there. */
function AlertDialogAction({ className, tone = 'destructive', ...props }: AlertDialogActionProps) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-action"
      data-tone={tone}
      className={cn(key, className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
};
export type { DialogContentProps, DialogCloseProps, AlertDialogContentProps, AlertDialogActionProps };
