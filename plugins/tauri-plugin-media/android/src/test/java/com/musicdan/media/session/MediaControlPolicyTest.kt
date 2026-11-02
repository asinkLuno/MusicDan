package com.musicdan.media.session

import android.media.session.PlaybackState
import android.view.KeyEvent
import org.junit.Assert.*
import org.junit.Test

class MediaControlPolicyTest {
    @Test fun explicitActionsPreferTransportControls() {
        assertNull(MediaControlPolicy.mediaKey("play", PlaybackState.ACTION_PLAY, true))
        assertNull(MediaControlPolicy.mediaKey("pause", PlaybackState.ACTION_PAUSE, false))
        assertNull(MediaControlPolicy.mediaKey("next", PlaybackState.ACTION_SKIP_TO_NEXT, true))
        assertNull(MediaControlPolicy.mediaKey("previous", PlaybackState.ACTION_SKIP_TO_PREVIOUS, false))
        assertNull(MediaControlPolicy.mediaKey("seek", PlaybackState.ACTION_SEEK_TO, false))
    }

    @Test fun toggleOnlySessionsReceiveToggleKey() {
        assertEquals(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, MediaControlPolicy.mediaKey("play", PlaybackState.ACTION_PLAY_PAUSE, false))
        assertEquals(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, MediaControlPolicy.mediaKey("pause", PlaybackState.ACTION_PLAY_PAUSE, false))
    }

    @Test fun buttonOnlySessionsSupportBasicControlsWithoutEnablingSeek() {
        assertEquals(KeyEvent.KEYCODE_MEDIA_PREVIOUS, MediaControlPolicy.mediaKey("previous", 0L, true))
        assertEquals(KeyEvent.KEYCODE_MEDIA_NEXT, MediaControlPolicy.mediaKey("next", 0L, true))
        assertEquals(KeyEvent.KEYCODE_MEDIA_PLAY, MediaControlPolicy.mediaKey("play", 0L, true))
        assertEquals(KeyEvent.KEYCODE_MEDIA_PAUSE, MediaControlPolicy.mediaKey("pause", 0L, true))
        val actions = MediaControlPolicy.availableActions(0L, true)
        assertTrue(actions and PlaybackState.ACTION_SKIP_TO_NEXT != 0L)
        assertEquals(0L, actions and PlaybackState.ACTION_SEEK_TO)
        assertEquals(PlaybackState.ACTION_SEEK_TO, MediaControlPolicy.availableActions(PlaybackState.ACTION_SEEK_TO, false))
    }

    @Test(expected = IllegalStateException::class)
    fun unsupportedSeekIsRejectedEvenWithMediaButtons() {
        MediaControlPolicy.mediaKey("seek", 0L, true)
    }

    @Test(expected = IllegalStateException::class)
    fun unsupportedNextIsRejectedWithoutMediaButtons() {
        MediaControlPolicy.mediaKey("next", 0L, false)
    }
}
