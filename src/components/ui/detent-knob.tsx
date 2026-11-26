import * as React from 'react';
import { cn } from 'cn';
import { useBevelFeedback } from '@/lib/feedback';

type Stop = { value: string; label: string };

type DetentKnobContextValue = {
  register: (stop: Stop) => () => void;
};

const DetentKnobContext = React.createContext<DetentKnobContextValue | null>(null);

/* Positions spread over 270°, from bottom-left to bottom-right, like a range switch. */
const SWEEP = 270;

function angleAt(index: number, count: number) {
  return count < 2 ? 0 : -SWEEP / 2 + (SWEEP * index) / (count - 1);
}

type DetentKnobProps = Omit<React.ComponentProps<'div'>, 'onChange' | 'defaultValue'> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
};

/**
 * A rotary switch: it clicks into fixed positions and stops hard at both
 * ends. Turn it with arrow keys, Home and End, or drag it round. List the
 * positions as DetentKnobStop children. Give it an aria-label.
 */
function DetentKnob({
  className,
  value: valueProp,
  defaultValue,
  onValueChange,
  disabled,
  children,
  ...props
}: DetentKnobProps) {
  const [stops, setStops] = React.useState<Stop[]>([]);
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const [bump, setBump] = React.useState<{ dir: 'up' | 'down'; n: number } | null>(null);
  const knob = React.useRef<HTMLDivElement>(null);
  const feedback = useBevelFeedback();
  const value = valueProp ?? uncontrolled ?? stops[0]?.value;
  const index = Math.max(
    0,
    stops.findIndex((s) => s.value === value),
  );

  const register = React.useCallback((stop: Stop) => {
    // Stops keep the order they mounted in, which is their order round the dial.
    setStops((all) =>
      all.some((s) => s.value === stop.value) ? all.map((s) => (s.value === stop.value ? stop : s)) : [...all, stop],
    );
    return () => setStops((all) => all.filter((s) => s.value !== stop.value));
  }, []);
  const context = React.useMemo(() => ({ register }), [register]);

  const select = (next: number) => {
    if (disabled || !stops.length) return;
    if (next < 0 || next > stops.length - 1) {
      setBump((b) => ({ dir: next < 0 ? 'down' : 'up', n: (b?.n ?? 0) + 1 }));
      feedback.click();
      return;
    }
    if (next === index) return;
    const stop = stops[next]!;
    setUncontrolled(stop.value);
    onValueChange?.(stop.value);
    feedback.detent();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    if (event.key in step) select(index + step[event.key]!);
    else if (event.key === 'Home') select(0);
    else if (event.key === 'End') select(stops.length - 1);
    else return;
    event.preventDefault();
  };

  // Dragging: the nearest position to the pointer's angle round the centre.
  const fromPointer = (event: React.PointerEvent) => {
    const box = knob.current?.getBoundingClientRect();
    if (!box || stops.length < 2) return;
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    const angle = (Math.atan2(x, -y) * 180) / Math.PI;
    const t = (angle + SWEEP / 2) / SWEEP;
    if (t < -0.05 || t > 1.05) return; // in the dead zone at the bottom: stay put
    select(Math.min(stops.length - 1, Math.max(0, Math.round(t * (stops.length - 1)))));
  };

  const current = stops[index];
  return (
    <DetentKnobContext value={context}>
      {children}
      <div
        data-slot="detent-knob"
        data-disabled={disabled ? '' : undefined}
        className={cn(
          'relative grid size-56 shrink-0 place-items-center select-none data-disabled:opacity-50',
          className,
        )}
      >
        {stops.map((stop, i) => (
          <span
            key={stop.value}
            aria-hidden
            data-selected={i === index ? '' : undefined}
            onClick={() => select(i)}
            className="absolute top-1/2 left-1/2 cursor-pointer text-xs font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-(--bevel-duration-small) data-selected:text-foreground motion-reduce:transition-none"
            style={{
              transform: `translate(-50%, -50%) rotate(${angleAt(i, stops.length)}deg) translateY(calc(var(--detent-knob-label-radius) * -1)) rotate(${-angleAt(i, stops.length)}deg)`,
            }}
          >
            {stop.label}
          </span>
        ))}
        <div
          ref={knob}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled || undefined}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, stops.length - 1)}
          aria-valuenow={index}
          aria-valuetext={current ? `${current.label}, ${index + 1} of ${stops.length}` : undefined}
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          onPointerDown={(event) => {
            if (disabled) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            fromPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event);
          }}
          className="group size-32 touch-none rounded-full focus-visible:outline-none" // the face below draws the focus ring
          {...props}
        >
          <div
            key={bump?.n ?? 0}
            data-slot="detent-knob-body"
            data-bump={bump?.dir}
            className={cn('size-full rounded-full', bump && 'detent-knob-bump motion-reduce:animate-none')}
          >
            <div
              data-slot="detent-knob-cap"
              className={cn(
                'bevel-metal relative size-full rounded-full shadow-(--bevel-depth-object)',
                'transition-[rotate] duration-(--bevel-duration-small) ease-(--bevel-ease-spring) motion-reduce:transition-none',
                'group-focus-visible:ring-3 group-focus-visible:ring-ring/60',
              )}
              style={{ rotate: `${angleAt(index, stops.length)}deg` }}
            >
              <span aria-hidden className="detent-knob-knurl absolute inset-0 rounded-full" />
              <span aria-hidden className="bevel-metal absolute inset-3 rounded-full shadow-(--bevel-depth-raised)" />
              <span
                aria-hidden
                className="absolute top-3 left-1/2 h-8 w-1 -translate-x-1/2 rounded-full bg-(--detent-knob-pointer)"
              />
            </div>
          </div>
        </div>
      </div>
    </DetentKnobContext>
  );
}

type DetentKnobStopProps = { value: string; children: string };

/** One position. Renders nothing itself: the knob draws its label round the dial. */
function DetentKnobStop({ value, children }: DetentKnobStopProps) {
  const context = React.useContext(DetentKnobContext);
  if (!context) throw new Error('DetentKnobStop must be inside <DetentKnob>');
  const { register } = context;
  React.useEffect(() => register({ value, label: children }), [value, children, register]);
  return null;
}

export { DetentKnob, DetentKnobStop };
export type { DetentKnobProps, DetentKnobStopProps };
