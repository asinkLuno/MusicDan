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

1. **测试与官网**：运行前端与 Kotlin 插件测试；本地起 dev 服务与 headless Chrome 重建应用截图，`yarn build:release-site` 打包官网，上传服务器解压到新的 `site-*` 目录并原子切换 `/srv/musicdan/site` 符号链接。任一步失败则推送中止。
2. **本地构建签名 APK**：`yarn tauri android build`（构建编号 = 最新已发布 build-N + 1，`versionCode = 1000000000 + 编号`），`apksigner` 与 `aapt` 校验签名和元数据。
3. **发布 GitHub Release**：创建草稿 `build-N`，上传 APK 与官网包并核对资产摘要，通过后发布并标记 **Latest**，更新 `latest` 标签、创建版本标签 `v<版本>`。
4. **同步服务器**：上传 APK 到 `/srv/musicdan/public/releases/`，原子切换 `latest.apk` 符号链接，更新 `latest.json` / `releases.json`（版本号从本地 package.json 读取，SHA-256 与 GitHub 资产摘要双向校验）。

任何失败都会中止发布并保留上一成功版本的 Latest 状态。重复执行幂等：版本已发布时只补服务器同步。

首次克隆仓库需要启用钩子：

```sh
git config core.hooksPath .githooks
```

也可手动操作：`yarn release`（完整发布）；`node scripts/release.mjs --sync-server-only`（不构建，把 GitHub 最新发布同步到服务器）。

## 公开路径

- `/`：应用介绍与下载页（版本徽标与下载地址来自 `/latest.json`）。
- `/latest.json`：当前最新版本的元数据（服务器文件 `public/latest/release.json`）。
- `/releases.json`：历史版本列表。
- `/releases/latest.apk`：**固定下载地址**，始终指向最新发布版本（`.sha256` 为校验文件）。
- `/releases/<tag>/MusicDan_<版本>_arm64.apk`：历史不可变安装包。

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

`site-*` 与历史 APK 目录保留作为回滚点；回滚页面只需把 `/srv/musicdan/site` 符号链接切回旧目录。定期关注磁盘空间。
