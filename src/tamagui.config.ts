// Shared Canvas palette and thresholds, also bundled for the Android renderer.
export { default as danmakuEffects } from '../public/danmaku-effects.json' with { type: 'json' };
import danmakuPalette from '../public/danmaku-effects.json' with { type: 'json' };
import { defaultConfig } from '@tamagui/config/v6';
import { animations } from '@tamagui/config/animations-css';
import { createTamagui } from 'tamagui';

// Lavender at night: quiet surfaces, misty highlights, and warm white text.
const base = ['#14111e', '#211b30', '#322940', '#463956', '#655575', '#827293', '#a597b5', '#c0b2cf', '#d8cbe5', '#bdb0cd', danmakuPalette.textColor];
const accent = ['#241a38', '#38254f', '#503668', '#72528f', '#c4a5ed', '#d1b5f5', '#dcc6fa', '#e6d6fc', '#eee2ff', '#f3eaff', '#faf5ff'];
const replacements = new Map<string, string>();
for (const [original, palette] of [[defaultConfig.themes.dark, base], [defaultConfig.themes.dark_accent, accent]] as const) {
  palette.forEach((color, index) => replacements.set(original[`color-${index + 1}` as keyof typeof original], color));
}
replacements.set(defaultConfig.themes.dark['accent-background'], '#c4a5ed');
replacements.set(defaultConfig.themes.dark['accent-color'], '#241a38');

// Recolor nested surface themes too, so Cards, Inputs and quiet buttons agree.
const lyricPalette = {
  lyricSurface: '#141321',
  lyricRest: '#a89bbd',
  lyricNearby: '#cec2e2',
  lyricTranslation: '#c0ccec',
  lyricGlow: 'rgba(166, 189, 255, 0.28)',
};
const themes = Object.fromEntries(Object.entries(defaultConfig.themes).map(([name, theme]) => [
  name,
  name === 'dark' || name.startsWith('dark_')
    ? { ...theme, ...Object.fromEntries(Object.entries(theme).map(([key, value]) => [key, replacements.get(value) ?? value])), ...lyricPalette }
    : { ...theme, ...lyricPalette },
])) as { [Name in keyof typeof defaultConfig.themes]: typeof defaultConfig.themes[Name] & typeof lyricPalette };

export const musicAtmosphere = {
  backdrop: 'radial-gradient(ellipse at 0% 30%, rgba(133, 83, 184, 0.12), transparent 65%), radial-gradient(ellipse at 100% 75%, rgba(158, 185, 240, 0.08), transparent 65%)',
  player: 'radial-gradient(ellipse at 15% 40%, rgba(133, 83, 184, 0.10), transparent 65%), radial-gradient(ellipse at 100% 70%, rgba(158, 185, 240, 0.10), transparent 65%)',
  button: 'linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.02))',
  // The same lighting direction as the mark: violet left, blue refraction, pearl right.
  lyrics: 'radial-gradient(ellipse at 10% 32%, rgba(133, 83, 184, 0.20), transparent 65%), radial-gradient(ellipse at 55% 48%, rgba(104, 143, 222, 0.13), transparent 58%), radial-gradient(ellipse at 100% 68%, rgba(213, 220, 249, 0.12), transparent 62%)',
  lyricInk: 'linear-gradient(120deg, #c2a0ef 0%, #b1c4ff 30%, #d3e3ff 43%, #fffaf5 62%, #fffaf5 100%)',
  lyricEdges: 'linear-gradient(180deg, rgba(20, 19, 33, 0.88), transparent 22%, transparent 78%, rgba(20, 19, 33, 0.88))',
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
