package com.musicdan.media

import android.app.*
import android.content.Intent
import android.content.Context
import android.content.pm.ServiceInfo
import android.graphics.*
import android.hardware.input.InputManager
import android.os.*
import android.provider.Settings
import android.view.*
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import kotlin.math.*
import com.musicdan.media.overlay.OverlayCanvas

/** The service owns the native renderer; Rust supplies metadata even when the WebView is stopped. */
class OverlayService : Service() {
    companion object {
        var instance: OverlayService? = null
        var appVisible = true
        var latestFrame = JSONObject()
        private const val CHANNEL = "music_danmaku"
        private const val NOTIFICATION = 101

        fun isEnabled(context: Context): Boolean =
            context.getSharedPreferences("overlay", Context.MODE_PRIVATE).getBoolean("enabled", false)

        fun saveEnabled(context: Context, enabled: Boolean) {
            context.getSharedPreferences("overlay", Context.MODE_PRIVATE)
                .edit().putBoolean("enabled", enabled).apply()
        }
    }
    private lateinit var manager: WindowManager
    private lateinit var view: OverlayCanvas
    private lateinit var params: WindowManager.LayoutParams
    private var paused = false
    private var attached = false

    override fun onBind(intent: Intent?) = null
    override fun onCreate() {
        super.onCreate()
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return }
        val notifications = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) notifications.createNotificationChannel(
            NotificationChannel(CHANNEL, "悬浮弹幕", NotificationManager.IMPORTANCE_LOW))
        if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIFICATION, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(NOTIFICATION, notification())
        manager = getSystemService(WINDOW_SERVICE) as WindowManager
        view = OverlayCanvas(this)
        params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            if (Build.VERSION.SDK_INT >= 30) setFitInsetsTypes(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            alpha = maxOpacity()
        }
        try {
            manager.addView(view, params)
            attached = true
            instance = this
            updateFrame()
            updateVisibility()
        } catch (e: Exception) { android.util.Log.e("OverlayService", "Cannot attach overlay", e); stopSelf() }
    }
    private fun maxOpacity(): Float = if (Build.VERSION.SDK_INT >= 31)
        min(0.8f, getSystemService(InputManager::class.java).maximumObscuringOpacityForTouch) else 0.8f

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "stop" -> { saveEnabled(this, false); stopSelf() }
            "pause" -> { paused = !paused; updateVisibility(); getSystemService(NotificationManager::class.java).notify(NOTIFICATION, notification()) }
        }
        return START_NOT_STICKY
    }
    private fun notification(): Notification {
        val open = PendingIntent.getActivity(this, 0, packageManager.getLaunchIntentForPackage(packageName), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        fun action(name: String, code: Int) = PendingIntent.getService(this, code,
            Intent(this, OverlayService::class.java).setAction(name), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("MusicDan · 悬浮弹幕")
            .setContentText(if (paused) "已暂停" else "切换应用后显示弹幕，点击返回设置")
            .setContentIntent(open).setOngoing(true).setSilent(true)
            .addAction(android.R.drawable.ic_media_pause, if (paused) "继续" else "暂停", action("pause", 1))
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "关闭", action("stop", 2)).build()
    }
    fun updateFrame() {
        if (!attached) return
        val opacity = latestFrame.optJSONObject("settings")?.optDouble("opacity", 0.8)?.toFloat() ?: 0.8f
        val alpha = opacity.coerceIn(0.2f, maxOpacity())
        if (params.alpha != alpha) { params.alpha = alpha; manager.updateViewLayout(view, params) }
        view.setFrame(latestFrame)
    }
    fun updateVisibility() {
        if (!attached) return
        view.visibility = if (appVisible || paused) View.INVISIBLE else View.VISIBLE
        view.invalidate()
    }
    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        if (attached) { manager.updateViewLayout(view, params); view.invalidate() }
    }
    override fun onDestroy() {
        if (attached) { manager.removeView(view); attached = false }
        if (instance === this) instance = null
        super.onDestroy()
    }

}
