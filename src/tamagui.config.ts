import { defaultConfig } from '@tamagui/config/v6';
import { animations } from '@tamagui/config/animations-css';
import { createTamagui } from 'tamagui';

// Lavender at night: quiet surfaces, misty highlights, and warm white text.
const base = ['#14111e', '#211b30', '#322940', '#463956', '#655575', '#827293', '#a597b5', '#c0b2cf', '#d8cbe5', '#bdb0cd', '#f5effb'];
const accent = ['#241a38', '#38254f', '#503668', '#72528f', '#c4a5ed', '#d1b5f5', '#dcc6fa', '#e6d6fc', '#eee2ff', '#f3eaff', '#faf5ff'];
const replacements = new Map<string, string>();
for (const [original, palette] of [[defaultConfig.themes.dark, base], [defaultConfig.themes.dark_accent, accent]] as const) {
  palette.forEach((color, index) => replacements.set(original[`color-${index + 1}` as keyof typeof original], color));
}
replacements.set(defaultConfig.themes.dark['accent-background'], '#c4a5ed');
replacements.set(defaultConfig.themes.dark['accent-color'], '#241a38');

// Recolor nested surface themes too, so Cards, Inputs and quiet buttons agree.
const themes = Object.fromEntries(Object.entries(defaultConfig.themes).map(([name, theme]) => [
  name,
  name === 'dark' || name.startsWith('dark_')
    ? { ...theme, ...Object.fromEntries(Object.entries(theme).map(([key, value]) => [key, replacements.get(value) ?? value])) }
    : theme,
])) as typeof defaultConfig.themes;

export const musicAtmosphere = {
  backdrop: 'radial-gradient(ellipse at 10% 0%, rgba(156, 115, 203, 0.17), transparent 65%), radial-gradient(ellipse at 100% 85%, rgba(113, 126, 193, 0.10), transparent 60%)',
  player: 'radial-gradient(ellipse at 15% 15%, rgba(185, 143, 231, 0.18), transparent 65%), radial-gradient(ellipse at 95% 90%, rgba(131, 147, 211, 0.14), transparent 65%)',
};

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations,
  media: { ...defaultConfig.media, reduceMotion: { prefersReducedMotion: 'reduce' } },
  themes,
  settings: { ...defaultConfig.settings, onlyAllowShorthands: false },
});

type AppConfig = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}
