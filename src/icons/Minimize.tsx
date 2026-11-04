import { memo, type JSX } from 'react';
import { Svg, Path, type SvgProps } from 'react-native-svg';
import { themed, type IconProps } from '@tamagui/helpers-icon';

export const Minimize: (props: IconProps) => JSX.Element = themed(
  memo(function Minimize(props: IconProps) {
    const {
      color = 'black',
      size = 24,
      ...otherProps
    } = props as SvgProps & {
      color?: string;
      size?: number;
    };
    return (
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...otherProps}
      >
        <Path d="M8 3v3a2 2 0 0 1-2 2H3" stroke={color} />
        <Path d="M21 8h-3a2 2 0 0 1-2-2V3" stroke={color} />
        <Path d="M3 16h3a2 2 0 0 1 2 2v3" stroke={color} />
        <Path d="M16 21v-3a2 2 0 0 1 2-2h3" stroke={color} />
      </Svg>
    );
  }),
);
