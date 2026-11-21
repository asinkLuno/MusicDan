# CI 流水线与失败恢复

工作流:`.github/workflows/android-build.yml`(name: `Release Android APK and website`)。触发条件:push 到 `releases` 分支,或 `workflow_dispatch`。发布串行执行(concurrency 不取消),避免并发同步互相覆盖。

## 流水线步骤(build job)

1. **校验来源**:`releases` 构建的提交必须是 `origin/main` 的祖先,否则报错终止——保证发布的都是 main 上已有的代码。
2. **环境**:Node 24.22.1 + Yarn Classic(corepack 固定 1.22.22)、JDK 17(temurin)、固定版本的 Android SDK/NDK、Rust + `aarch64-linux-android` target;`yarn install --frozen-lockfile` 与 `yarn --cwd website install --frozen-lockfile`。
3. **恢复签名**:从 Repository Secrets(`ANDROID_KEYSTORE_BASE64` / `ANDROID_KEY_ALIAS` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_PASSWORD`)解出 keystore。任一 secret 缺失立即失败,绝不生成替代证书。
4. **构建 APK**:tauri-action 执行 `tauri android build --apk --split-per-abi --target aarch64`,注入 `MUSICDAN_BUILD_NUMBER = github.run_number`;`beforeBuildCommand` 会跑 `yarn build`,内含 `yarn quality` 门禁。
5. **校验 APK**(build-tools `apksigner` / `aapt`):
   - 签名证书 SHA-256 必须等于 `ANDROID_CERT_SHA256`(workflow 顶部 env,与现有 keystore 一致);
   - 包名 `io.github.asinkluno.musicdan`、`versionCode = 1000000000 + run_number`、`versionName` 等于 `package.json` 版本、native code 为 `arm64-v8a`;
   - 恰好产出一个签名 arm64 APK,复制为 `artifacts/ci/MusicDan_<版本>_arm64.apk` 并生成 `.sha256`。
6. **发布 GitHub Release**(细节见下节)。
7. **重新截图并构建发布页**:安装中文字体 `fonts-noto-cjk` → 启动 `yarn dev`(1420)与无头 Chrome(CDP 9229)→ `yarn build:release-site`(内含截图、校验、发布页构建)。
8. **生成 Pages 元数据**:`node scripts/pages-release.mjs --output website/dist --tag v<版本>`。
9. **部署**:上传 `website/dist/` 为 Pages artifact,deploy job 用 `actions/deploy-pages` 发布。
10. **清理签名材料**(`if: always()`):删除 `android-signing/musicdan.keystore` 与 `src-tauri/gen/android/keystore.properties`。

## GitHub Release 规则

- tag 为 `v<版本>`,附注标签固定指向本次构建的 `GITHUB_SHA`(即已推送的 main 提交),消息包含构建编号与 release-notes 摘要。
- tag 已存在:必须指向同一提交,否则报错要求提升版本号。
- Release 已发布(published):复用,不覆盖附件。
- Release 是草稿:删除后重建(草稿是上次失败的残留;`GET /releases/tags/<tag>` 查不到草稿,操作必须按 databaseId)。
- 新建流程:draft 创建(`--notes-file release-notes.md`)→ 上传 APK、`.sha256`、`release-notes.md` → 回读校验附件摘要(digest 字段或下载比对)→ `--draft=false --latest` 公开。

## 失败恢复

| 情况 | 处理 |
| --- | --- |
| 瞬时失败(网络、上传等) | `gh run rerun <run-id>` 重跑同一次运行,保持相同 run_number,APK versionCode 不变 |
| 代码问题导致失败 | 修复后推送 `main`,再重新快进同步 `releases`;这是新运行、新 run_number,产生新 versionCode |
| Release 步骤之后失败(截图/发布页/部署) | 直接重跑同一次运行:已发布的 Release 会被复用,后续步骤补完发布页与 Pages 部署;`workflow_dispatch` 也可用,但属于新运行(新 run_number),仅在 Release 已发布复用、APK 不重传时才无影响 |
| tag 已存在且指向其他提交 | 说明该版本号已用于别的提交——**提升版本号**,更新 release-notes 后重新走发布流程 |
| Release 已发布但发现错误 | 不要覆盖:提升版本号发新版本 |
| 签名 secret 缺失 / 证书指纹不匹配 | 检查 Repository Secrets 与 keystore,见 `docs/android-signing.md`;绝不生成新证书 |
| APK 校验失败(包名/版本号/架构) | 检查 4 个文件的版本号是否同步、`MUSICDAN_BUILD_NUMBER` 是否被注入 |
| 截图 stale / 尺寸不对 | 改版本号后必须重新截图;确认输出为 1080×2340,详见 `screenshots.md` |

## 本地前置依赖(本地校验/调试构建需要)

Android SDK/NDK、Java 17、Rust `aarch64-linux-android` target、Google Chrome、已登录且有仓库写权限的 `gh`。正式发布不依赖本地环境,只在 CI 进行。
