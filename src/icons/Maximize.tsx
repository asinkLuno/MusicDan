import { memo, type JSX } from 'react'
import { Svg, Path, type SvgProps } from 'react-native-svg'
import { themed, type IconProps } from '@tamagui/helpers-icon'

export const Maximize: (props: IconProps) => JSX.Element = themed(
  memo(function Maximize(props: IconProps) {
    const { color = 'black', size = 24, ...otherProps } = props as SvgProps & {
      color?: string
      size?: number
    }
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
        <Path d="M8 3H5a2 2 0 0 0-2 2v3" stroke={color} />
        <Path d="M21 8V5a2 2 0 0 0-2-2h-3" stroke={color} />
        <Path d="M3 16v3a2 2 0 0 0 2 2h3" stroke={color} />
        <Path d="M16 21h3a2 2 0 0 0 2-2v-3" stroke={color} />
      </Svg>
    )
  })
)
