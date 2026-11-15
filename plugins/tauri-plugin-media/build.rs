const COMMANDS: &[&str] = &[
    "set_keep_screen_on",
    "haptic_feedback",
    "control_playback",
    "overlay_status",
    "open_overlay_settings",
    "set_overlay",
    "get_now_playing",
    "is_permission_granted",
    "open_permission_settings",
    "open_url",
    "install_permission",
    "open_install_permission_settings",
    "install_apk",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
