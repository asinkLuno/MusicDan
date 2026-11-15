use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const WEBSITE: &str = "https://asinkluno.github.io/MusicDan";
const RELEASES_URL: &str = "https://asinkluno.github.io/MusicDan/releases.json";
const DOWNLOAD_PREFIX: &str = "https://github.com/asinkLuno/MusicDan/releases/download/";
/// 下载进度事件：`{ received, total }`，total 未知时为 0。
const PROGRESS_EVENT: &str = "update://progress";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub version: String,
    pub page_url: String,
    pub apk_url: Option<String>,
    /// releases.json 中记录的安装包 SHA-256（小写十六进制），旧版本可能缺失。
    pub sha256: Option<String>,
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
    sha256: Option<String>,
    #[serde(default)]
    notes: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub received: u64,
    pub total: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    pub path: String,
    pub bytes: u64,
}

/// 校验值来自 releases.json，只接受 64 位十六进制，避免空值或脏数据绕过校验。
fn normalize_sha256(value: &Option<String>) -> Option<String> {
    let value = value.as_deref()?.trim().to_ascii_lowercase();
    (value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit())).then_some(value)
}

/// 安装包文件名只允许发布流程生成的 `MusicDan_<版本>_arm64.apk`。
fn asset_file_name(url: &str) -> Option<String> {
    let relative = url.strip_prefix(DOWNLOAD_PREFIX)?;
    let (tag, asset) = relative.split_once('/')?;
    if tag.is_empty()
        || asset.contains('/')
        || !asset.starts_with("MusicDan_")
        || !asset.ends_with("_arm64.apk")
        || !tag.chars().all(|c| c.is_ascii_alphanumeric() || "._-[]".contains(c))
        || !asset.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    {
        return None;
    }
    Some(asset.to_string())
}

fn release_info(release: &WebsiteRelease) -> Option<ReleaseInfo> {
    // Only open APK assets from the official GitHub Release, never arbitrary links.
    let relative = release.download_url.strip_prefix(DOWNLOAD_PREFIX)?;
    let (tag, asset) = relative.split_once('/')?;
    if tag.is_empty()
        || asset.is_empty()
        || asset.contains('/')
        || asset.contains("..")
        || !asset.starts_with("MusicDan_")
        || !asset.ends_with("_arm64.apk")
        || !tag.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
        || !asset.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    {
        return None;
    }
    Some(ReleaseInfo {
        version: release.version.clone(),
        page_url: format!("{WEBSITE}/#download"),
        apk_url: Some(release.download_url.clone()),
        sha256: normalize_sha256(&release.sha256),
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
        "连接发布页失败，请检查网络、代理及设备时间"
    } else {
        "无法获取发布页更新信息"
    };
    format!("{hint}：{details}")
}

/// GitHub Pages 发布记录同时用于检查更新和显示版本说明，无需直接调用 GitHub API。
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

/// 下载目录：应用缓存内的 `updates/`，与 Android FileProvider 的 `cache-path` 一致。
fn download_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir()
        .map_err(|error| format!("无法定位缓存目录：{error}"))?
        .join("updates");
    std::fs::create_dir_all(&dir).map_err(|error| format!("无法创建下载目录：{error}"))?;
    Ok(dir)
}

fn hex_digest(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// 应用内下载安装包，边写边算 SHA-256；校验不通过的文件不会留下可安装的 APK。
#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    url: String,
    sha256: String,
) -> Result<DownloadResult, String> {
    let expected = normalize_sha256(&Some(sha256)).ok_or_else(|| "更新信息缺少有效的 SHA-256 校验值".to_string())?;
    let file_name = asset_file_name(&url).ok_or_else(|| "下载地址不是官方发布包".to_string())?;
    let dir = download_dir(&app)?;
    let target = dir.join(&file_name);
    let partial = dir.join(format!("{file_name}.part"));

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(900))
        .connect_timeout(Duration::from_secs(20))
        .user_agent("MusicDan-Update-Download")
        .build()
        .map_err(|error| format!("无法发起下载：{error}"))?;
    let mut response = client.get(&url)
        .send().await
        .and_then(|response| response.error_for_status())
        .map_err(|error| request_error(&error))?;

    let total = response.content_length().unwrap_or(0);
    let mut hasher = Sha256::new();
    let mut received: u64 = 0;
    let mut written = std::fs::File::create(&partial)
        .map_err(|error| format!("无法写入安装包：{error}"))?;
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    let mut emit_progress = |received: u64| {
        if last_emit.elapsed() >= Duration::from_millis(120) {
            last_emit = Instant::now();
            let _ = app.emit(PROGRESS_EVENT, DownloadProgress { received, total });
        }
    };
    emit_progress(0);

    let write_result = async {
        while let Some(chunk) = response.chunk().await.map_err(|error| request_error(&error))? {
            hasher.update(&chunk);
            written.write_all(&chunk).map_err(|error| format!("无法写入安装包：{error}"))?;
            received += chunk.len() as u64;
            emit_progress(received);
        }
        Ok::<(), String>(())
    }.await;
    if let Err(error) = write_result {
        drop(written);
        let _ = std::fs::remove_file(&partial);
        return Err(error);
    }
    written.flush().map_err(|error| format!("无法写入安装包：{error}"))?;
    drop(written);

    let actual = hex_digest(&hasher.finalize());
    if actual != expected {
        let _ = std::fs::remove_file(&partial);
        let _ = std::fs::remove_file(&target);
        return Err(format!(
            "安装包校验失败：SHA-256 不匹配（期望 {expected}，实际 {actual}），请重新下载"
        ));
    }
    std::fs::rename(&partial, &target).map_err(|error| format!("无法保存安装包：{error}"))?;
    let _ = app.emit(PROGRESS_EVENT, DownloadProgress { received, total: total.max(received) });
    Ok(DownloadResult { path: target.to_string_lossy().into_owned(), bytes: received })
}
