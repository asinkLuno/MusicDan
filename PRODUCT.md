# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Android music listeners who already use their preferred music app (Spotify, Apple Music, local players, etc.) and want to experience the communal emotional resonance of NetEase Cloud Music comments and synced bilingual lyrics while listening—often in low-light or late-night sessions, commutes, or focused desk listening.

## Product Purpose

MusicDan automatically detects the currently playing track from Android media sessions, matches it to NetEase Cloud Music songs, and renders real-time comment danmaku over synced bilingual lyrics—both inside the app (with playback controls and fullscreen stage) and as a cross-app floating overlay. Success means effortless reading of lyrics and comments with zero clutter, fast version matching/merging when auto-match misses, and reliable playback control.

## Positioning

Unlike standalone music players, MusicDan works alongside any existing Android music player without forcing a switch, and can merge & deduplicate comments across multiple versions of the same song (original, live, cover) into weighted danmaku.

## Operating Context

- Tauri Android application rendered in a WebView with React + Tailwind CSS v4 + shadcn/ui (Bevel + SciFiCN skeuomorphic components), portrait-first (`9:19.5` mobile viewport, verified at `432 × 936` CSS px @ `2.5x` DPR in browser preview and on Android devices).
- Three core app destinations: **弹幕** (live danmaku + synced lyrics stage, playback controls, fullscreen toggle, match shortcut), **搜索匹配** (multi-select song version search & comment merge), and **设置** (permissions, floating overlay toggle, comment refresh/limit, playback & danmaku appearance, in-app updates).
- Shared color/effect tokens in `public/danmaku-effects.json` are consumed by both the in-app Canvas renderer and the Android native overlay renderer.

## Capabilities and Constraints

- **UI Framework:** Unified with the website on **Tailwind CSS v4 + shadcn/ui**, reusing skeuomorphic hardware components from **Bevel** (`@bevel`) and CRT/panel components from **SciFiCN** (`@scificn`) installed via `yarn shadcn add`.
- **Package Manager & Quality Gate:** `yarn` only; `yarn quality` (ESLint + Prettier) and `yarn build` must pass with zero warnings/errors.
- **No Test Files:** Per repository policy, do not add unit/integration/e2e/snapshot tests.
- **Safe Areas & Ergonomics:** Respect Android system bar insets (`env(safe-area-inset-*)` / `--system-inset-*`), minimum 44–48px touch targets, reduced-motion preference, and Android back behavior.

## Brand Commitments

- Product name: **MusicDan**.
- Dark-first listening experience, explicitly moving away from the previous lavender/purple tint (`Lavender Afterglow`), and decoupled from the old purple app icon color.

## Evidence on Hand

- Real NetEase Cloud Music offline fixtures in `tests/fixtures/ncm-creep.json` (Radiohead — _Creep_) and `tests/fixtures/ncm-november-rain.json` (Guns N' Roses — _November Rain (2022 Version)_) used for live browser demo (`?demo=creep`, `?demo=november-rain&position=433000&freeze=1`) and release screenshots.
- Existing preview captures in `artifacts/previews/` serving only as anti-reference for the previous lavender theme.

## Product Principles

1. **Stage first, chrome recedes:** Lyrics and flowing comments are the centerpiece; containers, borders, and controls must stay quiet and never compete with reading.
2. **Clarity in motion:** Even with hundreds of comments crossing bilingual lyrics, hierarchy between current lyric, translation, ordinary comments, and top-liked comments must stay scannable at a glance.
3. **Native mobile rhythm:** Touch targets, navigation, and spacing should feel like a focused Android music utility, not a boxed web form.
4. **Honest controls & instant feedback:** Every playback, match, and appearance control reflects real state immediately without decorative clutter.
