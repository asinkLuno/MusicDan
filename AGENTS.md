# AGENTS.md

## 版本发布

- 发布来源只能是 `main`。所有待发布改动必须先合入 `main`；`releases` 分支只用于从 `main` 同步并触发 GitHub Actions 发布，不能作为独立的开发或发布来源。

发布入口是 `.github/workflows/android-build.yml`：把 `main` 快进同步到 `releases` 后，CI 依次构建签名 arm64 APK → 校验应用 ID、版本号、架构与证书 → 创建/复用 `v<版本>` 附注 tag 和 GitHub Release（草稿上传、摘要回验后公开）→ 用现有截图工具重新截图并构建 React 发布页 → 从 GitHub Releases API 生成 `latest.json` / `releases.json` → 部署到 GitHub Pages（`https://asinkluno.github.io/MusicDan/`）。

- Git tag 为 `v<版本>`，固定指向已推送到 `origin/main` 的提交；标签包含构建编号与更新说明摘要。tag 已存在时只能指向同一提交；已发布 Release 不覆盖，草稿可在重试时重建。重复运行复用已发布附件，发布页失败时重跑同一工作流即可补完部署。
- 构建编号使用 `github.run_number`，APK `versionCode = 1000000000 + 构建编号`；重新运行同一次工作流保持相同编号，新的同步产生新编号。旧服务器构建编号已停用，不再读取服务器历史。
- APK 附件名为 `MusicDan_<版本>_arm64.apk`，同时上传同名 `.sha256` 和 `release-notes.md`。`release-notes.md` 是 GitHub Release 正文、附件、发布页和应用元数据的唯一更新日志来源。
- 发布页从 `/latest.json` 读取最新版本，从 `/releases.json` 读取历史版本；两者由 `scripts/pages-release.mjs` 从 GitHub Releases 生成，下载地址指向 GitHub Release 附件，不使用服务器本地路径。应用内检查更新读取同一份 `/releases.json`。
- GitHub Pages 使用 Actions 发布（`build_type=workflow`），站点使用相对资源路径，既可部署在 `/MusicDan/` 项目路径，也可后续绑定自定义域名。不要手工在 `gh-pages` 分支提交构建产物。
- 发布前同步 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 和 `src-tauri/Cargo.lock` 中的应用版本，并更新 `release-notes.md`，提交并推送 `main`。生成的 `artifacts/previews/` 截图允许变动，其余工作区必须干净。
- 签名材料只保存在本地 `android-signing/` 与 `src-tauri/gen/android/keystore.properties`（务必私有备份，不要提交或上传到任何远端）；CI 从 Repository Secrets 恢复。Android SDK/NDK、Java、Rust `aarch64-linux-android` target、Google Chrome 和已登录且有仓库写权限的 `gh` 是本地校验所需的依赖。
- `scripts/release.mjs` 与 `deploy/musicdan/` 是已停用的 ECS/Caddy 发布方案，仅作历史参考；`yarn release` / `yarn release:check` 不再是发布入口。正式发布统一通过 `main` → `releases` 的 Actions 流程。

### 发布说明格式

`release-notes.md` 只记录当前版本的更新，使用 `## ✨ v<版本> 更新内容`、更新基线和 `### <功能分组>`，不展示构建编号。GitHub Release 正文、Pages 元数据和应用更新界面共用该文件。系统要求如有变化，必须同步发布页与 README。

## 测试用例政策

- 本项目不编写、不新增、不维护测试用例，包括单元测试、集成测试、端到端测试和快照测试。
- 修改功能或修复问题时，不创建测试文件、测试模块、测试脚本，也不引入测试框架或测试依赖。
- 构建与发布流程不运行测试用例；按需通过类型检查、构建、静态检查和实际运行确认改动。
- `tests/fixtures/` 仅保留截图与离线演示所需的真实数据，不是测试用例，不得因清理测试而删除。

## 静态检查门禁

- 统一入口为 `yarn quality`，依次运行 ESLint（`yarn lint`）与 Prettier 格式检查（`yarn format:check`）。lint 错误、警告或格式不符均中止流程。
- 应用构建、发布页构建及发布流程必须执行门禁；APK 构建的 `beforeBuildCommand` 与 `website` 的 `prebuild` 都会运行 `yarn quality`。
- 门禁只检查，不自动修改文件。格式修复使用 `yarn format`，修复后重新运行 `yarn quality`。
- ESLint 覆盖项目 JavaScript / TypeScript（含 Node.js 脚本）；Prettier 范围由 `.prettierignore` 定义，外部技能包不纳入格式检查。
- 不用测试用例替代或扩展此门禁。

## 包管理器

本项目的 Tauri 前端使用 **yarn** 作为包管理器（以根目录 `yarn.lock` 为准）。

**不要**使用 npm 或 pnpm（不要运行 `npm install` / `pnpm install`，也不要生成 `package-lock.json` 或 `pnpm-lock.yaml`），以避免 lockfile 冲突。

## 官网与下载页 UI

- 发布页托管在 GitHub Pages：`https://asinkluno.github.io/MusicDan/`，由 `.github/workflows/android-build.yml` 在构建 APK 的同一次运行中构建并部署。
- 发布页使用 **React 构建静态页面**，资源路径使用相对路径（Vite `base: './'`），不依赖服务器根路径，也能兼容后续自定义域名。
- 发布页与 APK 由同一次 `main` → `releases` 同步发布；下载地址指向 GitHub Release 附件，`latest.json` / `releases.json` 由 `scripts/pages-release.mjs` 生成，不要手工维护版本号或下载链接。
- 旧的 `deploy/musicdan/` 与 `scripts/release.mjs` ECS/Caddy 部署已停用，仅保留作历史参考。
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
