use serde::de::DeserializeOwned;
use tauri::{
    AppHandle, Runtime,
    plugin::{PluginApi, PluginHandle},
};

use crate::models::*;

// initializes the Kotlin plugin class
pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<Media<R>> {
    #[cfg(target_os = "android")]
    let handle = api.register_android_plugin("com.musicdan.media", "MediaPlugin")?;
    Ok(Media(handle))
}

/// Access to the media APIs.
pub struct Media<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Media<R> {
    pub fn set_keep_screen_on(&self, enabled: bool) -> crate::Result<()> {
        self.0.run_mobile_plugin::<EmptyResponse>("setKeepScreenOn", serde_json::json!({"enabled": enabled}))
            .map(|_| ()).map_err(Into::into)
    }

    pub fn haptic_feedback(&self, kind: HapticKind) -> crate::Result<()> {
        self.0.run_mobile_plugin::<EmptyResponse>("hapticFeedback", serde_json::json!({"kind": kind}))
            .map(|_| ()).map_err(Into::into)
    }

    pub fn control_playback(&self, control: PlaybackControl) -> crate::Result<()> {
        self.0.run_mobile_plugin::<EmptyResponse>("controlPlayback", control)
            .map(|_| ()).map_err(Into::into)
    }

    pub fn overlay_status(&self) -> crate::Result<serde_json::Value> {
        self.0
            .run_mobile_plugin("overlayStatus", ())
            .map_err(Into::into)
    }
    pub fn open_overlay_settings(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<EmptyResponse>("openOverlaySettings", ())
            .map(|_| ())
            .map_err(Into::into)
    }
    pub fn set_overlay(&self, enabled: bool) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<EmptyResponse>(
                "setOverlay",
                serde_json::json!({"enabled": enabled}),
            )
            .map(|_| ())
            .map_err(Into::into)
    }
    pub fn update_overlay(&self, frame: serde_json::Value) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<EmptyResponse>("updateOverlay", frame)
            .map(|_| ())
            .map_err(Into::into)
    }
    pub fn get_now_playing(&self) -> crate::Result<GetNowPlayingResponse> {
        self.0
            .run_mobile_plugin("getNowPlaying", ())
            .map_err(Into::into)
    }

    pub fn is_permission_granted(&self) -> crate::Result<PermissionResponse> {
        self.0
            .run_mobile_plugin("isPermissionGranted", ())
            .map_err(Into::into)
    }

    pub fn open_permission_settings(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<EmptyResponse>("openPermissionSettings", ())
            .map(|_| ())
            .map_err(Into::into)
    }

    pub fn open_url(&self, url: &str) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<EmptyResponse>("openUrl", serde_json::json!({ "url": url }))
            .map(|_| ())
            .map_err(Into::into)
    }

    pub fn install_permission(&self) -> crate::Result<InstallPermissionResponse> {
        self.0.run_mobile_plugin("installPermission", ()).map_err(Into::into)
    }

    pub fn open_install_permission_settings(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<EmptyResponse>("openInstallPermissionSettings", ())
            .map(|_| ())
            .map_err(Into::into)
    }

    /// 把已通过 SHA-256 校验的安装包交给系统安装器（仅 Android）
    pub fn install_apk(&self, path: &str) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<EmptyResponse>("installApk", serde_json::json!({ "path": path }))
            .map(|_| ())
            .map_err(Into::into)
    }
}
