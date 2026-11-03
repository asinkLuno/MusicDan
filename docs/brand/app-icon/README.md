# MusicDan 应用图标

采用确认的 Sarasa Gothic 多语言文字音符，每一行文字的右侧都保留渐淡拖影（上方行更长更实，下方行更短更虚），搭配深紫色背景与薰衣草色柔光。

`icon.svg` / `icon.png` 是桌面与旧版 Android 图标源文件；`foreground.svg` / `foreground.png` 是 Android 自适应图标透明前景；`background.png` 是自适应背景。

SVG 字符均已转为路径，不依赖系统字体。原字体许可见 `Sarasa-LICENSE.txt`。

项目根目录执行以下命令可重新生成桌面及已生成 Android 工程的图标：

```sh
yarn tauri icon docs/brand/app-icon/icons.json
```

官网构建会从本目录的 `icon.svg` 生成 `website/public/brand/icon-128.webp` 和 `favicon-64.png`，无需手动维护。

自适应前景比例为 90%，为系统图标形状留出空间。应用图标为静态图，动态设计稿位于 `../logo-exploration/type-note/`。

桌面版音符放大 8%；Android 前景比例由 80% 提升到 90%。背景光线与前景一致：左侧暗紫环境光、中部淡蓝反光、右侧偏下的柔白主光，沿左上到右下的方向逐渐提亮。

文字采用左侧紫色到右侧暖白的整体渐变（从左上指向右下，与竖直方向夹角约 60°），并叠加轻微紫色柔光；保留清晰字形与右侧运动拖影。

渐变在紫白之间经过淡蓝与冰蓝高光，60% 处达到暖白；文字叠加轻微蓝色光晕，保留右侧白色区域。

音符主体使用 27 种语言，每种语言与拼写只出现一次；中日汉字统一为繁体「音樂」，不使用零散汉字。语种对照见 `../logo-exploration/type-note/languages.json`；词义参考 [Wiktionary music translations](https://en.wiktionary.org/wiki/music#Translations)。拖影仅为对应文字的模糊残像，按行整体生成、按垂直位置渐变：顶部行位移更大、更实（三层位移约 8/16/26、不透明度约 0.26/0.14/0.065），底部行更短更虚（约 3.5/8/13、0.08/0.04/0.016）；多字行的拖影裁剪到行尾之后，避免与同行其他单词重叠，靠近右缘的行会按画布与圆角边界收缩。
