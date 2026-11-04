# AGENTS.md

## 版本发布

发布完全在本地完成，在 `main` 分支显式运行 `yarn release`（`scripts/release.mjs`）执行：lint 与格式检查 → 重建官网 → 构建签名 APK → 上传服务器并校验 SHA-256 → 原子切换官网、APK 和发布元数据。

- **不再创建、上传或发布 GitHub Release**，不依赖 `gh` 登录，也不推送发布标签。GitHub 仅用于代码托管，不使用 GitHub Actions；历史 GitHub Release 已清理。当前 `main` 为 `v0.1.0` 首版基线。
- 官网是唯一的发布入口，固定下载地址 `/releases/latest.apk`；应用内检查更新读取官网 `/releases.json`。
- 构建编号 = 服务器 `releases.json` 中最大构建编号 + 1；兼容旧记录中的 `build-N` URL。APK `versionCode = 1000000000 + 构建编号`，禁止因读取失败而归零。
- 新记录包含 `build_number`、`version_code`、`source_commit`、版本名、文件大小、SHA-256 和更新说明。服务器只保留最近 3 个版本，安装包按 `public/releases/build-N/` 存放；发布成功后在发布锁内清理更早版本及废弃官网目录，不覆盖保留版本。
- 所有附件上传并校验后，统一通过 `public/latest` 符号链接原子切换官网、APK、元数据。服务器发布锁和旧记录校验阻止并发覆盖；重复发布已存在版本时校验安装包后跳过。
- 发布前同步 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中的应用版本，并更新 `release-notes.md`。更新说明保存在官网发布记录和该版本目录中。
- 本地构建依赖：`android-signing/musicdan.keystore` 与 `src-tauri/gen/android/keystore.properties`（签名材料只保存在本地，务必私有备份，不要提交或上传到任何远端）、Android SDK/NDK、Rust `aarch64-linux-android` target、macmini `workbench`。不再使用 Git 推送钩子触发发布。

### 发布说明格式

`release-notes.md` 只记录当前版本的更新，使用 `## ✨ v<版本> 更新内容`、更新基线和 `### <功能分组>`，不展示构建编号。官网与应用从发布记录读取说明；每个版本目录另保留 `release-notes.md`。系统要求如有变化，必须同步官网与 README。

## 测试用例政策

- 本项目不编写、不新增、不维护测试用例，包括单元测试、集成测试、端到端测试和快照测试。
- 修改功能或修复问题时，不创建测试文件、测试模块、测试脚本，也不引入测试框架或测试依赖。
- 构建与发布流程不运行测试用例；按需通过类型检查、构建、静态检查和实际运行确认改动。
- `tests/fixtures/` 仅保留截图与离线演示所需的真实数据，不是测试用例，不得因清理测试而删除。

## 静态检查门禁

- 统一入口为 `yarn quality`，依次运行 ESLint（`yarn lint`）与 Prettier 格式检查（`yarn format:check`）。lint 错误、警告或格式不符均中止流程。
- 应用构建、官网构建及发布预检必须执行门禁；`yarn release`、`yarn release:check` 和 `yarn release:site` 均受其约束。
- 门禁只检查，不自动修改文件。格式修复使用 `yarn format`，修复后重新运行 `yarn quality`。
- ESLint 覆盖项目 JavaScript / TypeScript（含 Node.js 脚本）；Prettier 范围由 `.prettierignore` 定义，外部技能包不纳入格式检查。
- 不用测试用例替代或扩展此门禁。

## 包管理器

本项目的 Tauri 前端使用 **yarn** 作为包管理器（以根目录 `yarn.lock` 为准）。

**不要**使用 npm 或 pnpm（不要运行 `npm install` / `pnpm install`，也不要生成 `package-lock.json` 或 `pnpm-lock.yaml`），以避免 lockfile 冲突。

## 官网与下载页 UI

