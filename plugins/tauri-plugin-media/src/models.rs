use serde::{Deserialize, Serialize};

/// 当前正在播放的歌曲信息（字段与 Kotlin 侧 JSObject 一一对应，均为 camelCase）
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    pub album: String,
    /// 歌曲总时长（毫秒）
    pub duration: i64,
    /// 锚定的播放位置（毫秒），结合 playback_speed 与 last_position_update_time 可插值
    pub position: i64,
    pub playback_speed: f64,
    /// 上次进度锚定的系统时间（SystemClock.elapsedRealtime，毫秒）
    pub last_position_update_time: i64,
    pub is_playing: bool,
    /// 播放来源应用的包名（如 com.netease.cloudmusic）
    pub package_name: String,
}

/// getNowPlaying 的返回
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetNowPlayingResponse {
    pub permission_granted: bool,
    pub now_playing: Option<NowPlaying>,
    pub error: Option<String>,
}

/// isPermissionGranted 的返回
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionResponse {
    pub granted: bool,
}

/// openPermissionSettings 的返回（Kotlin 侧 resolve 空对象 `{}`）
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmptyResponse {}
