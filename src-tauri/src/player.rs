use crate::ncm::{self, Comment, SongMatch};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_media::{MediaExt, NowPlaying};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub font_size: f32,
    pub opacity: f32,
    pub comment_limit: Option<u32>,
    pub comment_refresh_percent: u32,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            font_size: 16.,
            opacity: 0.8,
            comment_limit: None,
            comment_refresh_percent: 10,
        }
    }
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct Preferences {
    settings: Settings,
    matches: HashMap<String, SongMatch>,
    merged_matches: HashMap<String, Vec<SongMatch>>,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    permission_granted: bool,
    sampled_at: u64,
    now_playing: Option<NowPlaying>,
    song: Option<SongMatch>,
    songs: Vec<SongMatch>,
    comments: Vec<Comment>,
    loading: bool,
    error: Option<String>,
    revision: u64,
    settings: Settings,
    manual_match: bool,
}
struct Inner {
    snapshot: Snapshot,
    prefs: Preferences,
    generation: u64,
    key: String,
    file: PathBuf,
}
#[derive(Clone)]
pub struct Player(Arc<Mutex<Inner>>);
pub fn track_key(np: &NowPlaying) -> String {
    format!("{}|{}|{}", np.title, np.artist, np.album)
}

// Only resend the large comment array when its revision changes.
fn snapshot_payload(snapshot: &Snapshot, since_revision: Option<u64>) -> serde_json::Value {
    if since_revision != Some(snapshot.revision) {
        return serde_json::to_value(snapshot).unwrap();
    }
    serde_json::json!({
        "permissionGranted": snapshot.permission_granted,
        "sampledAt": snapshot.sampled_at,
        "nowPlaying": snapshot.now_playing,
        "song": snapshot.song,
        "songs": snapshot.songs,
        "loading": snapshot.loading,
        "error": snapshot.error,
        "revision": snapshot.revision,
        "settings": snapshot.settings,
        "manualMatch": snapshot.manual_match,
    })
}

#[tauri::command]
pub fn get_player_state(state: State<Player>, since_revision: Option<u64>) -> serde_json::Value {
    snapshot_payload(&state.0.lock().unwrap().snapshot, since_revision)
}

fn persist(inner: &Inner) -> Result<(), String> {
    if let Some(dir) = inner.file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = inner.file.with_extension("tmp");
    std::fs::write(
        &tmp,
        serde_json::to_vec(&inner.prefs).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, &inner.file).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn update_settings(state: State<Player>, mut settings: Settings) -> Result<(), String> {
    if ![settings.font_size, settings.opacity]
        .iter()
        .all(|n| n.is_finite())
    {
        return Err("设置必须是有效数字".into());
    }
    settings.font_size = settings.font_size.clamp(12., 32.);
    settings.opacity = settings.opacity.clamp(0.2, 0.8);
    settings.comment_refresh_percent = settings.comment_refresh_percent.clamp(1, 100);
    let mut inner = state.0.lock().unwrap();
    settings.comment_limit = settings.comment_limit.filter(|limit| *limit > 0);
    let redisplay = inner.prefs.settings.comment_limit != settings.comment_limit;
    inner.prefs.settings = settings.clone();
    inner.snapshot.settings = settings;
    persist(&inner)?;
    if redisplay { inner.snapshot.revision += 1; }
    Ok(())
}
#[tauri::command]
pub fn set_song_match(
    state: State<Player>,
    key: String,
    song: Option<SongMatch>,
) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    inner.prefs.merged_matches.remove(&key);
    if let Some(song) = song {
        inner.prefs.matches.insert(key.clone(), song);
    } else {
        inner.prefs.matches.remove(&key);
    }
    persist(&inner)?;
    if inner.key == key {
        inner.generation += 1;
        inner.key.clear();
    }
    Ok(())
}
#[tauri::command]
pub fn set_song_matches(state: State<Player>, key: String, songs: Vec<SongMatch>) -> Result<(), String> {
    let mut seen = HashSet::new();
    let songs: Vec<_> = songs.into_iter().filter(|song| seen.insert(song.song_id)).collect();
    if songs.is_empty() || songs.len() > 30 {
        return Err("请选择 1 至 30 首歌曲".into());
    }
    let mut inner = state.0.lock().unwrap();
    inner.prefs.matches.insert(key.clone(), songs[0].clone());
    inner.prefs.merged_matches.insert(key.clone(), songs);
    persist(&inner)?;
    if inner.key == key { inner.generation += 1; inner.key.clear(); }
    Ok(())
}

