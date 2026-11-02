import type { ComponentProps } from 'react';
import { Button, styled, useMedia } from 'tamagui';
import { musicAtmosphere } from './tamagui.config';

const AtmosphereButton = styled(Button, {
  minHeight: 44,
  borderWidth: 1,
  borderColor: 'border-color',
  outlineWidth: '0 focus-visible:2',
  outlineOffset: 3,
  outlineColor: 'accent-background',
});

export function AppButton(props: ComponentProps<typeof AtmosphereButton>) {
  const { reduceMotion } = useMedia();
  const quiet = props.variant === 'quiet';
  const luminous = props.theme === 'accent' || props.backgroundColor === 'accent-background hover:accent-background-hover press:accent-background-press';
  const raised = !quiet && !props.disabled;

  return <AtmosphereButton
    backgroundImage={raised ? musicAtmosphere.button : 'none'}
    shadowColor={luminous ? 'accent-background' : 'shadow-color'}
    shadowOffset={{ width: 0, height: luminous ? 6 : 3 }}
    shadowRadius={luminous ? '24 press:8' : '10 press:8'}
    shadowOpacity={raised ? luminous ? '0.28 hover:0.4 press:0.16' : '0.2 hover:0.28 press:0.16' : 0}
    borderColor={quiet ? 'transparent' : 'border-color'}
    {...props}
    transition={reduceMotion ? undefined : 'quickerLessBouncy'}
    scale={reduceMotion ? 1 : '1 hover:1.015 press:0.97'}
  />;
}
