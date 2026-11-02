import { Pause, Play, SkipBack, SkipForward } from './icons';
import { AppSlider as Slider } from './AppSlider';
import { useEffect, useRef, useState } from 'react';
import { PlaybackClock } from './playbackClock';
import { Button, Text, XStack, YStack } from 'tamagui';
import { formatTime, invoke, trackKey } from './types';
import type { Snapshot } from './types';

// Android PlaybackState action bits, supplied by the selected media session.
const actions = { pause: 2, play: 4, previous: 16, next: 32, seek: 256, toggle: 512 };

export function PlaybackControls({ snapshot, onError }: { snapshot: Snapshot | null; onError: (error: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [requested, setRequested] = useState<{ action: 'play' | 'pause' | 'previous' | 'next'; key: string; sentAt: number } | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const np = snapshot?.nowPlaying;
  useEffect(() => {
    if (!requested || !np || !snapshot || snapshot.sampledAt <= requested.sentAt) return;
    const confirmed = requested.action === 'play' ? np.isPlaying
      : requested.action === 'pause' ? !np.isPlaying : trackKey(np) !== requested.key;
    if (confirmed) {
      setRequested(null);
      pending.current = false;
      setBusy(false);
      clearTimeout(releaseTimer.current);
    }
  }, [snapshot, np, requested]);
  useEffect(() => () => clearTimeout(releaseTimer.current), []);
  const supported = np?.playbackActions || 0;
  const can = (action: keyof typeof actions) => Boolean(np?.packageName && !busy && (supported & actions[action]));
  const playing = requested?.action === 'play' ? true : requested?.action === 'pause' ? false : np?.isPlaying === true;
  const canToggle = can(playing ? 'pause' : 'play') || can('toggle');

  async function control(action: 'play' | 'pause' | 'previous' | 'next') {
    if (!np?.packageName || pending.current) return;
    pending.current = true;
    setBusy(true);
    setRequested({ action, key: trackKey(np), sentAt: Date.now() });
    releaseTimer.current = setTimeout(() => {
      pending.current = false;
      setBusy(false);
      setRequested(null);
    }, 2500);
    try {
      await invoke('plugin:media|control_playback', {
        control: { packageName: np.packageName, action, position: null },
      });
    } catch (error) {
      clearTimeout(releaseTimer.current);
      pending.current = false;
      setBusy(false);
      setRequested(null);
      onError(error);
    }
  }

  return <YStack flexShrink={0} minWidth={0} gap="2" aria-label="播放控制">
    <PlaybackProgress snapshot={snapshot} disabled={!can('seek')} onError={onError}/>
    <XStack gap="5" alignItems="center" justifyContent="center">
      <Button circular size="md" minWidth={44} minHeight={44} variant="quiet" aria-label="上一首"
        disabled={!can('previous')} onPress={() => void control('previous')} icon={<SkipBack size={24}/>}/>
      <Button circular size="lg" width={56} height={56} minWidth={56} minHeight={56}
        backgroundColor="accent-background hover:accent-background-hover press:accent-background-press"
        color="accent-color" aria-label={playing ? '暂停' : '播放'} disabled={!canToggle}
        onPress={() => void control(playing ? 'pause' : 'play')} icon={playing ? <Pause size={26} color="accent-color"/> : <Play size={26} color="accent-color"/>}/>
      <Button circular size="md" minWidth={44} minHeight={44} variant="quiet" aria-label="下一首"
        disabled={!can('next')} onPress={() => void control('next')} icon={<SkipForward size={24}/>}/>
    </XStack>
  </YStack>;
}

// Keep frequent progress and gesture updates inside this small subtree.
function PlaybackProgress({ snapshot, disabled, onError }: { snapshot: Snapshot | null; disabled: boolean; onError: (error: unknown) => void }) {
  const clock = useRef(new PlaybackClock());
  const [position, setPosition] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  const draft = useRef<number | null>(null);
  const seeking = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const previewing = preview != null;
  const awaiting = useRef<{ target: number; sentAt: number } | null>(null);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const np = snapshot?.nowPlaying;
  const duration = Math.max(0, np?.duration || 0);

  useEffect(() => {
    clock.current.update(snapshot, performance.now(), Date.now());
    const request = awaiting.current;
    if (request && snapshot && snapshot.sampledAt > request.sentAt && np && Math.abs(np.position - request.target) < 1000) {
      awaiting.current = null;
      setPreview(null);
      clearTimeout(releaseTimer.current);
    }
  }, [snapshot, np]);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setPosition(clock.current.position(performance.now()));
      frame = requestAnimationFrame(tick);
    };
    if (np?.isPlaying && !previewing) frame = requestAnimationFrame(tick);
    else setPosition(clock.current.position(performance.now()));
    return () => cancelAnimationFrame(frame);
  }, [np?.isPlaying, snapshot?.sampledAt, previewing]);
  useEffect(() => () => clearTimeout(releaseTimer.current), []);

  async function seek(value: number) {
    if (!np?.packageName || seeking.current || disabled) return;
    const target = Math.max(0, Math.min(duration, value));
    seeking.current = true;
    setSubmitting(true);
    draft.current = null;
    setPreview(target);
    clearTimeout(releaseTimer.current);
    awaiting.current = { target, sentAt: Date.now() };
    try {
      await invoke('plugin:media|control_playback', {
        control: { packageName: np.packageName, action: 'seek', position: Math.round(target) },
      });
      // Media commands return before the session publishes its new position.
      if (awaiting.current) releaseTimer.current = setTimeout(() => {
        awaiting.current = null;
        setPreview(null);
      }, 2000);
    } catch (error) {
      awaiting.current = null;
      setPreview(null);
      onError(error);
    } finally { seeking.current = false; setSubmitting(false); }
  }

  const displayed = Math.max(0, Math.min(duration, preview ?? position));
  return <YStack gap="2">
    <XStack justifyContent="space-between" gap="2">
      <Text fontSize="xs" color="color-10">{formatTime(displayed)}</Text>
      <Text fontSize="xs" color="color-10">{formatTime(duration)}</Text>
    </XStack>
    <Slider min={0} max={duration || 1} step={10} value={[displayed]}
      disabled={disabled || submitting || duration <= 0} aria-label="播放进度"
      onSlideStart={() => {
        clearTimeout(releaseTimer.current);
        awaiting.current = null;
      }}
      onValueChange={([value]) => { draft.current = value; setPreview(value); }}
      onSlideEnd={(_, value) => void seek(value)}
      onPointerCancel={() => { draft.current = null; setPreview(null); }}
      onKeyUp={event => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key) && draft.current != null) {
          void seek(draft.current);
        }
      }}>
      <Slider.Track><Slider.TrackActive/></Slider.Track>
      <Slider.Thumb index={0} aria-label="拖动播放进度" aria-valuetext={`${formatTime(displayed)} / ${formatTime(duration)}`}/>
    </Slider>
  </YStack>;
}
