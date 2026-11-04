import { useRef, type ComponentProps } from 'react';
import { Slider, styled, withStaticProperties } from 'tamagui';
import { invoke } from './types';

// A quiet visual track inside a full-height touch target, shared by all sliders.
export const AppSlider = withStaticProperties(
  function AppSlider(props: ComponentProps<typeof Slider>) {
    const gesture = useRef({ active: false, bucket: -1, lastTick: 0 });
    const feedback = (kind: 'start' | 'tick' | 'end') => {
      void invoke('plugin:media|haptic_feedback', { kind }).catch(() => {});
    };
    const bucket = (value: number) => {
      const range = (props.max ?? 100) - (props.min ?? 0);
      const interval = Math.max(props.step ?? 1, range / 40);
      return Math.round((value - (props.min ?? 0)) / interval);
    };
    return (
      <Slider
        {...props}
        size="xs"
        height={44}
        flexShrink={0}
        justifyContent="center"
        opacity={props.disabled ? 0.4 : 1}
        onSlideStart={(...args) => {
          if (!props.disabled) {
            gesture.current = { active: true, bucket: bucket(args[1]), lastTick: performance.now() };
            feedback('start');
          }
          props.onSlideStart?.(...args);
        }}
        onValueChange={(values) => {
          const next = bucket(values[0]);
          const now = performance.now();
          if (gesture.current.active && next !== gesture.current.bucket) {
            gesture.current.bucket = next;
            if (now - gesture.current.lastTick >= 120) {
              gesture.current.lastTick = now;
              feedback('tick');
            }
          }
          props.onValueChange?.(values);
        }}
        onSlideEnd={(...args) => {
          if (gesture.current.active) feedback('end');
          gesture.current.active = false;
          props.onSlideEnd?.(...args);
        }}
        onPointerCancel={(event) => {
          gesture.current.active = false;
          props.onPointerCancel?.(event);
        }}
      />
    );
  },
  {
    Track: styled(Slider.Track, {
      backgroundColor: 'color-4',
    }),
    TrackActive: styled(Slider.TrackActive, {
      backgroundColor: 'accent-background',
    }),
    Thumb: styled(Slider.Thumb, {
      circular: true,
      borderWidth: 0,
      backgroundColor: 'accent-background hover:accent-background-hover press:accent-background-press',
      outlineColor: 'accent-background',
    }),
  },
);
