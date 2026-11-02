use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri_plugin_opener::OpenerExt;

const RELEASES: &str = "https://api.github.com/repos/asinkLuno/MusicDan/releases/latest";
const DOWNLOAD_PAGE: &str = "https://github.com/asinkLuno/MusicDan/releases/latest";

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    assets: Vec<Asset>,
}

#[derive(Deserialize)]
struct Asset {
    name: String,
    state: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    current_build: u64,
    latest_build: Option<u64>,
    available: bool,
}

fn build_number(tag: &str) -> Option<u64> {
    tag.strip_prefix("build-")?.parse().ok()
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateStatus, String> {
    let current_build = env!("MUSICDAN_BUILD_NUMBER").parse().unwrap_or(0);
    let client = reqwest::Client::builder()
        .user_agent("MusicDan")
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(RELEASES)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("检查更新失败：{e}"))?;
    let latest_build = if response.status() == reqwest::StatusCode::NOT_FOUND {
        None
    } else {
        let release = response
            .error_for_status()
            .map_err(|e| format!("检查更新失败：{e}"))?
            .json::<Release>()
            .await
            .map_err(|e| format!("读取更新信息失败：{e}"))?;
        // An incomplete release must never prompt users to download it.
        if release
            .assets
            .iter()
            .any(|asset| asset.state == "uploaded" && asset.name.ends_with(".apk"))
        {
            build_number(&release.tag_name)
        } else {
            None
        }
    };
    Ok(UpdateStatus {
        current_build,
        latest_build,
        available: latest_build.is_some_and(|n| n > current_build),
    })
}

#[tauri::command]
pub fn open_update_download(app: tauri::AppHandle) -> Result<(), String> {
    app.opener()
        .open_url(DOWNLOAD_PAGE, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_ci_build_tags_are_compared() {
        assert_eq!(build_number("build-123"), Some(123));
        assert_eq!(build_number("v0.3.0"), None);
        assert_eq!(build_number("build-invalid"), None);
        assert_eq!(build_number("build-"), None);
    }
}
