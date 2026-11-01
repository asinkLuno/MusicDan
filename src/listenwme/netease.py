"""网易云音乐公开接口的简单封装（无需登录）。"""

from __future__ import annotations

import time
from dataclasses import dataclass

import requests

BASE = "https://music.163.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    ),
    "Referer": "https://music.163.com",
}


@dataclass
class Song:
    id: int
    name: str
    artists: str
    album: str
    duration_ms: int


def search_song(keyword: str, limit: int = 10) -> list[Song]:
    """按关键词搜索歌曲，返回候选列表。"""
    resp = requests.get(
        f"{BASE}/api/search/get",
        params={"s": keyword, "type": 1, "limit": limit, "offset": 0},
        headers=HEADERS,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()
    songs = data.get("result", {}).get("songs") or []
    return [
        Song(
            id=s["id"],
            name=s["name"],
            artists=" / ".join(a["name"] for a in s.get("artists") or []),
            album=(s.get("album") or {}).get("name", ""),
            duration_ms=s.get("duration") or 0,
        )
        for s in songs
    ]


def iter_comments(song_id: int, page_size: int = 100):
    """分页拉取歌曲的评论，依次产出每条评论字典。"""
    offset = 0
    total = None
    while total is None or offset < total:
        resp = requests.get(
            f"{BASE}/api/v1/resource/comments/R_SO_4_{song_id}",
            params={"limit": page_size, "offset": offset},
            headers=HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        total = data.get("total", 0)
        comments = data.get("comments") or []
        if not comments:
            break
        yield from comments
        offset += len(comments)
        time.sleep(0.2)  # 温和限速，避免请求过快
