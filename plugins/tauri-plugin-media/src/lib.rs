use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::Media;
#[cfg(mobile)]
use mobile::Media;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the media APIs.
pub trait MediaExt<R: Runtime> {
    fn media(&self) -> &Media<R>;
}

impl<R: Runtime, T: Manager<R>> crate::MediaExt<R> for T {
    fn media(&self) -> &Media<R> {
        self.state::<Media<R>>().inner()
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("media")
        .invoke_handler(tauri::generate_handler![
            commands::set_keep_screen_on,
            commands::haptic_feedback,
            commands::control_playback,
            commands::overlay_status,
            commands::open_overlay_settings,
            commands::set_overlay,
            commands::get_now_playing,
            commands::is_permission_granted,
            commands::open_permission_settings
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let media = mobile::init(app, api)?;
            #[cfg(desktop)]
            let media = desktop::init(app, api)?;
            app.manage(media);
            Ok(())
        })
        .build()
}
