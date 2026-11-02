const COMMANDS: &[&str] = &[
    "control_playback",
    "overlay_status",
    "open_overlay_settings",
    "set_overlay",
    "get_now_playing",
    "is_permission_granted",
    "open_permission_settings",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
