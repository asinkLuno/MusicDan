use tauri::{AppHandle, Runtime, command};

use crate::MediaExt;
use crate::Result;
use crate::models::*;

#[command]
pub(crate) async fn set_keep_screen_on<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<()> {
    app.media().set_keep_screen_on(enabled)
}

#[command]
pub(crate) async fn get_now_playing<R: Runtime>(
    app: AppHandle<R>,
) -> Result<GetNowPlayingResponse> {
    app.media().get_now_playing()
}

#[command]
pub(crate) async fn is_permission_granted<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PermissionResponse> {
    app.media().is_permission_granted()
}

#[command]
pub(crate) async fn open_permission_settings<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.media().open_permission_settings()
}

#[command]
pub(crate) async fn overlay_status<R: Runtime>(app: AppHandle<R>) -> Result<serde_json::Value> {
    app.media().overlay_status()
}
#[command]
pub(crate) async fn open_overlay_settings<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.media().open_overlay_settings()
}
#[command]
pub(crate) async fn set_overlay<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<()> {
    app.media().set_overlay(enabled)
}

#[command]
pub(crate) async fn control_playback<R: Runtime>(app: AppHandle<R>, control: PlaybackControl) -> Result<()> {
    app.media().control_playback(control)
}

#[command]
pub(crate) async fn haptic_feedback<R: Runtime>(app: AppHandle<R>, kind: HapticKind) -> Result<()> {
    app.media().haptic_feedback(kind)
}
