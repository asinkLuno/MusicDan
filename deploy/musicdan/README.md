# MusicDan 官网与 APK 镜像

入口：<https://musicdan.syncmoon.ink/>。React 静态页面位于 `website/`，shadcn/ui 控件由官方 CLI 安装，`src/index.css` 是 CLI 生成的主题文件。

## 构建与安装控件

```sh
yarn --cwd website install --frozen-lockfile
yarn --cwd website build
yarn --cwd website shadcn add <控件名>
```

官网与 Tauri 应用分别管理依赖与 yarn.lock；不会把官网依赖打入 APK。

## 部署流程（本地钩子）

服务器只提供静态文件，不再运行任何 GitHub 同步服务。推送 **releases 分支**时，本地 `pre-push` 钩子（`.githooks/pre-push`）执行 `scripts/release.mjs` 完成本地发布：

1. **测试**：运行前端、数据、发布逻辑和 Kotlin 插件测试。
2. **本地构建**：运行真实前端重建截图、打包官网、构建签名 arm64 APK；校验签名与版本代码。
3. **上传与校验**：从服务器 `releases.json` 分配下一个构建编号，将 APK、官网包、校验文件、说明和元数据上传到独立暂存目录，服务器再次校验 APK 和官网包的 SHA-256。
4. **原子发布**：取得服务器发布锁并确认旧记录未变化，保留 `public/releases/build-N/` 为不可变版本目录；以 `public/latest` 符号链接一次切换官网、APK、版本信息和历史列表。旧目录保留用于回滚。

不调用 GitHub API、不上传 GitHub Release 附件、不推送发布标签。历史 GitHub Release 和标签保留。构建编号兼容迁移前的 `build-N` 记录，Android versionCode 继续递增。

重复执行时，已发布版本校验服务器 APK 后跳过；未发布版本重新构建上传。读取服务器失败会直接终止，不会清空历史或重置构建编号。

首次克隆仓库需要启用钩子：

```sh
git config core.hooksPath .githooks
```

也可运行 `yarn release` 完整发布；`node scripts/release.mjs --site-only` 只重建部署官网。原 `--sync-server-only` 已移除。

## 公开路径

- `/`：应用介绍与下载页（版本徽标与下载地址来自 `/latest.json`）。
- `/latest.json`：当前最新版本的元数据（服务器文件 `public/latest/release.json`）。
- `/releases.json`：历史版本列表。
- `/releases/latest.apk`：**固定下载地址**，始终指向最新发布版本（`.sha256` 为校验文件）。
- `/releases/build-N/MusicDan_<版本>_arm64.apk`：历史不可变安装包。
- `/releases/build-N/release-notes.md`：该版本的更新说明。

`latest.apk` 与 `/latest.json` 设置 `no-store`；具体版本文件 `immutable` 长缓存。

## 服务器初次安装

本配置复用 `/root/caddy/docker-compose.yml` 中的中心 `caddy` 容器。安装器会备份原 Caddyfile 与 Compose 配置，增加 `/srv/musicdan` 只读挂载和配置 import，校验整个 Caddy 配置后启动容器，并清理已废弃的 `musicdan-sync` systemd 单元。原有站点配置保留。域名 A 记录应指向服务器公网 IP `47.99.32.169`，安全组需允许 TCP 80/443；Caddy 管理 HTTPS 证书。

将以下文件打包为同一目录，通过 macmini 上的 `workbench upload` 上传到 ECS 后，以 root 执行 `bash install.sh`：

- 本目录的 `install.sh`、`Caddyfile`。
- `website/dist/` 的内容放到该目录的 `site/` 下。

## 运维

通过 AGENTS.md 中的 `musicdan-server-exec` 执行：

```sh
ls -la /srv/musicdan/                 # site 符号链接指向的目录即当前页面
readlink /srv/musicdan/public/releases/latest.apk
docker logs --tail 50 caddy
```

历史 `public/releases/build-N/` 目录保留作为回滚点；将 `public/latest` 原子切回对应目录即可同时回滚官网、APK 和发布记录。`--site-only` 单独部署的页面可通过 `/srv/musicdan/site` 切回旧目录。定期关注磁盘空间。

## 日常发布操作手册

发布入口统一为根目录的 `scripts/release.mjs`，以下命令调用同一流程：

| 入口 | 用途 | 是否修改服务器 |
| --- | --- | --- |
| `yarn release:check` | 检查工作区、四处版本号和更新说明 | 否 |
| `git push origin HEAD:releases` | 检查、构建并发布当前提交，然后推送代码 | 是 |
| `yarn release` | 手动执行完整发布，用于重试 | 是 |
| `yarn release:site` | 仅重新构建并替换官网 | 是 |
| `yarn build:release-site` | 仅打包官网，需要预览服务与 Chrome 已启动 | 否 |

正常发布顺序：

1. 同步根 package.json、Tauri 配置、Cargo.toml 和 Cargo.lock 的应用版本。
2. 更新 release-notes.md，仅保留当前版本说明；提交源码与说明。生成的 artifacts/previews 截图允许有改动，其余未提交或未跟踪文件会阻止发布。
3. 运行 `yarn release:check`，再推送当前提交到 releases 分支。首次克隆需启用钩子并准备本地签名、SDK/NDK、Chrome、官网依赖及 macmini 访问。
4. 检查官网 latest.json 的版本、source_commit 和固定 APK 下载地址。

注意：pre-push 在 Git 推送完成**之前**发布服务器。若随后 Git 推送失败，官网可能已经上线；修复 Git 连接后重试相同提交即可。相同版本已存在时仅校验已有 APK 并跳过，修改应用必须提高版本号。

服务器记录读取失败时修复连接后重试，禁止手工清空记录；并发冲突时等待另一发布完成后重试。上传或构建失败不会推进最新版本指针。官网单独部署使用独立目录，下一次完整发布会重新接管官网指针。

回滚旧 public/latest 会同时回滚历史列表，因此回滚后不要直接发布新版本：必须先恢复完整历史记录并确认最大构建编号，否则可能重新使用已有编号。旧版本目录和签名材料必须保留。
