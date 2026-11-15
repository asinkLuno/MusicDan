# 发布页(landing page)

发布页是 `website/` 下的独立 React 项目,部署在 GitHub Pages 项目路径:https://asinkluno.github.io/MusicDan/ 。与 APK 在同一次 CI 运行中构建并部署,不是独立流程。

## 技术栈与 UI 规则

- React 19 + Tailwind CSS 4(`@tailwindcss/vite`)+ Vite,`base: './'` 相对资源路径(兼容 `/MusicDan/` 项目路径与未来自定义域名)。
- UI 框架使用 **shadcn/ui**(style: `radix-nova`,图标 lucide):只用 shadcn/ui 提供的控件组合页面,不手写自定义控件,也不手动复制控件源码。
- 新增控件必须通过 yarn 调用官方 shadcn CLI 安装(在 `website/` 目录):

  ```sh
  yarn --cwd website shadcn add <component>
  ```

- 已装控件在 `website/src/components/ui/`;页面代码在 `website/src/`。不引入其他 UI 框架或自建样式体系。

## 截图与品牌资源

- `website` 构建时(prebuild)由 `scripts/prepare-site-assets.mjs` 从 `artifacts/previews/` 复制 3 张站用截图:`app-danmaku.png`、`november-rain-danmaku.png`、`november-rain-search.png` 到 `website/public/screenshots/`,再由 `optimize-screenshots.mjs`(sharp)生成 540/810/1080 三档 AVIF/WebP 变体并删除原始 PNG。原图始终保留在 `artifacts/previews/`,不要手工往 `website/public/screenshots/` 放图。
- 品牌图由 `optimize-brand.mjs` 处理,源文件在 `docs/brand/`。
- 截图本身的产出与校验规则见 `screenshots.md`。

## 构建与部署

```sh
yarn build:release-site    # = node scripts/build-release-site.mjs
```

它做四件事(本地与 CI 一致):

1. `yarn --cwd website build`——prebuild 依次执行 `yarn quality` 门禁 → 截图+校验 → 图片优化,然后 `tsc --noEmit && vite build`;
2. 校验截图清单与 `package.json` 版本一致;
3. 把 `website/dist/` 全部文件哈希写入 `website/dist/site-manifest.json`;
4. 打包 `artifacts/releases/MusicDan_<版本>_website.tar.gz`。

正式部署不需要本地打包,由 CI 完成:`pages-release.mjs` 把 `latest.json` / `releases.json` 写进 `website/dist/` 后,`actions/upload-pages-artifact` + `actions/deploy-pages` 部署整个目录。

## 发布元数据(latest.json / releases.json)

`scripts/pages-release.mjs` 从 GitHub Releases API 生成,**不要手工编辑**:

- 只收录已发布(非 draft、非 prerelease)且带 `MusicDan_*_arm64.apk` 附件的 Release;
- SHA-256 取自 asset 的 `digest` 字段,缺失时下载同名 `.sha256` 文件比对;
- `latest.json` 优先取 `--tag` 指定的版本,否则取最近发布的;`releases.json` 是全部历史,按发布时间倒序;
- 下载地址指向 GitHub Release 附件,不用任何服务器本地路径;
- 需要 `GH_TOKEN`/`GITHUB_TOKEN` 环境变量。应用内"检查更新"读取 Pages 上的同一份 `releases.json`。

## 本地预览

```sh
yarn --cwd website dev       # http://127.0.0.1:5173,prebuild 会先同步/优化截图
yarn --cwd website preview   # 预览构建产物
```

本地 dev 模式 `base` 是 `/`,与线上的 `./` 不同;验证相对路径行为要用构建产物。Pages 部署失败时按 `ci-and-recovery.md` 重跑同一工作流补完,不要手工提交 `gh-pages`。
