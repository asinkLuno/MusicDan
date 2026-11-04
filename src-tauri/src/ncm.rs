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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comment {
    #[serde(rename = "commentId")]
    pub comment_id: i64,
    pub nickname: String,
    pub content: String,
    pub liked_count: i64,
    pub time_str: String,
    /// 发布时间（epoch 毫秒），弹幕时间轴按此排序
    pub time: i64,
    pub occurrences: u32,
}

/// Normalize formatting and repeated phrases in linear time; preserve wording and negation.
pub fn comment_key(content: &str) -> String {
    let chars: Vec<char> = content
        .chars()
        .flat_map(char::to_lowercase)
        .filter(|c| !c.is_whitespace() && !"!！?？。.，,~～…、".contains(*c))
        .collect();
    if chars.is_empty() {
        return content.trim().to_string();
    }
    let mut prefix = vec![0; chars.len()];
    for i in 1..chars.len() {
        let mut j = prefix[i - 1];
        while j > 0 && chars[i] != chars[j] {
            j = prefix[j - 1];
        }
        if chars[i] == chars[j] {
            j += 1;
        }
        prefix[i] = j;
    }
    let period = chars.len() - prefix[chars.len() - 1];
    if chars.len() % period == 0
        && chars[..period]
            .iter()
            .any(|c| c.is_alphabetic() || !c.is_ascii())
    {
        chars[..period].iter().collect()
    } else {
        chars.iter().collect()
    }
}

/// Each API ID counts once. Keep the most-liked wording and the earliest group timestamp.
pub fn group_comments(comments: Vec<Comment>) -> Vec<Comment> {
    use std::collections::{HashMap, HashSet};
    let mut seen = HashSet::new();
    let mut groups = HashMap::<String, usize>::new();
    let mut out: Vec<Comment> = Vec::new();
    for comment in comments {
        if !seen.insert(comment.comment_id) {
            continue;
        }
        let key = comment_key(&comment.content);
        if let Some(&index) = groups.get(&key) {
            let group = &mut out[index];
            let earliest = group.time.min(comment.time);
            let occurrences = group.occurrences.saturating_add(comment.occurrences);
            if comment.liked_count > group.liked_count {
                *group = comment;
            }
            group.time = earliest;
            group.occurrences = occurrences;
        } else {
            groups.insert(key, out.len());
            out.push(comment);
        }
    }
    out.sort_by(|a, b| b.liked_count.cmp(&a.liked_count).then(a.time.cmp(&b.time)));
    out
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
    let song_match = match_song(song, artist, album, duration).await?;
    fetch_song_comments(song_match, limit).await
}

pub async fn match_song(
    song: String,
    artist: String,
    album: Option<String>,
    duration: Option<i64>,
) -> Result<SongMatch, String> {
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

    Ok(candidates[best.unwrap().1].clone())
}

#[tauri::command]
pub async fn fetch_song_comments(
    song_match: SongMatch,
    limit: Option<u32>,
) -> Result<CommentsResult, String> {
    fetch_song_comments_progress(song_match, limit, |_| {}).await
}

