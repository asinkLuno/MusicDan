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

// reqwest 的 Display 只包含请求地址，保留 source 链才能区分 DNS、TLS 和连接错误。
fn request_error(error: &reqwest::Error) -> String {
    use std::error::Error;
    let mut details = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        details.push_str(": ");
        details.push_str(&cause.to_string());
        source = cause.source();
    }
    let hint = if error.is_timeout() {
        "请求超时，请检查网络后重试"
    } else if error.is_connect() {
        "连接官网失败，请检查网络、代理及设备时间"
    } else {
        "无法获取官网更新信息"
    };
    format!("{hint}：{details}")
}

/// 官网发布记录同时用于检查更新和显示版本说明，无需 GitHub API。
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateStatus, String> {
    let current_version = app.package_info().version.to_string();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("MusicDan-Update-Check")
        .build()
        .map_err(|error| format!("无法发起更新检查：{error}"))?;
    let releases: Vec<WebsiteRelease> = client.get(RELEASES_URL)
        .header("Cache-Control", "no-cache")
        .send().await
        .and_then(|response| response.error_for_status())
        .map_err(|error| request_error(&error))?
        .json().await
        .map_err(|error| format!("更新信息解析失败：{error}"))?;
    Ok(build_status(&current_version, &releases))
}
