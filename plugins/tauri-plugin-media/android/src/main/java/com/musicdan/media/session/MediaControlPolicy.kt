package com.musicdan.media.session

import android.media.session.PlaybackState
import android.view.KeyEvent

/** Prefer explicit transport actions, with media keys for sessions exposing only button handling. */
internal object MediaControlPolicy {
    fun availableActions(actions: Long, handlesButtons: Boolean): Long =
        if (handlesButtons) actions or PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or
            PlaybackState.ACTION_SKIP_TO_PREVIOUS or PlaybackState.ACTION_SKIP_TO_NEXT else actions

    fun mediaKey(action: String, actions: Long, handlesButtons: Boolean): Int? {
        val (required, key) = when (action) {
            "play" -> PlaybackState.ACTION_PLAY to KeyEvent.KEYCODE_MEDIA_PLAY
            "pause" -> PlaybackState.ACTION_PAUSE to KeyEvent.KEYCODE_MEDIA_PAUSE
            "previous" -> PlaybackState.ACTION_SKIP_TO_PREVIOUS to KeyEvent.KEYCODE_MEDIA_PREVIOUS
            "next" -> PlaybackState.ACTION_SKIP_TO_NEXT to KeyEvent.KEYCODE_MEDIA_NEXT
            "seek" -> PlaybackState.ACTION_SEEK_TO to null
            else -> error("不支持的播放操作")
        }
        if (actions and required != 0L) return null
        if ((action == "play" || action == "pause") && actions and PlaybackState.ACTION_PLAY_PAUSE != 0L) {
            return KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
        }
        check(handlesButtons && key != null) { "当前音乐 App 不支持此操作" }
        return key
    }
}
