package com.musicdan.media.overlay

import android.graphics.Bitmap
import android.graphics.LinearGradient
import android.graphics.Shader
import android.graphics.Matrix
import android.graphics.BitmapFactory
import android.graphics.RectF
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.os.SystemClock
import android.view.View
import org.json.JSONObject
import kotlin.math.*

internal class OverlayCanvas(context: android.content.Context) : View(context) {
    private val effects = context.assets.open("danmaku-effects.json").bufferedReader().use { JSONObject(it.readText()) }
    private fun font(weight: Int): Typeface = if (Build.VERSION.SDK_INT >= 28)
        Typeface.create(Typeface.create("sans-serif", Typeface.NORMAL), weight, false)
        else Typeface.create("sans-serif-medium", Typeface.NORMAL)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor(effects.getString("textColor"))
        typeface = font(500)
    }
    private val badgePaint = Paint(paint).apply { typeface = font(600) }
    private val highEffect = effects.getJSONObject("high")
    private val topEffect = effects.getJSONObject("top")
    private fun colors(effect: JSONObject): IntArray {
        val values = effect.getJSONArray("colors")
        return IntArray(values.length()) { Color.parseColor(values.getString(it)) }
    }
    private val highColors = colors(highEffect)
    private val topColors = colors(topEffect)
    private val gradients = mutableMapOf<Pair<Boolean, Float>, LinearGradient>()
    private val gradientMatrix = Matrix()
    private data class Segment(val text: String, val bitmap: Bitmap? = null)
    private val emoteIds = context.assets.open("emotes/map.json").bufferedReader().use { JSONObject(it.readText()) }
    private val emotePattern = Regex("\\[([^\\[\\]]{1,12})\\]")
    private val bitmaps = mutableMapOf<Int, Bitmap?>()
    private data class Layout(val parts: List<Segment>, val widths: FloatArray, val textWidth: Float,
        val badge: String, val badgeWidth: Float, val likes: Long)
    private val layouts = mutableMapOf<Int, Layout>()
    private var layoutFont = -1f
    private val imagePaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val imageBounds = RectF()
    private fun parse(text: String): List<Segment> = run {
        val result = mutableListOf<Segment>()
        var last = 0
        for (match in emotePattern.findAll(text)) {
            val name = match.groupValues[1]
            if (!emoteIds.has(name)) continue
            val id = emoteIds.getInt(name)
            val bitmap = if (bitmaps.containsKey(id)) bitmaps[id] else {
                val decoded = runCatching {
                    context.assets.open("emotes/emoji_$id.png").use { BitmapFactory.decodeStream(it) }
                }.getOrNull()
                bitmaps[id] = decoded
                decoded
            }
            if (bitmap == null) continue
            if (match.range.first > last) result.add(Segment(text.substring(last, match.range.first)))
            result.add(Segment(match.value, bitmap))
            last = match.range.last + 1
        }
        if (last < text.length) result.add(Segment(text.substring(last)))
        result
    }
    private var frame = JSONObject()
    private var receivedAt = 0L
    private var revision = -1L
    private var allComments = emptyList<JSONObject>()
    private var comments = emptyList<JSONObject>()
    private var displayLimit = -1
    fun setFrame(next: JSONObject) {
        frame = next
        receivedAt = SystemClock.uptimeMillis()
        if (revision != next.optLong("revision")) {
            revision = next.optLong("revision")
            layouts.clear()
            gradients.clear()
            val array = next.optJSONArray("comments")
            allComments = (0 until (array?.length() ?: 0)).map { array!!.getJSONObject(it) }
            displayLimit = -2 // force rebuilding the display selection
        }
        val limit = next.optJSONObject("settings")?.optInt("commentLimit", 0) ?: 0
        if (displayLimit != limit) {
            displayLimit = limit
            layouts.clear()
            gradients.clear()
            val selected = if (limit > 0) allComments.sortedByDescending { it.optLong("liked_count") }.take(limit) else allComments
            comments = selected.sortedWith(compareBy<JSONObject> { it.optLong("time") }.thenBy { it.optLong("commentId") })
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
        val areaHeight = height.toFloat()
        val lanes = max(1, floor(areaHeight / (font * 1.8f)).toInt())
        val duration = np.optLong("duration").takeIf { it > 0 }
            ?: frame.optJSONObject("song")?.optLong("duration")?.takeIf { it > 0 } ?: 240000L
        val plan = comments
        val readable = (width / (font * 6.0) * 1000).coerceIn(4000.0, 12000.0)
        val dense = lanes * 8.0 * max(1L, duration) / max(1, plan.size)
        val crossing = max(3000.0, min(readable, dense))
        val spacing = duration.toDouble() / plan.size
        val position = np.optLong("position") + (SystemClock.uptimeMillis() - receivedAt) * np.optDouble("playbackSpeed", 1.0)
        val end = min(plan.lastIndex, floor(position / spacing).toInt())
        val start = max(0, ceil((position - crossing) / spacing).toInt())
        canvas.save()
        canvas.clipRect(0f, 0f, width.toFloat(), areaHeight)
        paint.shader = null
        paint.textSize = font
        badgePaint.textSize = font * .65f
        if (layoutFont != font) { layouts.clear(); gradients.clear(); layoutFont = font }
        layouts.keys.removeAll { it < start || it > end }
        for (i in start..end) {
            val progress = (position - i * spacing) / crossing
            if (progress < 0 || progress > 1) continue
            val count = plan[i].optInt("occurrences", 1).coerceAtLeast(1)
            val textFont = round(font / density * (1 + min(1.0, log2(count.toDouble()) * .15))).toFloat() * density
            paint.textSize = textFont
            badgePaint.textSize = round(textFont / density * .65f) * density
            val emoteSize = round(textFont / density * 1.5f) * density
            val layout = layouts.getOrPut(i) {
                val comment = plan[i]
                val count = comment.optInt("occurrences", 1)
                val likes = comment.optLong("liked_count")
                val text = comment.optString("content").replace('\n', ' ')
                val badge = listOfNotNull(if (likes > 0) "♥$likes" else null, if (count > 1) "×$count" else null).joinToString("  ")
                val parts = parse(text)
                val widths = FloatArray(parts.size) { index ->
                    if (parts[index].bitmap != null) emoteSize else paint.measureText(parts[index].text)
                }
                Layout(parts, widths, widths.sum(), badge,
                    if (badge.isEmpty()) 0f else textFont * .25f + badgePaint.measureText(badge), likes)
            }
            val textWidth = layout.textWidth
            val badgeWidth = layout.badgeWidth
            val likes = layout.likes
            val badge = layout.badge
            var x = (width - (width + textWidth + badgeWidth) * progress).toFloat()
            val center = (i % lanes + 0.5f) * areaHeight / lanes
            val baseline = center - (paint.ascent() + paint.descent()) / 2
            val top = likes >= topEffect.getLong("minLikes")
            paint.shader = if (likes >= highEffect.getLong("minLikes")) {
                val gradient = gradients.getOrPut(top to textWidth) {
                    LinearGradient(0f, 0f, max(1f, textWidth), 0f, if (top) topColors else highColors, null, Shader.TileMode.CLAMP)
                }
                gradientMatrix.setTranslate(x, 0f)
                gradient.setLocalMatrix(gradientMatrix)
                gradient
            } else null
            if (top) paint.setShadowLayer(min(6f * density, textFont * .2f), 0f, 0f, topColors[0])
            else paint.clearShadowLayer()
            for ((index, part) in layout.parts.withIndex()) {
                val bitmap = part.bitmap
                if (bitmap != null) {
                    imageBounds.set(x, center - emoteSize / 2, x + emoteSize, center + emoteSize / 2)
                    canvas.drawBitmap(bitmap, null, imageBounds, imagePaint)
                } else {
                    canvas.drawText(part.text, x, baseline, paint)
                }
                x += layout.widths[index]
            }
            if (badge.isNotEmpty()) {
                val badgeCenter = center - textFont * .55f
                val badgeBaseline = badgeCenter - (badgePaint.ascent() + badgePaint.descent()) / 2
                canvas.drawText(badge, x + textFont * .25f, badgeBaseline, badgePaint)
            }
        }
        canvas.restore()
        if (visibility == View.VISIBLE) postInvalidateOnAnimation()
    }
}
