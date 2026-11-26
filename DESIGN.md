---
name: MusicDan — Vacuum-Tube & CRT Hardware UI
description: Skeuomorphic hardware UI composed directly from untouched Bevel (brass dark) and SciFiCN (alien dark + scanlines) components over Tailwind CSS v4.
colors:
  background: '#040302'
  surface: '#080604'
  surface-raised: '#0e0a06'
  border: '#201808'
  text-primary: '#e0d5be'
  text-secondary: '#c8b99a'
  text-muted: '#7a6852'
  amber: '#ff8800'
  green: '#e0d5be'
  red: '#cc2200'
  filament-ember: '#ff9b38'
  filament-champagne: '#f5c87e'
typography:
  lyric-display:
    fontFamily: "'Figtree Variable', 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: '24px'
    fontWeight: 700
    lineHeight: 1.375
  track-title:
    fontFamily: "'Figtree Variable', 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: '20px'
    fontWeight: 700
    lineHeight: 1.3
  vfd-readout:
    fontFamily: "'Azeret Mono Variable', ui-monospace, monospace"
    fontSize: '12px'
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Figtree Variable', 'Noto Sans SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif"
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.5
---

# Design System: MusicDan — Vacuum-Tube & CRT Hardware UI

## Overview

MusicDan's Android frontend composes two real skeuomorphic shadcn component registries directly out of the box—with **zero custom CSS component classes and zero shape overrides**:

- **Bevel (`@bevel`, `data-bevel-theme="brass"` + `.dark`)**: Authentic physical vintage instruments—brass-bezelled rotary needle dials (`Dial`, `DialMark`), knurled rotary selector knobs (`DetentKnob`), rolling mechanical drum counters (`NumberWheel`), PCB DIP switch banks (`DipSwitch`), circuit breaker panels (`BreakerPanel`, `Breaker`), mechanical keycaps with lamps (`Key`, `KeyLamp`, `IconKey`), LED status plates (`Badge`, `BadgeLamp`), interlocked radio preset keys (`PresetTabs`, `PresetKeys`), latching checkboxes (`LatchCheckbox`), recessed text wells (`TextField`), screw-fastened hardware dialogs (`Dialog`), and tactile feedback (`BevelFeedback`).
- **SciFiCN (`@scificn`, `data-theme="alien"`)**: Chamfered CRT terminal framing (`Panel`, `PanelHeader`, `PanelContent`, `PanelFooter` + official `.scanlines`), rack cards (`Card`), dividers (`Separator`), status alerts (`Alert`), and ASCII CRT progress bars (`Progress`).

## Themes & Tokens

`index.html` enables both official themes on `<html>`:

```html
<html lang="zh-CN" class="dark" data-theme="alien" data-bevel-theme="brass"></html>
```

- **SciFiCN `alien` theme** provides the warm dark CRT base (`#040302` / `#080604` / `#0e0a06`), bone-ivory foreground (`#e0d5be` / `#c8b99a`), warm amber accent (`#ff8800`), phosphor text glow (`--text-glow-amber`), corner-cut clip paths (`--clip-corner-*`), and CRT `.scanlines`.
- **Bevel `brass` dark theme** provides warm brass primary keycaps, dark anodized secondary keycaps, glowing LED indicator lamps, brushed metal textures, and hardware depth shadows.
- **Shared Danmaku Palette (`public/danmaku-effects.json` / `src/theme.ts`)**: Synchronizes Canvas and Android native overlay danmaku amber phosphor tiers (`top`, `high`, `regular`) with the warm tube aesthetic.

## Typography

- **UI & Lyrics (`font-sans`)**: `'Figtree Variable'` (`@fontsource-variable/figtree`), falling back to CJK system sans.
- **Instrument Readouts (`font-mono`)**: `'Azeret Mono Variable'` (`@fontsource-variable/azeret-mono`) with `tabular-nums` for timestamps (`7:13`, `8:55`), comment counters, durations, percentages, and version tags.
- **Icons**: `lucide-react` exclusively.

## Layout

Portrait-first `9:19.5` Android shell (`432 × 936` CSS px @ `2.5×` DPR) respecting system safe-area insets:

- **Danmaku Screen**: Integrated SciFiCN `Panel` (`notch="md"`, `notch="none"` in fullscreen) with `PanelHeader` (track `MarqueeText` + glowing `Badge`), `.scanlines` `PanelContent` (`LyricsBackground` + `Danmaku` Canvas), and 2-column analog `PanelFooter` console featuring an interactive brass rotary playback seek `Dial` on the left, paired on the right with a rolling mechanical `NumberWheel` comment counter, VFD timestamps + SciFiCN ASCII `Progress` bar, brass `Key`/`IconKey` transport controls, and compact `手动匹配` / `歌词来源` / fullscreen deck actions.
- **Search Screen**: Recessed `TextField` + brass `搜索` `Key`, selection counter with `NumberWheel`, and SciFiCN `Card` rows with Bevel `LatchCheckbox` + glowing `Badge`.
- **Settings Console**: Brushed-metal `BreakerPanel` (`播放信息` + `悬浮弹幕` circuit breakers), dual side-by-side brass rotary `Dial`s (`字号 (px)` + `不透明度`), red PCB `DipSwitch` bank (`全屏保持常亮` + `长评驻留顶部` + hex readout), knurled rotary `DetentKnob` (`评论增长后重新抓取`), and `TextField` + `NumberWheel` (`合并后的弹幕显示上限`).
- **Bottom Navigation**: Bevel `PresetTabs` (`弹幕` / `搜索匹配` / `设置`) inside a 3-column grid.

## Do's and Don'ts

### Do

- **Do** install all new UI controls via `yarn shadcn add` from `@bevel`, `@scificn`, or official shadcn registries.
- **Do** use components as shipped with their official `brass` + `alien` themes and props (`variant`, `size`, `tone`, `lit`, `notch`, `fasteners`).
- **Do** keep `public/danmaku-effects.json` aligned with the warm amber tube palette for both WebView Canvas and Android native floating overlay.

### Don't

- **Don't** hand-roll raw HTML interactive controls or custom `.tube-*` CSS classes.
- **Don't** override Bevel button shapes, borders, or component variables with ad-hoc Tailwind hacks.
- **Don't** reintroduce Tamagui dependencies, purple/lavender tints, or npm/pnpm lockfiles.