/// Publish cumulative snapshots every 1000 sampled comments, plus the final remainder.
pub async fn fetch_song_comments_progress(
    song_match: SongMatch,
    limit: Option<u32>,
    on_progress: impl Fn(Vec<Comment>) + Send,
) -> Result<CommentsResult, String> {
    let cap = limit.filter(|n| *n > 0).map(|n| n as usize);
    let client = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    // Offset pagination stops early. Continue from the oldest timestamp instead.
    // Keep the first page's hotComments even when they are older than our sample.
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

    let decode = |raw: &[serde_json::Value]| -> Result<Vec<Comment>, String> {
        let mut out: Vec<Comment> = serde_json::from_value::<Vec<RawComment>>(raw.to_vec().into())
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
                occurrences: 1,
            })
            .collect();

        // 4. 按点赞数降序
        out.sort_by(|a, b| b.liked_count.cmp(&a.liked_count));
        if let Some(cap) = cap {
            out.truncate(cap);
        }

        Ok(out)
    };

    let comments_url = format!(
        "{BASE}/api/v1/resource/comments/R_SO_4_{}",
        song_match.song_id
    );
    let mut raw_all: Vec<serde_json::Value> = Vec::new();
    let mut before = None::<i64>;
    let mut seen = std::collections::HashSet::new();
    let mut sampled = 0usize;
    let mut published = 0usize;
    while cap.is_none_or(|cap| raw_all.len() < cap) {
        let mut query = vec![("limit", "100".to_string()), ("offset", "0".to_string())];
        if let Some(time) = before {
            query.push(("beforeTime", time.to_string()));
        }
        let page: serde_json::Value = client
            .get(&comments_url)
            .header("Referer", BASE)
            .query(&query)
            .send()
            .await
            .map_err(|e| format!("评论请求失败: {e}"))?
            .error_for_status()
            .map_err(|e| format!("评论请求失败: {e}"))?
            .json()
            .await
            .map_err(|e| format!("解析评论失败: {e}"))?;
        if page["code"].as_i64() != Some(200) {
            return Err(format!("评论接口返回错误: {}", page["code"]));
        }
        if before.is_none() {
            for comment in page["hotComments"].as_array().into_iter().flatten() {
                if let Some(id) = comment["commentId"].as_i64() {
                    if seen.insert(id) {
                        raw_all.push(comment.clone());
                    }
                }
            }
        }
        let page_comments = page["comments"].as_array().cloned().unwrap_or_default();
        if page_comments.is_empty() {
            break;
        }
        let next = page_comments
            .iter()
            .filter_map(|c| c["time"].as_i64())
            .min();
        let mut added = 0;
        for comment in page_comments {
            sampled += 1;
            if let Some(id) = comment["commentId"].as_i64() {
                if seen.insert(id) {
                    raw_all.push(comment);
                    added += 1;
            }
        }
        }
        if (published == 0 || sampled / 1000 > published / 1000)
            && cap.is_none_or(|cap| raw_all.len() < cap)
        {
            on_progress(decode(&raw_all)?);
            published = sampled;
        }
        // Stop if the server ignores the cursor or repeats a page.
        if added == 0 || next.is_none() || before.is_some_and(|time| next.unwrap() >= time) {
            break;
        }
        before = next;
        if page["more"].as_bool() == Some(false) {
            break;
        }
    }

    let out = decode(&raw_all)?;
    on_progress(out.clone());

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

/// Only fetch one comment to read the total, without downloading all pages.
#[tauri::command]
pub async fn get_song_comment_count(song_id: i64) -> Result<i64, String> {
    let page: serde_json::Value = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?
        .get(format!("{BASE}/api/v1/resource/comments/R_SO_4_{song_id}"))
        .header("Referer", BASE)
        .query(&[("limit", "1"), ("offset", "0")])
        .send()
        .await
        .map_err(|e| format!("评论数量请求失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("评论数量请求失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("解析评论数量失败: {e}"))?;
    if page["code"].as_i64() != Some(200) {
        return Err("评论数量暂不可用".into());
    }
    page["total"]
        .as_i64()
        .filter(|count| *count >= 0)
        .ok_or_else(|| "评论数量暂不可用".into())
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


#[derive(Debug, Serialize)]
pub struct Lyrics {
    lrc: String,
    yrc: String,
    translation: String,
    #[serde(rename = "yrcTranslation")]
    yrc_translation: String,
    romanization: String,
}

fn lyric_params(song_id: i64) -> String {
    use ecb::cipher::{BlockEncryptMut, KeyInit, block_padding::Pkcs7};
    use md5::{Digest, Md5};
    let path = "/api/song/lyric/v1";
    let payload = serde_json::json!({"id": song_id.to_string(), "cp":"false", "lv":"0", "kv":"0", "tv":"0", "rv":"0", "yv":"0", "ytv":"0", "yrv":"0", "csrf_token":""}).to_string();
    let digest = format!(
        "{:x}",
        Md5::digest(format!("nobody{path}use{payload}md5forencrypt"))
    );
    let plain = format!("{path}-36cd479b6b5-{payload}-36cd479b6b5-{digest}");
    let encrypted = ecb::Encryptor::<aes::Aes128>::new(b"e82ckenh8dichen8".into())
        .encrypt_padded_vec_mut::<Pkcs7>(plain.as_bytes());
    encrypted.iter().map(|byte| format!("{byte:02X}")).collect()
}

#[tauri::command]
pub async fn fetch_lyrics(song_id: i64) -> Result<Lyrics, String> {
    if song_id <= 0 {
        return Err("无效歌曲 ID".into());
    }
    let page: serde_json::Value = reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?
        .post("https://interface3.music.163.com/eapi/song/lyric/v1")
        .form(&[("params", lyric_params(song_id))])
        .send()
        .await
        .map_err(|e| format!("歌词请求失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("歌词请求失败: {e}"))?
        .json()
        .await
        .map_err(|e| format!("解析歌词失败: {e}"))?;
    if page["code"].as_i64() != Some(200) {
        return Err(format!("歌词接口返回错误: {}", page["code"]));
    }
    let lyric = |key: &str| page[key]["lyric"].as_str().unwrap_or_default().to_owned();
    Ok(Lyrics {
        lrc: lyric("lrc"),
        yrc: lyric("yrc"),
        translation: lyric("tlyric"),
        yrc_translation: lyric("ytlrc"),
        romanization: lyric("romalrc"),
    })
}
