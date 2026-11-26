import * as React from 'react';

type FeedbackSound = 'click' | 'detent' | 'thunk' | 'toggle';

type BevelFeedbackValue = {
  /** A button or key going down. */
  click: () => void;
  /** A rotary detent or a small step: the lightest tick. */
  detent: () => void;
  /** Something heavy landing: a breaker, a plug seating, a punch clock. */
  thunk: () => void;
  /** A switch snapping over. */
  toggle: () => void;
};

type BevelFeedbackProps = {
  /** Play sounds. Default off. */
  sound?: boolean;
  /** Vibrate on devices that can. Default off. */
  haptics?: boolean;
  /** 0 to 1. */
  volume?: number;
  children?: React.ReactNode;
};

const noop = () => {};
const silent: BevelFeedbackValue = { click: noop, detent: noop, thunk: noop, toggle: noop };

const BevelFeedbackContext = React.createContext<BevelFeedbackValue>(silent);

/* One AudioContext for the page, made on first use. */
let audio: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function context() {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audio) {
    audio = new Ctor();
    // Half a second of white noise, reused by every burst.
    noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.5), audio.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (audio.state === 'suspended') void audio.resume();
  return audio;
}

/** A burst of band-passed noise that dies away: the body of every click. */
function burst(
  ctx: AudioContext,
  at: number,
  { freq, q, length, gain }: { freq: number; q: number; length: number; gain: number },
) {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(env).connect(ctx.destination);
  source.start(at, Math.random() * 0.4, length + 0.01);
}

/** A falling sine: weight behind a click. */
function thump(
  ctx: AudioContext,
  at: number,
  { from, to, length, gain }: { from: number; to: number; length: number; gain: number },
) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + length);
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(env).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.01);
}

const recipes: Record<FeedbackSound, (ctx: AudioContext, volume: number) => void> = {
  click: (ctx, v) => {
    const t = ctx.currentTime;
    burst(ctx, t, { freq: 3200, q: 1.2, length: 0.012, gain: 0.5 * v });
  },
  detent: (ctx, v) => {
    const t = ctx.currentTime;
    burst(ctx, t, { freq: 5200, q: 2, length: 0.006, gain: 0.35 * v });
  },
  toggle: (ctx, v) => {
    // The lever leaves one contact and snaps onto the other.
    const t = ctx.currentTime;
    burst(ctx, t, { freq: 2600, q: 1.4, length: 0.008, gain: 0.3 * v });
    burst(ctx, t + 0.022, { freq: 3800, q: 1.4, length: 0.014, gain: 0.55 * v });
  },
  thunk: (ctx, v) => {
    const t = ctx.currentTime;
    thump(ctx, t, { from: 140, to: 50, length: 0.09, gain: 0.7 * v });
    burst(ctx, t, { freq: 900, q: 0.8, length: 0.03, gain: 0.45 * v });
  },
};

const vibrations: Record<FeedbackSound, number | number[]> = {
  click: 8,
  detent: 4,
  toggle: [6, 24, 8],
  thunk: 22,
};

/**
 * Turns on sound and haptics for every Bevel control inside it. Both are off
 * unless you pass them, so a settings toggle can drive this directly.
 */
function BevelFeedback({ sound = false, haptics = false, volume = 0.6, children }: BevelFeedbackProps) {
  const value = React.useMemo<BevelFeedbackValue>(() => {
    if (!sound && !haptics) return silent;
    const play = (kind: FeedbackSound) => () => {
      if (sound) {
        const ctx = context();
        if (ctx) recipes[kind](ctx, Math.min(1, Math.max(0, volume)));
      }
      if (haptics && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(vibrations[kind]);
    };
    return { click: play('click'), detent: play('detent'), thunk: play('thunk'), toggle: play('toggle') };
  }, [sound, haptics, volume]);
  return React.createElement(BevelFeedbackContext.Provider, { value }, children);
}

/** click, detent, thunk and toggle. Silent outside <BevelFeedback> or when it's off. */
function useBevelFeedback() {
  return React.useContext(BevelFeedbackContext);
}

export { BevelFeedback, useBevelFeedback };
export type { BevelFeedbackProps, BevelFeedbackValue, FeedbackSound };
