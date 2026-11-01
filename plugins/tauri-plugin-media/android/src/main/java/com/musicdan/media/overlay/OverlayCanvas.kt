package com.musicdan.media.overlay

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.SystemClock
import android.view.View
import org.json.JSONObject
import kotlin.math.*

internal class OverlayCanvas(context: android.content.Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; setShadowLayer(3f, 0f, 2f, Color.BLACK) }
    private var frame = JSONObject()
    private var receivedAt = 0L
    private var revision = -1L
    private var comments = emptyList<JSONObject>()
    fun setFrame(next: JSONObject) {
        frame = next
        receivedAt = SystemClock.uptimeMillis()
        if (revision != next.optLong("revision")) {
            revision = next.optLong("revision")
            val array = next.optJSONArray("comments")
            comments = (0 until (array?.length() ?: 0)).map { array!!.getJSONObject(it) }
                .distinctBy { it.optString("content").trim() }
                .sortedByDescending { it.optLong("liked_count") }
        }
        invalidate()
    }
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val np = frame.optJSONObject("nowPlaying") ?: return
        if (comments.isEmpty() || width == 0 || height == 0 || !np.optBoolean("isPlaying")) return
        val cfg = frame.optJSONObject("settings") ?: return
        val density = resources.displayMetrics.density
        val font = cfg.optDouble("fontSize", 16.0).toFloat() * density
        val crossing = cfg.optDouble("crossSeconds", 9.0) * 1000
        val areaHeight = height.toFloat()
        val lanes = min(cfg.optInt("density", 6), max(1, floor(areaHeight / (font * 1.8f)).toInt()))
        val duration = np.optLong("duration").takeIf { it > 0 }
            ?: frame.optJSONObject("song")?.optLong("duration")?.takeIf { it > 0 } ?: 240000L
        val cap = max(1, floor(lanes * duration / crossing).toInt())
        val plan = comments.take(cap).sortedWith(compareBy<JSONObject> { it.optLong("time") }.thenBy { it.optLong("commentId") })
        val spacing = duration.toDouble() / plan.size
        val position = np.optLong("position") + (SystemClock.uptimeMillis() - receivedAt) * np.optDouble("playbackSpeed", 1.0)
        val end = min(plan.lastIndex, floor(position / spacing).toInt())
        val start = max(0, ceil((position - crossing) / spacing).toInt())
        canvas.save()
        canvas.clipRect(0f, 0f, width.toFloat(), areaHeight)
        paint.textSize = font
        for (i in start..end) {
            val progress = (position - i * spacing) / crossing
            if (progress < 0 || progress > 1) continue
            val text = plan[i].optString("content").replace('\n', ' ')
            val x = (width - (width + paint.measureText(text)) * progress).toFloat()
            val baseline = (i % lanes + 0.5f) * areaHeight / lanes - (paint.ascent() + paint.descent()) / 2
            canvas.drawText(text, x, baseline, paint)
        }
        canvas.restore()
        if (visibility == View.VISIBLE) postInvalidateOnAnimation()
    }
}
