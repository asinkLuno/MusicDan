# listenWme

获取网易云音乐某首歌的评论（使用公开接口，无需登录）。

## 使用

```bash
uv run listenwme "worry rock"          # 搜索并列出前 20 条评论
uv run listenwme "worry rock" -n 50    # 最多 50 条
uv run listenwme "worry rock" --pick 3 # 选用搜索结果中的第 3 首
```
