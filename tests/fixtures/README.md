# 截图与测试数据

`ncm-creep.json` 是从网易云实际接口录制的固定 fixture，供离线电脑预览、运行截图和测试使用。数据包含 Creep 原版的歌曲信息、真实搜索结果、各版本评论数、1000 条真实评论，以及保留原始时间戳的短歌词片段。歌词只保存覆盖测试场景所需的短片段，不保存整首歌词；不包含用户头像、用户 ID 或昵称。

- `source.capturedAt` 记录采集时间，`source.songUrl` 记录歌曲来源。
- 数据作为项目文件保留，无有效期。启动 Vite、刷新浏览器和重新截图都不会连接网易云。
- 需要更新时显式运行 `yarn fixtures:refresh`。刷新成功后才原子替换文件，失败保留旧数据。
- `yarn test:fixtures` 检查数据一致性、0:04 弹幕排布及预览接口离线读取。
- 预览只覆盖已录制数据；其他歌曲不会自动联网，也不会用虚构内容填补。

## November Rain (2022 Version)

`ncm-november-rain.json` 录制 Guns N’ Roses 的 2022 版本（歌曲 ID `1997439178`），保留真实评论、搜索结果及覆盖 7:13 的短歌词片段和原始时间戳。

- 离线预览：`http://localhost:1420/?demo=november-rain&position=433000&freeze=1`。
- 显式更新：`yarn fixtures:refresh november-rain`。
- 截图脚本使用 `demo=november-rain` 时默认固定进度 7:13。

November Rain 自动截图会在真实搜索界面选中 `1997439178`（Super Deluxe）和 `1997442946`（Deluxe Edition）并应用合并；`previewSongIds` 保存此选择，`tracks` 保存额外版本的真实评论及歌词片段。按评论 ID 合并去重，不修改服务记录的评论数。补录版本可运行 `yarn fixtures:add-version november-rain 1997442946`；显式刷新场景也会刷新这些已录制的合并版本。

歌词录制会保留目标时间附近的一组真实原文及接口提供的对应中文翻译，保持相同时间戳。只补录歌词可运行 `yarn fixtures:refresh-lyrics november-rain`，不会重新抓取评论；数据不完整或录制失败时保留原文件。
