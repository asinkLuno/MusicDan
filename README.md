# MusicDan

让热评，跟着音乐走。MusicDan 把网易云音乐评论变成弹幕，让你在喜欢的音乐 App 里，也能看见同一首歌的共鸣。

<p align="center">
  <img src="artifacts/previews/november-rain-danmaku.png" width="380" alt="MusicDan 实际运行画面，November Rain 合并评论与双语歌词"/><br/>
</p>

## 本地音乐，在线评论

不用换播放器。MusicDan 自动识别正在播放的歌曲，匹配网易云音乐版本，把散落在评论区的文字带到你眼前——可以在应用内看，也可以悬浮在**任何音乐 App**上面。

### 弹幕，浮在音乐之上

- 悬浮在其他音乐 App 上层：透明、触摸穿透，看歌词、切歌都不挡操作
- 退到后台自动显示，回到前台自动隐藏；通知栏可直接暂停或关闭
- 自动避让系统栏、铺满可用空间；轨道数量与穿屏速度随屏幕和评论量自动调整，允许同轨重叠
- 热评优先，上千条评论跟随播放进度滚动，实时显示评论总数与播放进度
- 支持反向控制原音乐 App：播放/暂停、上一首/下一首、拖动进度条都能在 MusicDan 里完成

| 跨应用悬浮弹幕 | 应用内弹幕 |
| --- | --- |
| <img src="docs/screenshots/overlay.jpg" width="270"/> | <img src="artifacts/previews/app-danmaku.png" width="270"/> |

### 歌词与全屏弹幕

- 同步显示网易云音乐歌词，翻译行排版清晰，支持双语对照
- 当前行以渐变墨迹高亮并加大字号，前后歌词柔和退后，阅读聚焦
- 歌词背景带氛围渐变与边缘光效，与整体视觉统一
- 上下滑动浏览歌词，选中任意一行即可从那里定位播放（需音乐 App 支持进度控制）
- 一键全屏，弹幕与歌词铺满整块屏幕，可设置全屏时保持屏幕常亮

<p align="center">
  <img src="artifacts/previews/november-rain-fullscreen.png" width="270" alt="November Rain 2022 全屏弹幕页，固定 7:13"/>
</p>

### 同一首歌，不止一个版本

- 自动匹配不准时，手动搜索网易云歌曲版本；「时长一致」标记帮助确认版本
- 勾选多首合并弹幕：原唱、现场、翻唱的评论一起看，发现更多听众的故事
- 手动匹配会被记住，随时可恢复自动匹配
- 字号、不透明度、显示上限随时调整，改动即时生效，无需重新抓取

| 搜索匹配 | 弹幕外观 |
| --- | --- |
| <img src="artifacts/previews/november-rain-search.png" width="270"/> | <img src="docs/screenshots/settings-appearance.png" width="270"/> |

### 评论加载与合并

- 后台全量抓取歌曲全部评论并本地缓存，热评优先，每新增 1000 条增量合并
- 相似评论自动合并为一组（重复次数越多字号越大），一组只占一条弹幕、按赞数选优
- 每分钟检查评论增长，超过阈值（默认 10%）才重新抓取，其余时间直接读缓存

## 下载

