use serde::de::DeserializeOwned;
use tauri::{AppHandle, Runtime, plugin::PluginApi};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<Media<R>> {
    Ok(Media(app.clone()))
}

/// Access to the media APIs (desktop stubs).
pub struct Media<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Media<R> {
    pub fn set_keep_screen_on(&self, _enabled: bool) -> crate::Result<()> {
        Ok(())
    }

    pub fn haptic_feedback(&self, _kind: HapticKind) -> crate::Result<()> {
        Ok(())
    }

    pub fn control_playback(&self, _control: PlaybackControl) -> crate::Result<()> {
        Err(crate::Error::Plugin("播放控制仅支持 Android".into()))
    }

    pub fn overlay_status(&self) -> crate::Result<serde_json::Value> {
        Ok(serde_json::json!({"granted":false,"running":false,"supported":false}))
    }
    pub fn open_overlay_settings(&self) -> crate::Result<()> {
        Err(crate::Error::Plugin("仅支持 Android".into()))
    }
    pub fn set_overlay(&self, _enabled: bool) -> crate::Result<()> {
        Err(crate::Error::Plugin("仅支持 Android".into()))
    }
    pub fn update_overlay(&self, _frame: serde_json::Value) -> crate::Result<()> {
        Ok(())
    }
    pub fn get_now_playing(&self) -> crate::Result<GetNowPlayingResponse> {
        Err(crate::Error::Plugin("media 插件仅支持 Android 平台".into()))
    }

    pub fn is_permission_granted(&self) -> crate::Result<PermissionResponse> {
        Err(crate::Error::Plugin("media 插件仅支持 Android 平台".into()))
    }

    pub fn open_permission_settings(&self) -> crate::Result<()> {
        Err(crate::Error::Plugin("media 插件仅支持 Android 平台".into()))
    }
}
