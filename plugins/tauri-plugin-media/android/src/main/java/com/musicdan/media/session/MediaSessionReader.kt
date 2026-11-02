package com.musicdan.media.session

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSession
import android.view.KeyEvent
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.SystemClock
import app.tauri.plugin.JSObject
import com.musicdan.media.MediaListenerService

/** Reads active sessions on the bridge worker; does not own playback or matching state. */
internal class MediaSessionReader(context: Context) {
    private val manager = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager
    private val listener = ComponentName(context, MediaListenerService::class.java)

    private var selected: MediaController? = null

    fun nowPlaying(): JSObject? {
        val sessions = manager?.getActiveSessions(listener).orEmpty()
        val controller = sessions.firstOrNull {
            it.playbackState?.state == PlaybackState.STATE_PLAYING
        } ?: sessions.firstOrNull { it.sessionToken == selected?.sessionToken } ?: sessions.firstOrNull()
        selected = controller
        return controller?.let(::toJSObject)
    }

    fun control(packageName: String, action: String, position: Long?) {
        require(packageName.isNotBlank()) { "缺少播放来源" }
        val controller = manager?.getActiveSessions(listener).orEmpty()
            .filter { it.packageName == packageName }
            .let { matches -> matches.firstOrNull { it.sessionToken == selected?.sessionToken }
                ?: matches.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING } ?: matches.firstOrNull() }
            ?: error("播放来源已断开，请重新打开音乐 App")
        val actions = controller.playbackState?.actions ?: 0L
        val mediaKey = MediaControlPolicy.mediaKey(action, actions,
            controller.flags and MediaSession.FLAG_HANDLES_MEDIA_BUTTONS.toLong() != 0L)
        if (mediaKey != null) {
            if (mediaKey == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
                val playing = controller.playbackState?.state == PlaybackState.STATE_PLAYING
                if ((action == "play" && playing) || (action == "pause" && !playing)) return
            }
            val now = SystemClock.uptimeMillis()
            val sent = controller.dispatchMediaButtonEvent(KeyEvent(now, now, KeyEvent.ACTION_DOWN, mediaKey, 0))
            controller.dispatchMediaButtonEvent(KeyEvent(now, now, KeyEvent.ACTION_UP, mediaKey, 0))
            check(sent) { "当前音乐 App 未接收播放按键" }
            return
        }
        val controls = controller.transportControls
        when (action) {
            "play" -> controls.play()
            "pause" -> controls.pause()
            "previous" -> controls.skipToPrevious()
            "next" -> controls.skipToNext()
            "seek" -> {
                val duration = controller.metadata?.getLong(MediaMetadata.METADATA_KEY_DURATION) ?: 0L
                require(position != null && position >= 0L && duration > 0L) { "无效的播放进度" }
                controls.seekTo(position.coerceAtMost(duration))
            }
        }
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
        np.put("playbackActions", MediaControlPolicy.availableActions(state?.actions ?: 0L,
            controller.flags and MediaSession.FLAG_HANDLES_MEDIA_BUTTONS.toLong() != 0L))
        np.put("isPlaying", state?.state == PlaybackState.STATE_PLAYING)
        np.put("packageName", controller.packageName ?: "")
        return np
    }
}
