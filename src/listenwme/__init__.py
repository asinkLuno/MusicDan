"""listenwme —— 获取网易云音乐某首歌的评论。"""

from __future__ import annotations

import argparse
import sys

from .netease import iter_comments, search_song


def _fmt_ms(ms: int) -> str:
    m, s = divmod(ms // 1000, 60)
    return f"{m}:{s:02d}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="listenwme", description="获取网易云音乐的某首歌的评论"
    )
    parser.add_argument("keyword", help='歌名关键词，如 "worry rock"')
    parser.add_argument(
        "-n", "--limit", type=int, default=20, help="最多展示的评论条数（默认 20）"
    )
    parser.add_argument(
        "--pick", type=int, default=1, help="选择搜索结果中的第几首（默认 1）"
    )
    args = parser.parse_args(argv)

    songs = search_song(args.keyword)
    if not songs:
        print(f"没有搜到：{args.keyword}", file=sys.stderr)
        return 1

    print("搜索结果：")
    for i, s in enumerate(songs, 1):
        print(
            f"  {i}. {s.name} — {s.artists} 《{s.album}》"
            f" [{_fmt_ms(s.duration_ms)}] id={s.id}"
        )

    pick = songs[args.pick - 1] if 1 <= args.pick <= len(songs) else songs[0]
    print(f"\n《{pick.name}》— {pick.artists} 的评论（最多 {args.limit} 条）：\n")

    for i, c in enumerate(iter_comments(pick.id), 1):
        if i > args.limit:
            break
        user = (c.get("user") or {}).get("nickname", "匿名")
        likes = c.get("likedCount") or 0
        time_str = c.get("timeStr", "")
        print(f"{i:>4}. [{time_str}] {user}（{likes} 赞）")
        print(f"      {str(c.get('content') or '').strip()}")
        for r in c.get("beReplied") or []:
            ruser = (r.get("user") or {}).get("nickname", "匿名")
            print(f"      └ 回复 @{ruser}：{str(r.get('content') or '').strip()}")
        print()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
