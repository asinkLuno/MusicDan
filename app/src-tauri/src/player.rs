use crate::ncm::{self, Comment, SongMatch};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_media::{MediaExt, NowPlaying};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub font_size: f32,
    pub cross_seconds: f32,
    pub opacity: f32,
    pub density: u32,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            font_size: 16.,
            cross_seconds: 9.,
            opacity: 0.8,
            density: 6,
        }
    }
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct Preferences {
    settings: Settings,
    matches: HashMap<String, SongMatch>,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    permission_granted: bool,
    sampled_at: u64,
    now_playing: Option<NowPlaying>,
    song: Option<SongMatch>,
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

#[tauri::command]
pub fn get_player_state(state: State<Player>) -> Snapshot {
    state.0.lock().unwrap().snapshot.clone()
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
    if ![settings.font_size, settings.cross_seconds, settings.opacity]
        .iter()
        .all(|n| n.is_finite())
    {
        return Err("设置必须是有效数字".into());
    }
    settings.font_size = settings.font_size.clamp(12., 32.);
    settings.cross_seconds = settings.cross_seconds.clamp(4., 20.);
    settings.opacity = settings.opacity.clamp(0.2, 0.8);
    settings.density = settings.density.clamp(2, 12);
    let mut inner = state.0.lock().unwrap();
    inner.prefs.settings = settings.clone();
    inner.snapshot.settings = settings;
    persist(&inner)
}
#[tauri::command]
pub fn set_song_match(
    state: State<Player>,
    key: String,
    song: Option<SongMatch>,
) -> Result<(), String> {
    let mut inner = state.0.lock().unwrap();
    if let Some(song) = song {
        inner.prefs.matches.insert(key.clone(), song);
    } else {
        inner.prefs.matches.remove(&key);
    }
    persist(&inner)?;
    if inner.key == key {
        inner.key.clear();
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
                            inner.generation += 1;
                            inner.key = key.clone();
                            inner.snapshot.song = None;
                            inner.snapshot.comments.clear();
                            inner.snapshot.error = None;
                            inner.snapshot.revision += 1;
                            inner.snapshot.loading = np.is_some();
                            inner.snapshot.manual_match = inner.prefs.matches.contains_key(&key);
                            if let Some(ref np) = np {
                                request = Some((
                                    inner.generation,
                                    np.clone(),
                                    inner.prefs.matches.get(&key).cloned(),
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
                tauri::async_runtime::spawn(async move {
                    let result = if let Some(song) = manual {
                        ncm::fetch_song_comments(song, Some(500)).await
                    } else {
                        ncm::fetch_comments(
                            np.title,
                            np.artist,
                            Some(np.album),
                            Some(np.duration),
                            Some(500),
                        )
                        .await
                    };
                    let mut inner = shared.0.lock().unwrap();
                    if inner.generation == generation {
                        inner.snapshot.loading = false;
                        inner.snapshot.revision += 1;
                        match result {
                            Ok(r) => {
                                inner.snapshot.song = Some(r.song);
                                inner.snapshot.comments = r.comments;
                                inner.snapshot.error = None;
                            }
                            Err(e) => {
                                inner.snapshot.error = Some(e);
                            }
                        }
                    }
                });
            }
            let frame = { serde_json::to_value(&player.0.lock().unwrap().snapshot).unwrap() };
            let handle = app.clone();
            let _ =
                tauri::async_runtime::spawn_blocking(move || handle.media().update_overlay(frame))
                    .await;
            tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        }
    });
    Ok(())
}
