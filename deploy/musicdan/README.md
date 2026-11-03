# MusicDan 官网与 APK 镜像

入口：<https://musicdan.syncmoon.ink/>。React 静态页面位于 `website/`，shadcn/ui 控件由官方 CLI 安装，`src/index.css` 是 CLI 生成的主题文件。

## 构建与安装控件

```sh
yarn --cwd website install --frozen-lockfile
yarn --cwd website build
yarn --cwd website shadcn add <控件名>
python3 -m unittest discover -s deploy/musicdan -p 'test_*.py' -v
```

官网与 Tauri 应用分别管理依赖与 yarn.lock；不会把官网依赖打入 APK。

## 自动同步

服务器的 `musicdan-sync.timer` 在每次同步结束 5 分钟后再次检查公开 GitHub Release。仅下载正式发布、非草稿、非预发布的 arm64 APK，不需要 GitHub token 或服务器 SSH 私钥放入 Actions。

同步从 GitHub API 获取文件大小和 SHA-256，并通过 GitHub release asset API 下载文件至非公开的临时目录，校验成功后原子移动到 `/srv/musicdan/public/releases/<tag>/`，保留每个部署后新发布的版本，不覆盖同名构建。首次部署只镜像当前 Latest，不批量拉取部署前的全部 Release。`latest` 符号链接原子切换，下载失败不会切换到不完整文件。每次检查也会核对已缓存 APK 的摘要。缺少 GitHub 摘要的 Release 不会收录。

服务器主动拉取安装包，而不是由 CI 上传。新构建通过现有工作流全部测试与签名校验、发布 Release 后，通常在 5 分钟内开始同步；下载耗时另计。即使两次检查间发布了多个构建，也会补齐这些正式 Release。GitHub 不可用时保留已有下载，下一次检查重试。

公开路径：

- `/`：应用介绍与下载页。
- `/latest.json`：当前镜像最新版本的元数据。
- `/releases.json`：已镜像版本列表。
- `/releases/<tag>/MusicDan_<版本>_arm64.apk`：不可变安装包。
- APK URL 加 `.sha256`：校验文件。

构建标签仅用于下载路径，页面面向用户显示应用版本。

## 部署

本配置复用 `/root/caddy/docker-compose.yml` 中的中心 `caddy` 容器。安装器会备份原 Caddyfile 与 Compose 配置，增加 `/srv/musicdan` 只读挂载和配置 import，校验整个 Caddy 配置后启动容器。原有站点配置保留。域名 A 记录应指向服务器公网 IP `47.99.32.169`，安全组需允许 TCP 80/443；Caddy 管理 HTTPS 证书。

将以下文件打包为同一目录，通过 macmini 上的 `workbench upload` 上传到 ECS 后，以 root 执行 `bash install.sh`：

- 本目录的 `install.sh`、`sync-releases.py`、`musicdan-sync.service`、`musicdan-sync.timer`、`Caddyfile`。
- `website/dist/` 的内容放到该目录的 `site/` 下。

前端构建产物每次放进新的 `site-*` 目录，再切换 `/srv/musicdan/site` 符号链接。旧目录保留，可切回旧链接恢复页面。

## 运维

通过 AGENTS.md 中的 `musicdan-server-exec` 执行：

```sh
systemctl status musicdan-sync.timer musicdan-sync.service
journalctl -u musicdan-sync.service -n 50 --no-pager
systemctl start musicdan-sync.service
docker logs --tail 50 caddy
```

下载目录保留全部已镜像版本，定期关注磁盘空间。安装器不会删除旧安装包；剩余空间不足以容纳新 APK 加 100 MiB 预留时，同步停止并保留旧版本。
