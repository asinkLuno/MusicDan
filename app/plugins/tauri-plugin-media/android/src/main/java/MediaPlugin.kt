package com.listenwme.media

import android.os.SystemClock
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.appcompat.app.AppCompatActivity
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.provider.Settings
import android.util.Log
import app.tauri.plugin.JSObject
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * 媒体信息插件 —— 通过 MediaSession 获取当前正在播放的歌曲。
 *
 * 提供：
 * - isPermissionGranted: 查询「通知使用权」是否已授予
 * - openPermissionSettings: 跳转系统通知使用权设置页
 * - getNowPlaying: 返回当前播放的歌曲信息（标题/歌手/专辑/进度/播放状态）
 */
@TauriPlugin
class MediaPlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        private const val TAG = "MediaPlugin"
    }

    /** 单线程执行器：getActiveSessions 是 binder 调用，放到后台线程执行 */
    private val executor = Executors.newSingleThreadExecutor()

    private val mediaSessionManager: MediaSessionManager? =
        activity.getSystemService(Activity.MEDIA_SESSION_SERVICE) as? MediaSessionManager

    private val listenerComponent = ComponentName(activity, MediaListenerService::class.java)

    /** 检查本应用是否已被授予「通知使用权」（无额外依赖，直接读 Secure 设置） */
    private fun isListenerEnabled(): Boolean {
        val enabled = Settings.Secure.getString(
            activity.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false
        return enabled.split(":").any {
            ComponentName.unflattenFromString(it)?.packageName == activity.packageName
        }
    }

    @Command
    fun isPermissionGranted(invoke: Invoke) {
        val ret = JSObject()
        ret.put("granted", isListenerEnabled())
        invoke.resolve(ret)
    }

    @Command
    fun openPermissionSettings(invoke: Invoke) {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(intent)
        invoke.resolve(JSObject())
    }

    /**
     * 返回 { permissionGranted: Boolean, nowPlaying: NowPlaying|null, error?: String }
     * 多个会话同时存在时，优先返回正在播放的那个。
     */
    @Command
    fun getNowPlaying(invoke: Invoke) {
        executor.execute {
            val ret = JSObject()
            val granted = isListenerEnabled()
            ret.put("permissionGranted", granted)
            if (!granted) {
                invoke.resolve(ret)
                return@execute
            }
            try {
                val sessions = mediaSessionManager
                    ?.getActiveSessions(listenerComponent)
                    .orEmpty()
                val controller = sessions.firstOrNull {
                    it.playbackState?.state == PlaybackState.STATE_PLAYING
                } ?: sessions.firstOrNull()

                ret.put("nowPlaying", controller?.let(::toJSObject) ?: JSONObject.NULL)
            } catch (e: SecurityException) {
                Log.w(TAG, "getActiveSessions denied", e)
                ret.put("permissionGranted", false)
                ret.put("error", e.message ?: "SecurityException")
            } catch (e: Exception) {
                Log.e(TAG, "getNowPlaying failed", e)
                ret.put("error", e.message ?: e.toString())
            }
            invoke.resolve(ret)
        }
    }

    @Command
    fun overlayStatus(invoke: Invoke) {
        invoke.resolve(JSObject().apply {
            put("granted", Settings.canDrawOverlays(activity))
            put("running", OverlayService.instance != null)
            put("supported", true)
        })
    }

    @Command
    fun openOverlaySettings(invoke: Invoke) {
        activity.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${activity.packageName}")))
        invoke.resolve(JSObject())
    }

    @Command
    fun setOverlay(invoke: Invoke) {
        try {
            if (invoke.getArgs().optBoolean("enabled")) {
                if (!Settings.canDrawOverlays(activity)) { invoke.reject("请先允许显示在其他应用上层"); return }
                val intent = Intent(activity, OverlayService::class.java)
                ContextCompat.startForegroundService(activity, intent)
            } else {
                activity.stopService(Intent(activity, OverlayService::class.java))
            }
            invoke.resolve(JSObject())
        } catch (e: Exception) { invoke.reject(e.message) }
    }

    @Command
    fun updateOverlay(invoke: Invoke) {
        OverlayService.latestFrame = JSONObject(invoke.getRawArgs())
        OverlayService.instance?.updateFrame()
        invoke.resolve(JSObject())
    }

    override fun onResume(activity: AppCompatActivity) {
        OverlayService.appVisible = true
        OverlayService.instance?.updateVisibility()
    }
    override fun onStop(activity: AppCompatActivity) {
        OverlayService.appVisible = false
        OverlayService.instance?.updateVisibility()
    }

    private fun toJSObject(controller: MediaController): JSObject {
        val metadata = controller.metadata
        val state = controller.playbackState
        val np = JSObject()
        np.put("title", metadata?.getString(MediaMetadata.METADATA_KEY_TITLE) ?: "")
        np.put("artist", metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST) ?: "")
        np.put("album", metadata?.getString(MediaMetadata.METADATA_KEY_ALBUM) ?: "")
        np.put("duration", metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION) ?: 0L)
        val position = state?.position ?: 0L
        val elapsed = if (state?.state == PlaybackState.STATE_PLAYING && state.lastPositionUpdateTime > 0)
            ((SystemClock.elapsedRealtime() - state.lastPositionUpdateTime) * state.playbackSpeed).toLong() else 0L
        np.put("position", (position + elapsed).coerceAtLeast(0L))
        np.put("playbackSpeed", state?.playbackSpeed?.toDouble() ?: 1.0)
        np.put("lastPositionUpdateTime", state?.lastPositionUpdateTime ?: 0L)
        np.put("isPlaying", state?.state == PlaybackState.STATE_PLAYING)
        np.put("packageName", controller.packageName ?: "")
        return np
    }
}
