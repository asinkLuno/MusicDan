---
name: android-release
description: MusicDan 安卓应用的构建与发布全流程——版本号同步、release-notes.md 更新说明、应用截图、发布页(landing page)构建、GitHub Release 与 GitHub Pages 部署。当用户要发新版本、打 APK、更新发布页或官网、重新截图、写更新说明、发布 GitHub Release,或排查发布 CI 失败时使用;即使用户只提到其中一个环节(比如"更新一下发布页截图""帮我发个包")也应触发。
metadata:
  version: 1.0.0
---

# Android 构建与发布

发布入口是 `.github/workflows/android-build.yml`:把 `main` 快进同步到 `releases` 分支后,CI 在同一次运行里依次完成 **签名 arm64 APK → 校验 → GitHub Release → 重新截图并构建发布页 → GitHub Pages**。正式构建只在 CI 进行,本地只做调试构建和发布前准备。

## 硬性规则

- 发布来源只能是 `main`;`releases` 只用于快进同步触发发布,不能在上面开发或提交独立改动(CI 会用 merge-base 校验,不是 main 的祖先直接失败)。
- 包管理只用 **yarn**,不要用 npm/pnpm/npx。
- `release-notes.md` 是唯一更新日志来源:GitHub Release 正文、Pages 元数据、应用内更新界面共用它。只记录**当前版本**的更新,不展示构建编号。
- 版本号必须在 4 个文件中同步:`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`(改完 Cargo.toml 后在 `src-tauri/` 下运行 `cargo update -p musicdan` 刷新 lock,或让下一次 cargo 命令刷新)。
- APK `versionCode = 1000000000 + github.run_number`,由 CI 自动写入,不要手工指定。
- 不手工往 `gh-pages` 提交构建产物;Pages 用 Actions 发布(build_type=workflow),站点资源用相对路径(`website/vite.config.ts` 中 `base: './'`)。
- `latest.json` / `releases.json` 由 `scripts/pages-release.mjs` 从 GitHub Releases API 生成,不要手工维护版本号或下载链接。
- 签名材料只存在本地 `android-signing/` 与 Repository Secrets,永远不要生成替代证书。参见 `docs/android-signing.md`。
- 不编写测试用例;用 `yarn quality`(ESLint + Prettier)做门禁,lint 错误、警告或格式不符都算失败。

## 发布 checklist

按顺序执行:

1. **同步版本号**:更新上面列出的 4 个文件。
2. **更新 `release-notes.md`**,格式:

   ```markdown
   ## ✨ v<版本> 更新内容

   更新基线:在 v<上一版本> 基础上……

   ### <功能分组>

   - <更新条目>
   ```

   系统要求如有变化,同步更新发布页与 README。
3. **本地校验**:运行 `yarn quality`;需要真机验证时用调试构建 `yarn tauri android build --debug --target aarch64 --apk`。
4. **提交并推送 `main`**:工作区必须干净(`artifacts/previews/` 生成的截图允许变动)。
5. **触发发布**(二选一):

   ```sh
   git push origin main:releases          # 常规方式,快进同步
   gh workflow run android-build.yml --ref releases   # 手动触发;注意这是新运行,run_number 会变
   ```

6. **盯 CI 并验证发布结果**,见下节。

## 发布后验证

```sh
gh run watch     # 或 gh run list --workflow android-build.yml 观察进度
gh release view v<版本>          # 确认 APK / .sha256 / release-notes.md 三个附件
curl -fsS https://asinkluno.github.io/MusicDan/latest.json | head -20
```

- GitHub Release:https://github.com/asinkLuno/MusicDan/releases/tag/v\<版本\>
- 发布页:https://asinkluno.github.io/MusicDan/ ,`latest.json` 的 `version` 应等于刚发的版本,`download_url` 指向 Release 附件。
- 应用内"检查更新"读取同一份 `releases.json`,发布页正常即代表应用内更新正常。

## 局部任务入口

用户只要求其中一个环节时,先读对应 reference 再动手,不要凭印象操作:

| 任务 | 读这个 |
| --- | --- |
| 重新截取应用截图(弹幕/搜索/全屏) | `references/screenshots.md` |
| 修改发布页布局、换截图、本地预览发布页 | `references/landing-page.md` |
| CI 某一步失败、tag 冲突、重跑规则 | `references/ci-and-recovery.md` |
