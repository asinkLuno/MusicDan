mod ncm;
mod player;
mod updates;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_media::init())
        .setup(|app| {
            player::start(app.handle().clone()).map_err(std::io::Error::other)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            updates::check_for_updates,
            updates::open_update_download,
            ncm::fetch_comments,
            ncm::fetch_lyrics,
            ncm::search_songs,
            ncm::get_song_comment_count,
            ncm::fetch_song_comments,
            player::get_player_state,
            player::update_settings,
            player::set_song_match,
            player::set_song_matches,
            player::retry_match
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
