# MusicDan 官网与 APK 镜像

入口：<https://musicdan.syncmoon.ink/>。React 静态页面位于 `website/`，shadcn/ui 控件由官方 CLI 安装，`src/index.css` 是 CLI 生成的主题文件。

## 构建与安装控件

```sh
yarn --cwd website install --frozen-lockfile
yarn --cwd website build
yarn --cwd website shadcn add <控件名>
```

官网与 Tauri 应用分别管理依赖与 yarn.lock；不会把官网依赖打入 APK。

## 本地发布流程

在当前 macmini 上发布，不使用 GitHub Actions 或 release 分支。先将版本号、源码与 `release-notes.md` 合入并推送 `main`，工作区除生成截图外必须干净。

```sh
yarn release:check
yarn release
```

`release:check` 执行静态检查、版本与说明检查、本机依赖、GitHub 权限、main 与标签、服务器历史及目录检查；不会打标、构建或上传。需要网络，会 fetch main 及已存在的同名 tag。

完整发布顺序：

1. 预检通过后，在固定 main 提交上创建 `vX.Y.Z` 附注标签并推送 origin。标签记录源码 SHA、构建编号和更新日志摘要。
2. 构建签名 arm64 APK，校验应用 ID、`versionName`、`versionCode`、架构和 release 签名证书。
3. 启动真实应用前端与本机 Chrome，官网构建调用现有截图工具，重新生成 1080 × 2340 截图；官网清单记录版本和源码 SHA。
4. APK、官网包、更新日志和元数据上传服务器独立暂存目录，校验 SHA-256 并准备不可变版本目录；此时线上页面和下载仍指向旧版本。
5. 在 GitHub 创建草稿 Release，上传同一 APK、校验文件和 `release-notes.md`，下载回验后一并公开。GitHub 正文直接读取相同的更新日志，不使用自动生成说明。
6. 在服务器发布锁内确认旧记录未变化，原子切换 `public/latest`，同时更新发布页、APK、`latest.json` 和 `releases.json`。发布页通过 `/latest.json` 显示新版本号。随后清理服务器较早版本，仅保留最近 3 个；GitHub 历史 Release 保留。

本机需安装根目录和 website 的 yarn 依赖、Android SDK build-tools/NDK、Java、Rust Android target、Google Chrome、workbench、gh，并登录有仓库写权限的 GitHub 账号。SDK 默认位于 `~/Library/Android/sdk`，可通过 `ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 指定；NDK 可用 `NDK_HOME` 或 `ANDROID_NDK_HOME` 指定。设置 `MUSICDAN_ECS_INSTANCE`，备份并配置现有私有签名材料。连接服务器的方法见根目录 AGENTS.md。

当前 macmini 的环境配置保存在被 Git 忽略的 `android-signing/release-env.sh`，新终端先执行 `source android-signing/release-env.sh`。首版使用新签名，私有备份需包含 `android-signing/musicdan.keystore`、`android-signing/signing-credentials.txt` 和 `src-tauri/gen/android/keystore.properties`；旧内部测试版需卸载后重新安装。

### 版本与重试规则

- tag 为 `vX.Y.Z`，`versionName` 为 `X.Y.Z`，package.json、Tauri、Cargo 的应用版本必须一致。tag 先于构建创建，不因构建失败而删除或移动。
- `versionCode` 延续 `1000000000 + 构建编号`，构建编号从服务器历史分配并固定在标签中；读取失败禁止归零。旧标签已清理不代表 Android 升级编号可以重置。
- 同名标签必须是本流程生成的附注标签，指向相同 main SHA，且更新说明摘要相同。标签冲突立即中止，绝不强推标签。
- 本地产物保存在 `artifacts/releases/vX.Y.Z/`。重复运行复用已校验的 APK；官网包完整生成后也复用。上传附件同名时核验摘要，不覆盖；摘要不同则停止。
- GitHub 与官网不能跨平台原子发布。GitHub 发布后官网切换失败，保留标签、Release 和本地缓存，修复原因后重跑 `yarn release`，补完官网切换。
- GitHub 已有草稿或正式版本、或服务器已经暂存该版本时，本地完整缓存缺失就停止，需恢复原缓存，不能重新构建同名版本。其他发布抢先改变服务器历史时停止，不复用已经冲突的编号。
- 同一工作区通过 `artifacts/releases/.release-lock` 防止并发构建。进程异常终止留下锁时，确认没有发布进程后再删除该锁目录；不要删除版本产物目录。
- 不再提供 `release:site`；截图和发布页始终跟随同一次完整发布。`yarn build:release-site` 仍可单独构建官网，但需自行启动预览服务和 Chrome。

参考：[Android 版本管理](https://developer.android.com/studio/publish/versioning)、[Android 应用签名](https://developer.android.com/studio/publish/app-signing)、[Git tag](https://git-scm.com/docs/git-tag)、[GitHub Release CLI](https://cli.github.com/manual/gh_release_create)。

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

通过 AGENTS.md 中的 `workbench exec --command` 执行以下远程命令：

```sh
ls -la /srv/musicdan/                 # site 符号链接指向的目录即当前页面
readlink /srv/musicdan/public/releases/latest.apk
docker logs --tail 50 caddy
```

最近 3 个 `public/releases/build-N/` 目录保留作为回滚点；将 `public/latest` 原子切回对应目录即可同时回滚官网、APK 和发布记录。旧流程单独部署的页面可通过 `/srv/musicdan/site` 切回旧目录。定期关注磁盘空间。

## 服务器兼容与回滚

发布脚本要求现有目录已采用统一指针：`site → public/latest/site`、`public/releases.json → latest/releases.json`、`public/releases/latest.apk → ../latest/app.apk`，以及对应的校验文件链接。预检不通过时先检查服务器布局；脚本不会在发布时隐式迁移旧目录。

固定下载地址和应用更新接口保持兼容。服务器发布辅助脚本 `scripts/publish-release.py` 由本机通过 workbench 执行，不常驻服务器；上传和切换均在发布锁内重新检查文件与旧记录。

回滚 `public/latest` 会同时回滚页面、APK 和历史列表。回滚后不要直接发布新版本：必须先恢复完整历史记录并确认最大构建编号，避免复用已发布编号。回滚仅限仍保留的版本；签名材料必须永久私有备份。
