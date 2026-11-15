# 应用截图

应用截图用浏览器渲染**真实运行的前端**产出,统一为安卓竖屏 9:19.5,输出 1080×2340 PNG(视口 432×936 CSS 像素 × 2.5 设备像素比)。入口脚本是 `scripts/capture-release.mjs`(`yarn screenshots:release`),底层用 Chrome DevTools Protocol(`scripts/capture-app.mjs`)驱动无头 Chrome。

## 硬性规则

- 必须运行真实前端(`yarn dev`)渲染,由项目实际 React / Tamagui 代码产出;不得用 SVG、绘图或替换网页图片冒充截图。
- 歌曲搜索、评论、歌词用 `tests/fixtures/ncm-creep.json` 与 `tests/fixtures/ncm-november-rain.json` 中保存的网易云真实数据,不能编造。fixtures 离线读取、无有效期,只在明确要求时运行 `yarn fixtures:refresh` 更新。
- 浏览器截图只能覆盖应用内界面;跨应用悬浮、安卓权限弹窗、原生服务等场景必须用 Android 模拟器或真机,不要伪造。

## 本地截图步骤

需要两个后台进程:开发服务器(端口 1420)和无头 Chrome(CDP 端口 9229)。

```sh
yarn install                      # 若依赖未安装
yarn dev &                        # 前端,默认 http://127.0.0.1:1420/
google-chrome --headless --disable-gpu --no-sandbox --no-first-run \
  --remote-debugging-port=9229 --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/tmp/musicdan-chrome about:blank &
```

确认两个服务就绪(`curl -fsS http://127.0.0.1:1420/` 和 `curl -fsS http://127.0.0.1:9229/json/version`)后执行:

```sh
yarn screenshots:release          # = node scripts/capture-release.mjs
```

两个场景各产出 3 张图到 `artifacts/previews/`,共 6 张:

| 场景 | 文件前缀 | 播放位置 | demo 参数 |
| --- | --- | --- | --- |
| Radiohead — Creep | `app-` | 4000 ms | `?demo=creep` |
| Guns N' Roses — November Rain (2022 Version) | `november-rain-` | 433000 ms | `?demo=november-rain` |

每张图对应一个界面:`*-danmaku.png`(播放页弹幕)、`*-search.png`(手动匹配搜索)、`*-fullscreen.png`(全屏弹幕)。同时生成清单 `artifacts/previews/screenshots.json`,记录 appVersion、sourceCommit、每张图的 SHA-256。

可用环境变量覆盖:`MUSICDAN_PREVIEW_URL`(前端地址)、`CHROME_DEBUG_URL`(CDP 地址)、`MUSICDAN_SCREENSHOT_POSITION`(播放位置)。

## 校验规则(会被 CI 强制执行)

`scripts/site-assets.mjs` 会校验,任何一条不满足构建直接失败:

- 每张图必须是 PNG 且尺寸恰好 1080×2340。
- 清单 `appVersion` 必须等于 `package.json` 的 `version`——**改完版本号必须重新截图**,旧图会被判为 stale。
- CI 中(CI 会设置 `GITHUB_SHA`)清单 `sourceCommit` 必须等于当前构建提交。
- 每张图的 SHA-256 必须与清单一致。

## CI 中的截图

CI 不单独调用 `yarn screenshots:release`,而是走 `yarn build:release-site`:`website` 的 prebuild 会先运行 `prepare-site-assets.mjs --capture` 自动完成上述截图并校验。CI 用 Ubuntu runner,截图前需安装中文字体 `fonts-noto-cjk`,否则歌词/评论中文会变成豆腐块。

调试单个场景时,也可以直接访问 demo 页面人工检查:`http://localhost:1420/?demo=creep` 或 `http://localhost:1420/?demo=november-rain&position=433000&freeze=1`。
