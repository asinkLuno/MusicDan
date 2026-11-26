# MusicDan 应用图标

采用「扫描弹幕音符（Scanline Danmaku Note）」设计：7 条暖白至琥珀辉光（`#fff0d4` / `#ffbe63` / `#ff8c0a`）的 CRT 扫描线胶囊构成清晰八分音符轮廓，右侧保留流动弹幕拖影，搭配暖黑金真空管底色（`#17110c` → `#070503`）与柔和琥珀辉光，与应用前端的暗暖胆机 / CRT 扫描线控制台保持一致。

- `icon.svg` / `icon.png`：桌面、旧版 Android 与官网源图标（`1024×1024`）。
- `foreground.svg` / `foreground.png`：Android 自适应图标透明前景（`android_fg_scale: 78`，兼顾圆形与圆角矩形裁剪安全区）。
- `background.svg` / `background.png`：Android 自适应图标全幅暖黑金辉光背景。

项目根目录执行以下命令可重新生成桌面及 Android 工程的全部图标：

```sh
rsvg-convert -w 1024 -h 1024 docs/brand/app-icon/icon.svg -o docs/brand/app-icon/icon.png
rsvg-convert -w 1024 -h 1024 docs/brand/app-icon/background.svg -o docs/brand/app-icon/background.png
rsvg-convert -w 1024 -h 1024 docs/brand/app-icon/foreground.svg -o docs/brand/app-icon/foreground.png
yarn tauri icon docs/brand/app-icon/icons.json
```

官网构建会通过 `website/scripts/optimize-brand.mjs` 从本目录的 `icon.svg` 自动生成 `website/public/brand/icon-128.webp` 和 `favicon-64.png`，无需手动维护。
