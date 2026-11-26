import { Key, type KeyProps } from '@/components/ui/key';

type IconKeyProps = Omit<KeyProps, 'square'> & {
  /** An icon-only key has no visible text, so it must be named. */
  'aria-label': string;
};

/**
 * A square keycap for one icon: toolbars, copy and close buttons. Secondary
 * by default, so a row of them stays quiet beside a primary key.
 */
function IconKey({ variant = 'secondary', ...props }: IconKeyProps) {
  return <Key variant={variant} square {...props} />;
}

export { IconKey };
export type { IconKeyProps };