- 官网 [musicdan.syncmoon.ink](https://musicdan.syncmoon.ink) 与 [GitHub Releases](https://github.com/asinkLuno/MusicDan/releases) 提供相同的发布安装包，每个版本附 SHA-256 校验值
- 需要 **Android 7.0（API 24）及以上**；仅提供 arm64-v8a（64 位）安装包，暂不支持 32 位 armv7 或 x86 / x86_64 模拟器

安装后开启弹幕：

1. 首次安装时，按系统提示允许从浏览器安装应用。
2. 打开 MusicDan，在设置中授予**通知使用权**，用于识别音乐 App 当前播放的歌曲。
3. 想在其他音乐 App 上看弹幕，再授予**显示在其他应用上层**权限，并开启悬浮弹幕，随后回到播放器播放歌曲即可。

注意事项：

- 主动关闭悬浮服务或进程被终止后，需要在设置中重新开启悬浮弹幕
- 部分系统页面及主动屏蔽悬浮窗的 App 会隐藏悬浮层
- Android 13 及以上若关闭了应用通知，前台服务通知可能不显示，可在系统的应用通知设置中开启

## 开发

```sh
yarn                                # 安装依赖（本项目只用 yarn，不要用 npm/pnpm）
yarn dev                            # 浏览器预览界面；媒体功能需要安卓真机
yarn build                          # TypeScript 检查及前端构建
yarn test                           # 弹幕容量、跳转和去重测试
yarn tauri android dev              # 真机调试
yarn tauri android build --debug --target aarch64 --apk
cd src-tauri && cargo test --lib    # Rust 侧测试
```

安卓构建需要 JDK、Android SDK / NDK 和对应的 Rust target，并设置 `ANDROID_HOME`、`NDK_HOME`。项目包含已定制的 `src-tauri/gen/android`，不要重新初始化覆盖其中的系统栏适配。

## 电脑运行与截图

运行 `yarn dev`，打开 `http://localhost:1420/?demo=creep`，即可运行真实的 React / Tamagui 应用界面。演示模式只替换原生 IPC 返回的数据，模拟 Radiohead 的 Creep 播放进度；歌曲搜索、评论数量和 1000 条真实评论来自 `tests/fixtures/ncm-creep.json` 中录制的网易云数据。歌词使用保留真实时间戳的短片段。弹幕、歌词、控件和布局由应用代码实时渲染。fixture 无有效期，启动、刷新和截图都不访问网易云；需要更新时显式运行 `yarn fixtures:refresh`，失败保留旧文件。

该模式仅在 Vite 开发服务器生效，正式构建不启用。普通浏览器页面不加 `?demo=creep` 时维持原来的行为。浏览器截图适用于应用内弹幕、全屏、搜索及设置页面；跨应用悬浮和 Android 权限页面需要安卓模拟器或真机运行。

截图时通过 Chrome / Playwright 打开以上地址，等待播放状态和弹幕出现后捕获页面；不要替换页面截图素材或重画界面来冒充运行截图。README 现有真机图片保持原样。

可复用的截图脚本：用 Chrome 启动 `--headless --remote-debugging-port=9229 --user-data-dir=/tmp/musicdan-capture` 后，执行 `node scripts/capture-app.mjs <弹幕页.png> <搜索页.png> <全屏页.png>`。脚本按安卓竖屏 **9:19.5** 比例运行（432 × 936 CSS 像素），输出 **1080 × 2340** PNG 截图，将播放进度固定在 0:04，依次截取普通弹幕页、全屏弹幕页和搜索结果页。默认输出位于 `artifacts/previews/`。截图前会等待 fixture 评论及歌词加载完成。可用 `MUSICDAN_SCREENSHOT_POSITION` 设置固定进度（毫秒）；手动查看 0:04 可访问 `http://localhost:1420/?demo=creep&position=4000&freeze=1`。可用 `CHROME_DEBUG_URL` 指定浏览器调试地址，`MUSICDAN_PREVIEW_URL` 指定开发页面地址；需要 Node.js 22 及以上。

电脑运行生成的截图（播放状态模拟，内容来自固定的真实数据 fixture）：

脚本输出示例：[应用内弹幕](artifacts/previews/app-danmaku.png) · [搜索匹配](artifacts/previews/app-search.png) · [全屏弹幕](artifacts/previews/app-fullscreen.png)。

测试数据说明见 [tests/fixtures/README.md](tests/fixtures/README.md)。运行 `yarn test:fixtures` 可验证离线预览与 0:04 的弹幕排布。

### November Rain (2022 Version) · 7:13

运行 `yarn dev` 后打开 `http://localhost:1420/?demo=november-rain&position=433000&freeze=1`。自动截图会在搜索页选中 Super Deluxe 和 Deluxe Edition 两个 2022 版本并应用合并。该场景同样读取已保存的真实数据，无需联网；显式运行 `yarn fixtures:refresh november-rain` 才更新。输出示例：[普通弹幕页](artifacts/previews/november-rain-danmaku.png) · [搜索匹配](artifacts/previews/november-rain-search.png) · [全屏弹幕页](artifacts/previews/november-rain-fullscreen.png)。

---

MusicDan · 让喜欢的歌，多一点共鸣。
