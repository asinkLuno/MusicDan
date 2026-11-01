# MusicDan

React + TypeScript + Vite + Tamagui 前端，Tauri 2 / Rust 后端，安卓原生媒体插件和悬浮弹幕服务。

- **弹幕**：自动识别播放歌曲，按播放进度显示评论，支持应用内全屏。
- **搜索匹配**：搜索网易云歌曲版本，为当前播放歌曲保存手动匹配，或恢复自动匹配。
- **设置**：字号、穿屏时长、不透明度、轨道数和跨应用悬浮开关。

弹幕铺满当前可用空间并避开系统栏；窗口尺寸变化时重新计算轨道和容量。没有显示区域选择或手动裁剪。

## 数据与生命周期

`src-tauri/src/player.rs` 在 Rust 后台任务中读取媒体状态、获取评论并持久化设置与歌曲匹配。异步评论请求带有代次检查，换歌后不会使用上一首歌的结果。React 读取带采样时间的快照，使用独立的单调播放时钟与 Canvas 渲染；重复快照不会重置动画进度，小幅误差平滑校准，拖动播放进度时直接同步。

`plugins/tauri-plugin-media/android/` 通过 MediaSession 获取播放信息。`OverlayService` 是独立的安卓前台服务，使用原生 Canvas 绘制透明、触摸穿透的弹幕；应用退到后台后显示，回到前台后隐藏。通知提供暂停和关闭操作。主动关闭服务或进程被终止后，需要在设置中重新开启悬浮弹幕。

应用内窗口根据 ResizeObserver 自动适配尺寸变化。悬浮窗属于独立系统窗口，不会自动绑定到其他 App 的分屏边界。部分系统页面及主动屏蔽悬浮窗的 App 会隐藏悬浮层。

## 权限

首次使用需授予“通知使用权”，用于读取音乐 App 的 MediaSession；悬浮功能另外需要“显示在其他应用上层”。安卓 13 及以上若未允许应用通知，前台服务通知可能不会显示在通知栏，可在系统的应用通知设置中开启。

## 前端 UI

使用 Tamagui 构建界面，`src/tamagui.config.ts` 定义主题，入口通过 `TamaguiProvider` 提供深色主题。界面全部使用 Tamagui 的默认主题、组件与布局属性，仅导入库提供的 CSS reset，不维护手写 CSS 或内联 style。安全区域通过 Tamagui 布局属性适配；弹幕继续使用 Canvas 渲染。

依赖统一使用 **yarn** 管理，提交 `yarn.lock`，不要使用 npm 或 pnpm。

## 开发与验证

```sh
yarn
yarn dev                            # 浏览器预览界面；媒体功能需要安卓
yarn build                          # TypeScript 检查及前端构建
yarn test                           # 弹幕容量、跳转和去重测试
yarn tauri android dev              # 真机调试
yarn tauri android build --debug --target aarch64 --apk
cd src-tauri
cargo test --lib
```

安卓构建需要 JDK、Android SDK / NDK 和对应的 Rust target，并设置 ANDROID_HOME、NDK_HOME。项目包含已定制的 `src-tauri/gen/android`，不要重新初始化覆盖其中的系统栏适配。

## Native 架构

原生层目录、职责、数据流和生命周期见 [Native 系统设计](docs/native-system-design.md)。
