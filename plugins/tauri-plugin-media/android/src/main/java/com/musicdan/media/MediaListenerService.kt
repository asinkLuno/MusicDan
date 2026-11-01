package com.musicdan.media

import android.service.notification.NotificationListenerService

/**
 * 通知监听服务 —— 仅作为「通知使用权」的挂载点。
 *
 * 用户在系统设置中授予本应用通知使用权后，
 * MediaSessionManager.getActiveSessions() 才能以本服务的 ComponentName
 * 列出系统中所有活动的媒体会话（参考 AMLL-DroidMate 的做法）。
 */
class MediaListenerService : NotificationListenerService()