type CommentProgress = Arc<dyn Fn(i64, Vec<Comment>) + Send + Sync>;

#[derive(Serialize, Deserialize)]
struct CachedComments {
    total: Option<i64>,
    comments: Vec<Comment>,
}

fn growth_reached(baseline: i64, current: i64, percent: u32) -> bool {
    current > baseline && (current as i128 - baseline as i128) * 100 >= baseline.max(1) as i128 * percent.max(1) as i128
}

fn cache_needs_refresh(baseline: Option<i64>, current: Option<i64>, percent: u32) -> bool {
    match (baseline, current) {
        (Some(baseline), Some(current)) => growth_reached(baseline, current, percent),
        (None, Some(_)) => true,
        // A failed count check must not discard a usable cache or trigger a full download.
        (_, None) => false,
    }
}

async fn fetch_merged_comments(
    songs: Vec<SongMatch>, progress: CommentProgress,
    cache_dir: PathBuf, percent: u32,
) -> Result<(), String> {
    // JoinSet aborts its children if a track change cancels this fetch.
    for batch in songs.chunks(4) {
        let mut tasks = tokio::task::JoinSet::new();
        for song in batch.iter().cloned() {
            let progress = progress.clone();
            let path = cache_dir.join(format!("{}-all.json", song.song_id));
            tasks.spawn(async move {
                let id = song.song_id;
                let read_path = path.clone();
                let cached = tauri::async_runtime::spawn_blocking(move || {
                    std::fs::read(read_path).ok().and_then(|bytes| serde_json::from_slice::<CachedComments>(&bytes).ok())
                }).await.map_err(|e| e.to_string())?;
                // Read the API total, never the locally capped or grouped comment count.
                let total = ncm::get_song_comment_count(id).await.ok();
                let previous = if let Some(cached) = cached {
                    progress(id, cached.comments.clone());
                    if !cache_needs_refresh(cached.total, total, percent) { return Ok(()); }
                    cached.comments
                } else { Vec::new() };
                let update = progress.clone();
                let result = ncm::fetch_song_comments_progress(song.clone(), None, move |mut comments| {
                    // Keep old comments visible while newer pages arrive; IDs count only once.
                    let ids: HashSet<_> = comments.iter().map(|comment| comment.comment_id).collect();
                    comments.extend(previous.iter().filter(|comment| !ids.contains(&comment.comment_id)).cloned());
                    comments.sort_by(|a, b| b.liked_count.cmp(&a.liked_count));
                    update(id, comments);
                }).await.map_err(|e| format!("{}：{e}", song.name))?;
                progress(id, result.comments.clone());
                // Atomic writes preserve the previous successful baseline on failed fetches.
                tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
                    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
                    let temporary = path.with_extension("tmp");
                    let bytes = serde_json::to_vec(&CachedComments { total, comments: result.comments }).map_err(|e| e.to_string())?;
                    std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
                    std::fs::rename(temporary, path).map_err(|e| e.to_string())
                }).await.map_err(|e| e.to_string())??;
                Ok::<(), String>(())
            });
        }
        while let Some(result) = tasks.join_next().await { result.map_err(|e| e.to_string())??; }
    }
    Ok(())
}

#[tauri::command]
pub fn retry_match(state: State<Player>) {
    state.0.lock().unwrap().key.clear();
}

