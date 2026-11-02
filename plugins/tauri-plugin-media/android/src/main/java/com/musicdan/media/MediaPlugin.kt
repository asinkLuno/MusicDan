package com.musicdan.media

import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.appcompat.app.AppCompatActivity
import android.app.Activity
import android.content.Intent
import android.provider.Settings
import android.util.Log
import app.tauri.plugin.JSObject
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import org.json.JSONObject
import java.util.concurrent.Executors
import com.musicdan.media.session.MediaSessionReader
import com.musicdan.media.permission.MediaPermissions

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

    private val sessions = MediaSessionReader(activity)
    private val permissions = MediaPermissions(activity)

    @Command
    fun isPermissionGranted(invoke: Invoke) {
        val ret = JSObject()
        ret.put("granted", permissions.isListenerEnabled())
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
            val granted = permissions.isListenerEnabled()
            ret.put("permissionGranted", granted)
            if (!granted) {
                invoke.resolve(ret)
                return@execute
            }
            try {
                ret.put("nowPlaying", sessions.nowPlaying() ?: JSONObject.NULL)
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
    fun controlPlayback(invoke: Invoke) {
        executor.execute {
            try {
                check(permissions.isListenerEnabled()) { "请先授权读取播放信息" }
                val args = invoke.getArgs()
                val position = if (args.has("position") && !args.isNull("position")) args.getLong("position") else null
                sessions.control(args.getString("packageName"), args.getString("action"), position)
                invoke.resolve(JSObject())
            } catch (e: Exception) {
                invoke.reject(e.message ?: "播放控制失败")
            }
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
        val next = JSONObject(invoke.getRawArgs())
        val previous = OverlayService.latestFrame
        if (!next.has("comments") && next.optLong("revision") == previous.optLong("revision")) {
            next.put("comments", previous.optJSONArray("comments"))
        }
        OverlayService.latestFrame = next
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

}
