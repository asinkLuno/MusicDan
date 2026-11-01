import { memo, useEffect, useState } from 'react';
import { Text, XStack, YStack, useMedia } from 'tamagui';

type MarqueeTextProps = { text: string; kind?: 'title' | 'body' | 'caption' };

// Measure through Tamagui layout events; only overflowing lines animate.
export const MarqueeText = memo(function MarqueeText({ text, kind = 'body' }: MarqueeTextProps) {
  const { reduceMotion } = useMedia();
  const [width, setWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const distance = Math.max(0, textWidth - width);
  return <YStack minWidth={0} width="100%" overflow="hidden" onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <MarqueeMotion key={`${text}:${distance}:${reduceMotion}`} distance={width > 0 && !reduceMotion ? distance : 0} wrap={reduceMotion}>
      <Text render={kind === 'title' ? 'h3' : 'span'} margin={0}
        fontSize={kind === 'title' ? 'xl' : kind === 'caption' ? 'xs' : 'sm'}
        fontWeight={kind === 'title' ? '600' : '400'} color={kind === 'title' ? 'color' : 'color-10'}
        whiteSpace={reduceMotion ? 'normal' : 'nowrap'}
        onLayout={event => setTextWidth(event.nativeEvent.layout.width)}>{text}</Text>
    </MarqueeMotion>
  </YStack>;
});

function MarqueeMotion({ distance, wrap, children }: { distance: number; wrap: boolean; children: React.ReactNode }) {
  const [atEnd, setAtEnd] = useState(false);
  // Constant reading speed, with a pause at each end before reversing direction.
  const duration = Math.max(1200, distance / 28 * 1000);
  useEffect(() => {
    if (distance <= 1) return;
    let timer: ReturnType<typeof setTimeout>;
    function advance() {
      setAtEnd(previous => !previous);
      timer = setTimeout(advance, duration + 1400);
    }
    timer = setTimeout(advance, 1400);
    return () => clearTimeout(timer);
  }, [distance, duration]);
  return <XStack alignSelf="flex-start" maxWidth={wrap ? '100%' : undefined}
    flexShrink={0} width={wrap ? '100%' : 'max-content'} x={atEnd ? -distance : 0}
    transition={distance > 1 ? `${duration}ms linear` : 'none'}>{children}</XStack>;
}
