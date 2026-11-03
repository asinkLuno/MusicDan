use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::AppHandle;

const WEBSITE: &str = "https://musicdan.syncmoon.ink";
const RELEASES_URL: &str = "https://musicdan.syncmoon.ink/releases.json";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub version: String,
    pub page_url: String,
    pub apk_url: Option<String>,
    pub notes: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub latest: Option<ReleaseInfo>,
    pub current_release: Option<ReleaseInfo>,
}

#[derive(Debug, Deserialize)]
struct WebsiteRelease {
    version: String,
    download_url: String,
    #[serde(default)]
    notes: String,
}

fn release_info(release: &WebsiteRelease) -> Option<ReleaseInfo> {
    // Only open APKs served by the official website, including historical build paths.
    let relative = release.download_url.strip_prefix("/releases/")?;
    if !relative.ends_with(".apk")
        || relative.contains("..")
        || relative.chars().any(|c| !c.is_ascii_alphanumeric() && !"/_-.".contains(c))
    {
        return None;
    }
    Some(ReleaseInfo {
        version: release.version.clone(),
        page_url: format!("{WEBSITE}/#download"),
        apk_url: Some(format!("{WEBSITE}{}", release.download_url)),
        notes: release.notes.clone(),
    })
}

fn build_status(current_version: &str, releases: &[WebsiteRelease]) -> UpdateStatus {
    UpdateStatus {
        current_version: current_version.to_string(),
        latest: releases.iter().find_map(release_info),
        current_release: releases.iter()
            .find(|release| release.version == current_version)
            .and_then(release_info),
    }
}

/// 官网发布记录同时用于检查更新和显示版本说明，无需 GitHub API。
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateStatus, String> {
    let current_version = app.package_info().version.to_string();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("MusicDan-Update-Check")
        .build()
        .map_err(|error| format!("无法发起更新检查：{error}"))?;
    let releases: Vec<WebsiteRelease> = client.get(RELEASES_URL)
        .header("Cache-Control", "no-cache")
        .send().await
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("无法连接更新服务：{error}"))?
        .json().await
        .map_err(|error| format!("更新信息解析失败：{error}"))?;
    Ok(build_status(&current_version, &releases))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_latest_and_installed_version_from_website() {
        let releases: Vec<WebsiteRelease> = serde_json::from_str(r###"[
            {"version":"0.5.1","download_url":"/releases/latest.apk","notes":"本次更新"},
            {"version":"0.5.0","download_url":"/releases/build-18/MusicDan_0.5.0_arm64.apk"}
        ]"###).unwrap();
        let status = build_status("0.5.0", &releases);
        let latest = status.latest.unwrap();
        assert_eq!(latest.version, "0.5.1");
        assert_eq!(latest.apk_url.as_deref(), Some("https://musicdan.syncmoon.ink/releases/latest.apk"));
        assert_eq!(latest.notes, "本次更新");
        let current = status.current_release.unwrap();
        assert_eq!(current.version, "0.5.0");
        assert_eq!(current.notes, "");
        assert!(current.apk_url.unwrap().contains("/build-18/"));
        assert!(build_status("0.1.0", &releases).current_release.is_none());
    }

    #[test]
    fn ignores_downloads_outside_the_official_release_directory() {
        for url in ["https://example.com/app.apk", "//example.com/app.apk", "/releases/../app.apk", "/releases/a.apk?redirect=evil"] {
            let release = WebsiteRelease { version: "0.5.1".into(), download_url: url.into(), notes: String::new() };
            assert!(release_info(&release).is_none());
        }
        assert!(build_status("0.5.0", &[]).latest.is_none());
    }
}
