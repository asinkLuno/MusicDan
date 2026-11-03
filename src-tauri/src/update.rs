use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::AppHandle;

const RELEASES_URL: &str = "https://api.github.com/repos/asinkLuno/MusicDan/releases?per_page=30";
const DOWNLOAD_PAGE: &str = "https://musicdan.syncmoon.ink/";

/// 设置页“版本与更新”展示的单个版本信息
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub version: String,
    pub page_url: String,
    pub apk_url: Option<String>,
    pub notes: String,
}

/// check_update 的返回：已安装版本 + 最新版本 + 与当前安装版本相同的 Release
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub latest: Option<ReleaseInfo>,
    pub current_release: Option<ReleaseInfo>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    html_url: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    assets: Vec<GithubAsset>,
}

/// 从 “MusicDan v0.4.3”、“MusicDan_0.4.3_arm64.apk” 等文本中提取 “0.4.3” 形式的版本号
fn extract_version(text: &str) -> Option<String> {
    for candidate in text.split(|c: char| !c.is_ascii_digit() && c != '.') {
        let parts: Vec<&str> = candidate
            .split('.')
            .filter(|part| !part.is_empty())
            .collect();
        if parts.len() >= 3
            && parts
                .iter()
                .all(|part| part.chars().all(|c| c.is_ascii_digit()))
        {
            return Some(parts.join("."));
        }
    }
    None
}

fn release_matches(release: &GithubRelease, version: &str) -> bool {
    extract_version(release.name.as_deref().unwrap_or_default()).as_deref() == Some(version)
        || release
            .assets
            .iter()
            .any(|asset| extract_version(&asset.name).as_deref() == Some(version))
}

fn release_info(release: &GithubRelease) -> Option<ReleaseInfo> {
    let version = extract_version(release.name.as_deref().unwrap_or_default()).or_else(|| {
        release
            .assets
            .iter()
            .find_map(|asset| extract_version(&asset.name))
    })?;
    // 优先精确匹配本次发布的 arm64 APK，其次任意 APK 附件
    let apk_url = release
        .assets
        .iter()
        .find(|asset| asset.name == format!("MusicDan_{version}_arm64.apk"))
        .or_else(|| {
            release
                .assets
                .iter()
                .find(|asset| asset.name.ends_with(".apk"))
        })
        .map(|asset| asset.browser_download_url.clone());
    let page_url = if release.html_url.is_empty() {
        DOWNLOAD_PAGE.to_string()
    } else {
        release.html_url.clone()
    };
    Some(ReleaseInfo {
        version,
        page_url,
        apk_url,
        notes: release.body.clone().unwrap_or_default(),
    })
}

fn build_status(current_version: &str, releases: &[GithubRelease]) -> UpdateStatus {
    let latest = releases
        .iter()
        .filter(|release| !release.draft && !release.prerelease)
        .find_map(release_info);
    let current_release = releases
        .iter()
        .find(|release| release_matches(release, current_version))
        .and_then(release_info);
    UpdateStatus {
        current_version: current_version.to_string(),
        latest,
        current_release,
    }
}

/// 检查更新：返回已安装版本、GitHub 最新发布，以及当前安装版本对应的 Release（用于展示本版本更新内容）
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<UpdateStatus, String> {
    let current_version = app.package_info().version.to_string();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("MusicDan-Update-Check")
        .build()
        .map_err(|error| format!("无法发起更新检查：{error}"))?;
    let releases: Vec<GithubRelease> = client
        .get(RELEASES_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .and_then(|response| response.error_for_status())
        .map_err(|error| format!("无法连接更新服务：{error}"))?
        .json()
        .await
        .map_err(|error| format!("更新信息解析失败：{error}"))?;
    Ok(build_status(&current_version, &releases))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_semver_from_names_and_assets() {
        assert_eq!(extract_version("MusicDan v0.4.3").as_deref(), Some("0.4.3"));
        assert_eq!(
            extract_version("MusicDan_0.4.3_arm64.apk").as_deref(),
            Some("0.4.3")
        );
        assert_eq!(
            extract_version("MusicDan v0.4.10").as_deref(),
            Some("0.4.10")
        );
        assert_eq!(
            extract_version("MusicDan v0.4.3.0").as_deref(),
            Some("0.4.3.0")
        );
        assert_eq!(extract_version("build-17"), None);
        assert_eq!(extract_version("MusicDan"), None);
    }

    #[test]
    fn status_picks_latest_and_current_release() {
        let releases: Vec<GithubRelease> = serde_json::from_str(
            r###"[
                {
                    "name": "MusicDan v0.4.3",
                    "body": "## ✨ v0.4.3 更新内容",
                    "html_url": "https://github.com/asinkLuno/MusicDan/releases/tag/build-17",
                    "draft": false,
                    "prerelease": false,
                    "assets": [
                        { "name": "MusicDan_0.4.3_website.tar.gz", "browser_download_url": "https://example.com/site" },
                        { "name": "MusicDan_0.4.3_arm64.apk", "browser_download_url": "https://example.com/apk" }
                    ]
                },
                {
                    "name": "MusicDan v0.4.2",
                    "body": "old",
                    "html_url": "https://github.com/asinkLuno/MusicDan/releases/tag/build-16",
                    "draft": false,
                    "prerelease": false,
                    "assets": [
                        { "name": "MusicDan_0.4.2_arm64.apk", "browser_download_url": "https://example.com/apk2" }
                    ]
                }
            ]"###,
        )
        .expect("valid fixture");
        let status = build_status("0.4.2", &releases);
        assert_eq!(status.current_version, "0.4.2");
        let latest = status.latest.expect("latest release");
        assert_eq!(latest.version, "0.4.3");
        assert_eq!(latest.apk_url.as_deref(), Some("https://example.com/apk"));
        let current = status.current_release.expect("current release");
        assert_eq!(current.version, "0.4.2");
        assert_eq!(current.apk_url.as_deref(), Some("https://example.com/apk2"));
        let none = build_status("0.1.0", &releases);
        assert!(none.current_release.is_none());
    }

    #[test]
    fn status_skips_drafts_and_prereleases() {
        let releases: Vec<GithubRelease> = serde_json::from_str(
            r###"[
                { "name": "MusicDan v0.5.0-rc1", "draft": false, "prerelease": true, "assets": [] },
                { "name": "MusicDan v0.5.0", "draft": true, "prerelease": false, "assets": [] },
                { "name": "MusicDan v0.4.3", "draft": false, "prerelease": false, "assets": [] }
            ]"###,
        )
        .expect("valid fixture");
        let status = build_status("0.4.3", &releases);
        assert_eq!(status.latest.expect("latest").version, "0.4.3");
    }
}
