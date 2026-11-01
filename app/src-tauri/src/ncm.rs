//! 网易云音乐公开接口：搜索歌曲 + 拉取评论，按点赞数排序。
//!
//! 两个接口均为明文 HTTP API，无需登录，仅需 UA + Referer 头
//! （与仓库根目录 Python 原型验证的一致）。
//!
//! 匹配策略：MediaSession 的元数据来自播放器，可能与网易云条目有
//! 繁简体/大小写/空格/标点/全半角差异，因此先做归一化（繁→简 +
//! 全角→半角 + 去标点），再对搜索结果按「歌名 + 专辑 + 时长」打分
//! 取最优（专辑/时长消歧），都不匹配时退回第一条。

use serde::{Deserialize, Serialize};

mod t2s;

const BASE: &str = "https://music.163.com";
const UA: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

#[derive(Debug, Clone, Serialize)]
pub struct Comment {
    #[serde(rename = "commentId")]
    pub comment_id: i64,
    pub nickname: String,
    pub content: String,
    pub liked_count: i64,
    pub time_str: String,
    /// 发布时间（epoch 毫秒），弹幕时间轴按此排序
    pub time: i64,
}

/// 最终匹配到的网易云歌曲（返回给 UI 展示，便于人工核对）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongMatch {
    #[serde(rename = "songId")]
    pub song_id: i64,
    pub name: String,
    pub artists: String,
    pub album: String,
    /// 网易云侧的歌曲时长（毫秒），播放器未上报时长时兜底
    pub duration: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommentsResult {
    pub song: SongMatch,
    pub comments: Vec<Comment>,
}

/// 归一化：繁体转简体、全角转半角、转小写、去空白和常见标点装饰
fn norm(s: &str) -> String {
    let s = t2s::to_simplified(s);
    s.chars()
        .map(|c| {
            let code = c as u32;
            if (0xFF01..=0xFF5E).contains(&code) {
                char::from_u32(code - 0xFEE0).unwrap_or(c)
            } else {
                c
            }
        })
        .filter(|c| {
            !c.is_whitespace()
                && !"()（）[]【】{}「」『』・·-—–_~～'\"“”‘’!！?？.。,，、/|".contains(*c)
        })
        .collect::<String>()
        .to_lowercase()
}

/// 打分：完全相等 > 互相包含 > 无匹配
fn score(text: &str, pattern: &str) -> u32 {
    if pattern.is_empty() || text.is_empty() {
        return 0;
    }
    if text == pattern {
        100
    } else if text.contains(pattern) || pattern.contains(text) {
        60
    } else {
        0
    }
}

/// 按「歌名 + 专辑 + 时长」为候选打分；歌名权重更高，专辑/时长用于消歧
fn match_score(
    name: &str,
    album: &str,
    cand_duration: i64,
    kw_title: &str,
    kw_album: &str,
    kw_duration: Option<i64>,
) -> u32 {
    let mut s = score(&norm(name), kw_title) * 2 + score(&norm(album), kw_album);
    if let Some(kd) = kw_duration {
        if cand_duration > 0 {
            let diff = (cand_duration - kd).abs();
            s += if diff <= 1500 {
                40 // 时长几乎一致：很强的同曲信号
            } else if diff <= 4000 {
                20
            } else if diff <= 9000 {
                10
            } else {
                0
            };
        }
    }
    s
}

/// 搜索歌曲（关键词 = 歌名 + 歌手）并返回其热门评论，按点赞数降序。
/// album / duration（MediaSession 上报的毫秒时长）用于消歧：
/// 歌名+专辑对上、时长接近的候选优先。
#[tauri::command]
pub async fn fetch_comments(
    song: String,
    artist: String,
    album: Option<String>,
    duration: Option<i64>,
    limit: Option<u32>,
) -> Result<CommentsResult, String> {
    let keyword = format!("{} {}", song.trim(), artist.trim());
    let candidates = search_songs(keyword.clone()).await?;
    if candidates.is_empty() {
        return Err(format!("没搜到歌曲：{keyword}"));
    }
    // 2. 歌名+专辑+时长匹配：取分数最高的候选；全 0 时退回第一条（保持搜索相关性）
    let kw_title = norm(&song);
    let kw_album = album.as_deref().map(norm).unwrap_or_default();

    let mut best: Option<(u32, usize)> = None;
    for (i, c) in candidates.iter().enumerate() {
        let cand_album = c.album.as_str();
        let s = match_score(
            &c.name, cand_album, c.duration, &kw_title, &kw_album, duration,
        );
        if best.map_or(true, |(bs, _)| s > bs) {
            best = Some((s, i));
        }
    }

    let song_match = candidates[best.unwrap().1].clone();
    fetch_song_comments(song_match, limit).await
}