pub fn start(app: AppHandle) -> Result<(), String> {
    let file = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("preferences.json");
    let prefs: Preferences = std::fs::read(&file)
        .ok()
        .and_then(|v| serde_json::from_slice(&v).ok())
        .unwrap_or_default();
    let snapshot = Snapshot {
        settings: prefs.settings.clone(),
        ..Default::default()
    };
    let player = Player(Arc::new(Mutex::new(Inner {
        snapshot,
        prefs,
        file,
        generation: 0,
        key: String::new(),
    })));
    app.manage(player.clone());
    tauri::async_runtime::spawn(async move {
        let mut overlay_revision = None;
        let mut active_fetch: Option<tauri::async_runtime::JoinHandle<()>> = None;
        loop {
            let handle = app.clone();
            let response =
                tauri::async_runtime::spawn_blocking(move || handle.media().get_now_playing())
                    .await;
            let mut request = None;
            {
                let mut inner = player.0.lock().unwrap();
                match response {
                    Ok(Ok(r)) => {
                        inner.snapshot.sampled_at = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;
                        inner.snapshot.permission_granted = r.permission_granted;
                        let np = r
                            .now_playing
                            .filter(|n| !n.title.is_empty() || !n.artist.is_empty());
                        let key = np.as_ref().map(track_key).unwrap_or_default();
                        if key != inner.key
                            || (np.is_none() && inner.snapshot.now_playing.is_some())
                        {
                            if let Some(task) = active_fetch.take() { task.abort(); }
                            inner.generation += 1;
                            inner.key = key.clone();
                            inner.snapshot.song = None;
                            inner.snapshot.songs.clear();
                            inner.snapshot.comments.clear();
                            inner.snapshot.error = None;
                            inner.snapshot.revision += 1;
                            inner.snapshot.loading = np.is_some();
                            inner.snapshot.manual_match = inner.prefs.matches.contains_key(&key);
                            if let Some(ref np) = np {
                                request = Some((
                                    inner.generation,
                                    np.clone(),
                                    inner.prefs.merged_matches.get(&key).cloned().or_else(|| inner.prefs.matches.get(&key).cloned().map(|song| vec![song])),
                                ));
                            }
                        }
                        if let Some(error) = r.error {
                            inner.snapshot.error = Some(error);
                        }
                        inner.snapshot.now_playing = np;
                    }
                    Ok(Err(e)) => {
                        inner.snapshot.error = Some(e.to_string());
                        inner.snapshot.permission_granted = false;
                    }
                    Err(e) => {
                        inner.snapshot.error = Some(e.to_string());
                    }
                }
            }
            if let Some((generation, np, manual)) = request {
                let shared = player.clone();
                active_fetch = Some(tauri::async_runtime::spawn(async move {
                    let songs = if let Some(songs) = manual {
                        Ok(songs)
                    } else {
                        ncm::match_song(np.title, np.artist, Some(np.album), Some(np.duration)).await.map(|song| vec![song])
                    };
                    let (songs, cache_dir) = {
                        let mut inner = shared.0.lock().unwrap();
                        if inner.generation != generation { return; }
                        match songs {
                            Ok(songs) => {
                                inner.snapshot.song = songs.first().cloned();
                                inner.snapshot.songs = songs.clone();
                                (songs, inner.file.with_file_name("comments"))
                            }
                            Err(error) => { inner.snapshot.loading = false; inner.snapshot.error = Some(error); return; }
                        }
                    };
                    let batches = Arc::new(Mutex::new(HashMap::<i64, Vec<Comment>>::new()));
                    let progress_player = shared.clone();
                    let progress: CommentProgress = Arc::new(move |id, comments| {
                        let merged = {
                            let mut batches = batches.lock().unwrap();
                            batches.insert(id, comments);
                            ncm::group_comments(batches.values().flatten().cloned().collect())
                        };
                        let mut inner = progress_player.0.lock().unwrap();
                        if inner.generation != generation { return; }
                        inner.snapshot.comments = merged;
                        inner.snapshot.loading = true;
                        inner.snapshot.revision += 1;
                    });
                    // Check growth once when this track is opened, then keep its comments
                    // until another track (or a new matching selection) is opened.
                    let percent = {
                        let inner = shared.0.lock().unwrap();
                        if inner.generation != generation { return; }
                        inner.prefs.settings.comment_refresh_percent
                    };
                    let result = fetch_merged_comments(songs, progress, cache_dir, percent).await;
                    let mut inner = shared.0.lock().unwrap();
                    if inner.generation != generation { return; }
                    inner.snapshot.loading = false;
                    inner.snapshot.error = result.err().map(|e| format!("评论更新失败，已保留已加载评论：{e}"));
                }));
            }
            let frame = {
                let inner = player.0.lock().unwrap();
                let frame = snapshot_payload(&inner.snapshot, overlay_revision);
                overlay_revision = Some(inner.snapshot.revision);
                frame
            };
            let handle = app.clone();
            let _ =
                tauri::async_runtime::spawn_blocking(move || handle.media().update_overlay(frame))
                    .await;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refresh_threshold_uses_successful_baseline_and_accumulates_growth() {
        assert!(!growth_reached(1000, 1099, 10));
        assert!(growth_reached(1000, 1100, 10));
        assert!(growth_reached(1000, 1200, 10));
        assert!(!growth_reached(1000, 1000, 10));
        assert!(!growth_reached(1000, 900, 10));
        assert!(!growth_reached(0, 0, 10));
        assert!(growth_reached(0, 1, 10));
        assert!(!growth_reached(11, 12, 10));
        assert!(growth_reached(11, 13, 10));
        assert!(growth_reached(1000, 1050, 5));
        assert!(!cache_needs_refresh(Some(1000), None, 10));
        assert!(cache_needs_refresh(None, Some(1000), 10));
    }

    #[test]
    fn refresh_setting_and_api_total_are_persisted_independently_of_local_cap() {
        let old: Settings = serde_json::from_value(serde_json::json!({"fontSize": 16})).unwrap();
        assert_eq!(old.comment_refresh_percent, 10);
        let saved = serde_json::to_value(Settings { comment_refresh_percent: 20, ..Default::default() }).unwrap();
        assert_eq!(saved["commentRefreshPercent"], 20);
        let cache = CachedComments { total: Some(50_000), comments: vec![] };
        let restored: CachedComments = serde_json::from_slice(&serde_json::to_vec(&cache).unwrap()).unwrap();
        assert_eq!(restored.total, Some(50_000));
        assert!(!cache_needs_refresh(restored.total, Some(54_999), 10));
        assert!(cache_needs_refresh(restored.total, Some(55_000), 10));
    }

    #[test]
    fn incremental_payload_omits_unchanged_comments_but_sends_empty_on_track_change() {
        let snapshot = Snapshot { revision: 5, ..Default::default() };
        assert!(snapshot_payload(&snapshot, None)["comments"].is_array());
        assert!(snapshot_payload(&snapshot, Some(4))["comments"].is_array());
        assert!(snapshot_payload(&snapshot, Some(5)).get("comments").is_none());
        assert_eq!(snapshot_payload(&snapshot, Some(5))["revision"], 5);
    }

    #[test]
    fn old_settings_default_to_unlimited_and_limits_survive_round_trip() {
        let old: Settings = serde_json::from_value(serde_json::json!({"fontSize": 20, "density": 8})).unwrap();
        assert_eq!(old.comment_limit, None);
        let mut settings = Settings::default();
        assert_eq!(settings.comment_limit, None);
        settings.comment_limit = Some(50_000);
        let saved = serde_json::to_value(&settings).unwrap();
        assert_eq!(saved["commentLimit"], 50_000);
        assert_eq!(serde_json::from_value::<Settings>(saved).unwrap().comment_limit, Some(50_000));
    }

    #[test]
    fn old_single_matches_remain_readable() {
        let prefs: Preferences = serde_json::from_value(serde_json::json!({
            "matches": {"track": {"songId": 1, "name": "歌", "artists": "歌手", "album": "专辑", "duration": 180000}}
        })).unwrap();
        assert_eq!(prefs.matches["track"].song_id, 1);
        assert!(prefs.merged_matches.is_empty());
    }
    #[test]
    fn merged_matches_survive_preferences_round_trip() {
        let mut prefs = Preferences::default();
        let song: SongMatch = serde_json::from_value(serde_json::json!({"songId": 1, "name": "歌", "artists": "歌手", "album": "专辑", "duration": 180000})).unwrap();
        let mut other = song.clone(); other.song_id = 2;
        prefs.merged_matches.insert("track".into(), vec![song, other]);
        let loaded: Preferences = serde_json::from_slice(&serde_json::to_vec(&prefs).unwrap()).unwrap();
        assert_eq!(loaded.merged_matches["track"].len(), 2);
    }
}