- `musicdan.syncmoon.ink` 同时作为 MusicDan 的应用介绍落地页和服务器备用下载入口。
- 官网使用 **React 构建静态页面**，构建产物部署到服务器，由 Caddy 提供服务。
- 官网部署通过在 `main` 分支显式运行 `yarn release` 完成（`scripts/release.mjs`）：官网构建部署、APK 构建上传到官网服务器。推送代码不触发发布，服务器不运行任何同步服务。
- 官网下载地址固定指向 `/releases/latest.apk`（符号链接，随发布原子切换）；新版本上传完成前继续指向上一版本。详见 `deploy/musicdan/README.md`。
- 官网 UI 框架使用 **shadcn/ui**，只使用 shadcn/ui 提供的控件并组合页面，**不要手写自定义 UI 控件，也不要手动复制控件源码**。
- 新增 shadcn/ui 控件必须通过 **yarn 调用官方 shadcn CLI** 安装；依赖同样使用 yarn 管理，不使用 npm、npx 或 pnpm。
- 布局和主题沿用 shadcn/ui 官方生成的配置，不另行引入其他 UI 框架或自建样式体系。
- 本节适用于官网与下载页；现有 Tauri / Android 应用继续遵守下节的 Tamagui 规则。

## 应用前端 UI

前端使用 **Tamagui**，样式一律通过 Tamagui 实现：只用 Tamagui 组件、主题 token 和布局属性，并复用 `src/tamagui.config.ts` 中的配置。

- **不要手写任何样式**：不添加 CSS 文件（如 `styles.css`）、内联 `style`、自定义 CSS 类，也不引入其他样式方案（如 NativeWind、styled-components）。
- **不要 hack Tamagui**：不要绕过它的类型和机制去强行实现效果，例如直接操作 DOM、伪造/滥用 token、绕过主题系统硬编码颜色、用 `style` 透传兜底等。
- 如果某个效果 Tamagui 确实做不到，**停下来和用户商量**：说明是哪个效果、尝试过哪些 Tamagui 方案，由用户决定取舍，不要自行 hack 绕过。

## 项目级 Skills

项目级 skills 统一安装在 `.agents/skills/<skill-name>/SKILL.md`。这是跨 agent 共享的通用目录，ZCode 等编码 agent 均会自动发现该目录。要求：

- 每个 skill 独立一个目录，目录名与 skill 的 `name` 一致，入口文件必须为 `SKILL.md`。
- `SKILL.md` 顶部必须有 YAML frontmatter，至少包含：
  - `name`：小写字母、数字和连字符（`^[a-z0-9][a-z0-9-]*$`），与目录名一致；
  - `description`：一句话说明 skill 的用途与触发时机（用于自动触发匹配）；
  - 可选 `metadata`（如 `version`）等元信息。
- 不要在 `.zcode/skills/` 下另放同名副本（ZCode 优先扫描 `.zcode`，两份副本容易失步）；统一以 `.agents/skills/` 为准。
- 新增或修改 skill 后，需新会话才会加载生效。

## 应用运行截图

- 应用截图统一使用安卓竖屏 **9:19.5** 比例，默认输出 **1080 × 2340** PNG（浏览器视口 432 × 936 CSS 像素，设备像素比 2.5）；普通页、全屏页和搜索页保持一致，通过运行时视口重新截图，不拉伸旧图片。

- 需要电脑生成应用截图时，运行真实应用前端：`yarn dev`，访问 `http://localhost:1420/?demo=creep`。
- 允许模拟 Radiohead — Creep 的原生播放状态；歌曲搜索、评论和歌词使用 `tests/fixtures/ncm-creep.json` 中保存的网易云真实数据（歌词为带原时间戳的短片段），不能编造；截图和演示默认离线读取、无有效期，仅显式运行 `yarn fixtures:refresh` 更新。November Rain (2022 Version) 场景使用 `?demo=november-rain&position=433000&freeze=1` 和 `tests/fixtures/ncm-november-rain.json`，通过 `yarn fixtures:refresh november-rain` 更新。界面必须由项目实际 React / Tamagui 代码渲染。
- 不得用 SVG、绘制图片或替换网页图片冒充真实运行截图。
- 浏览器无法验证跨应用悬浮、安卓权限与原生服务；这类截图需使用 Android 模拟器或真机。
