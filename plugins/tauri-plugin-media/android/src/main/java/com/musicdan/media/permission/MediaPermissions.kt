package com.musicdan.media.permission

import android.content.ComponentName
import android.content.Context
import android.provider.Settings

/** Queries the OS on demand so returning from Settings reflects revoked grants too. */
internal class MediaPermissions(private val context: Context) {
    fun isListenerEnabled(): Boolean {
        val enabled = Settings.Secure.getString(
            context.contentResolver, "enabled_notification_listeners"
        ) ?: return false
        return enabled.split(":").any {
            ComponentName.unflattenFromString(it)?.packageName == context.packageName
        }
    }
}
