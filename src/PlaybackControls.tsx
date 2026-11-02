import { useRef, useState } from 'react';
import { Button, Slider, Text, XStack, YStack } from 'tamagui';
import { formatTime, invoke } from './types';
import type { NowPlaying } from './types';

// Android PlaybackState action bits, supplied by the selected media session.
const actions = { pause: 2, play: 4, previous: 16, next: 32, seek: 256, toggle: 512 };

export function PlaybackControls({ nowPlaying, onError }: { nowPlaying?: NowPlaying | null; onError: (error: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const np = nowPlaying;
  const duration = Math.max(0, np?.duration || 0);
  const position = Math.max(0, Math.min(duration, dragPosition ?? np?.position ?? 0));
  const supported = np?.playbackActions || 0;
  const can = (action: keyof typeof actions) => Boolean(np?.packageName && !busy && (supported & actions[action]));
  const playing = np?.isPlaying === true;
  const canToggle = can(playing ? 'pause' : 'play') || can('toggle');

  async function control(action: 'play' | 'pause' | 'previous' | 'next' | 'seek', seekPosition?: number) {
    if (!np?.packageName || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await invoke('plugin:media|control_playback', {
        control: { packageName: np.packageName, action, position: seekPosition == null ? null : Math.round(seekPosition) },
      });
    } catch (error) { onError(error); }
    finally { pending.current = false; setBusy(false); setDragPosition(null); }
  }

  return <YStack flex={1} minWidth={0} gap="2" aria-label="播放控制">
    <XStack justifyContent="space-between" gap="2">
      <Text fontSize="xs" color="color-10">{formatTime(position)}</Text>
      <Text fontSize="xs" color="color-10">{formatTime(duration)}</Text>
    </XStack>
    <Slider size="sm" min={0} max={duration || 1} step={1000} value={[position]}
      disabled={!can('seek') || duration <= 0} aria-label="播放进度"
      onValueChange={([value]) => setDragPosition(value)}
      onSlideEnd={(_, value) => void control('seek', dragPosition ?? value)}
      onKeyUp={event => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key) && dragPosition != null) {
          void control('seek', dragPosition);
        }
      }}>
      <Slider.Track><Slider.TrackActive/></Slider.Track>
      <Slider.Thumb index={0} aria-label="拖动播放进度" aria-valuetext={`${formatTime(position)} / ${formatTime(duration)}`}/>
    </Slider>
    <XStack gap="2" alignItems="center" justifyContent="center" flexWrap="wrap">
      <Button size="sm" minHeight={44} disabled={!can('previous')} onPress={() => void control('previous')}>上一首</Button>
      <Button size="sm" minHeight={44} theme="accent" disabled={!canToggle}
        onPress={() => void control(playing ? 'pause' : 'play')}>{playing ? '暂停' : '播放'}</Button>
      <Button size="sm" minHeight={44} disabled={!can('next')} onPress={() => void control('next')}>下一首</Button>
    </XStack>
  </YStack>;
}
