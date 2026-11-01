package com.musicdan.media.session

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.SystemClock
import app.tauri.plugin.JSObject
import com.musicdan.media.MediaListenerService

/** Reads active sessions on the bridge worker; does not own playback or matching state. */
internal class MediaSessionReader(context: Context) {
    private val manager = context.getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager
    private val listener = ComponentName(context, MediaListenerService::class.java)

    fun nowPlaying(): JSObject? {
        val sessions = manager?.getActiveSessions(listener).orEmpty()
        val controller = sessions.firstOrNull {
            it.playbackState?.state == PlaybackState.STATE_PLAYING
        } ?: sessions.firstOrNull()
        return controller?.let(::toJSObject)
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