#[tauri::command]
pub async fn fetch_song_comments(
    song_match: SongMatch,
    limit: Option<u32>,
) -> Result<CommentsResult, String> {
    let limit = limit.unwrap_or(500).clamp(1, 500);
    let client = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // 3. 分页拉取评论（单页上限 100；明文接口 offset≥5000 无数据，故硬上限 5000）
    // 排序接口的 sortType 被服务端无视，「最热」靠拉回本地后按赞排。
    let sample_cap = limit.min(5000) as i64; // 采样量 = limit（明文接口 offset≥5000 无数据）
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawComment {
        #[serde(default)]
        comment_id: i64,
        #[serde(default)]
        content: String,
        #[serde(default)]
        liked_count: i64,
        #[serde(default)]
        time_str: String,
        #[serde(default)]
        time: i64,
        user: Option<serde_json::Value>,
    }

    let comments_url = format!(
        "{BASE}/api/v1/resource/comments/R_SO_4_{}",
        song_match.song_id
    );
    let mut raw_all: Vec<serde_json::Value> = Vec::new();
    let mut offset: i64 = 0;
    let mut total: i64 = i64::MAX;
    while offset < total && offset < sample_cap {
        let page: serde_json::Value = client
            .get(&comments_url)
            .header("Referer", BASE)
            .query(&[("limit", "100"), ("offset", offset.to_string().as_str())])
            .send()
            .await
            .map_err(|e| format!("评论请求失败: {e}"))?
            .error_for_status()
            .map_err(|e| format!("评论请求失败: {e}"))?
            .json()
            .await
            .map_err(|e| format!("解析评论失败: {e}"))?;
        let page_comments = page["comments"].as_array().cloned().unwrap_or_default();
        if page_comments.is_empty() {
            break;
        }
        total = page["total"].as_i64().unwrap_or(i64::MAX);
        offset += page_comments.len() as i64;
        raw_all.extend(page_comments);
    }

    let mut out: Vec<Comment> = serde_json::from_value::<Vec<RawComment>>(raw_all.into())
        .map_err(|e| format!("解析评论数据失败: {e}"))?
        .into_iter()
        .map(|c| Comment {
            comment_id: c.comment_id,
            nickname: c
                .user
                .as_ref()
                .and_then(|u| u["nickname"].as_str())
                .unwrap_or("匿名")
                .to_string(),
            content: c.content,
            liked_count: c.liked_count,
            time_str: c.time_str,
            time: c.time,
        })
        .collect();

    // 4. 按点赞数降序
    out.sort_by(|a, b| b.liked_count.cmp(&a.liked_count));
    out.truncate(limit as usize);

    Ok(CommentsResult {
        song: song_match,
        comments: out,
    })
}

#[tauri::command]
pub async fn search_songs(keyword: String) -> Result<Vec<SongMatch>, String> {
    if keyword.trim().is_empty() {
        return Ok(Vec::new());
    }
    let client = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let search: serde_json::Value = client
        .get(format!("{BASE}/api/search/get"))
        .header("Referer", BASE)
        .query(&[
            ("s", keyword.trim()),
            ("type", "1"),
            ("limit", "30"),
            ("offset", "0"),
        ])
        .send()
        .await
        .map_err(|e| format!("搜索请求失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("搜索请求失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("解析搜索结果失败: {e}"))?;

    let candidates: Vec<RawSong> =
        serde_json::from_value(search["result"]["songs"].clone()).unwrap_or_default();
    Ok(candidates.iter().map(song_from_raw).collect())
}

fn song_from_raw(picked: &RawSong) -> SongMatch {
    SongMatch {
        song_id: picked.id,
        name: picked.name.clone(),
        artists: picked
            .artists
            .as_ref()
            .and_then(|a| a.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v["name"].as_str())
                    .collect::<Vec<_>>()
                    .join(" / ")
            })
            .unwrap_or_default(),
        album: picked
            .album
            .as_ref()
            .and_then(|a| a["name"].as_str())
            .unwrap_or("")
            .to_string(),
        duration: picked.duration,
    }
}
#[derive(Deserialize)]
struct RawSong {
    id: i64,
    #[serde(default)]
    name: String,
    #[serde(default)]
    artists: Option<serde_json::Value>,
    #[serde(default)]
    album: Option<serde_json::Value>,
    #[serde(default)]
    duration: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn norm_converts_traditional_and_strips_noise() {
        // 繁→简：播放器给繁体「諾亞方舟」，网易云是简体「诺亚方舟」
        assert_eq!(norm("諾亞方舟"), "诺亚方舟");
        // 标点/空白/全角/大小写
        assert_eq!(norm("Worry Rock (Live)！"), "worryrocklive");
        assert_eq!(norm("ＡＢＣ ｄｅｆ"), "abcdef");
        // 纯表情退回原文（小写）
        assert_eq!(norm("[大哭]"), "大哭");
    }

    #[test]
    fn duration_tight_match_wins_over_loose() {
        // 歌名相同（含繁简差异）+ 时长接近 的候选应胜出
        let a = match_score(
            "诺亚方舟",
            "第二人生 (末日版)",
            344_550,
            "諾亞方舟",
            "第二人生 (末日版)",
            Some(344_000),
        );
        let b = match_score(
            "諾亞方舟",
            "諾亞方舟",
            190_000,
            "諾亞方舟",
            "第二人生 (末日版)",
            Some(344_000),
        );
        assert!(a > b, "a={a}, b={b}");
    }
}
