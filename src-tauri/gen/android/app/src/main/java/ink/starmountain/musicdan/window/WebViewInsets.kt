package ink.starmountain.musicdan.window

import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

/** Owns safe-area propagation, including document reloads and DPR conversion. */
internal object WebViewInsets {
  fun attach(webView: WebView) {
    var lastInsets: androidx.core.graphics.Insets? = null
    var startupScript: ScriptHandler? = null
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val safe = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      if (safe != lastInsets) {
        lastInsets = safe
        val js = """
          (() => {
            const scale = window.devicePixelRatio || 1;
            const style = document.documentElement.style;
            style.setProperty('--system-inset-top', (${safe.top} / scale) + 'px');
            style.setProperty('--system-inset-bottom', (${safe.bottom} / scale) + 'px');
            style.setProperty('--system-inset-left', (${safe.left} / scale) + 'px');
            style.setProperty('--system-inset-right', (${safe.right} / scale) + 'px');
          })();
        """.trimIndent()
        // 只保留最新的启动脚本，页面重载后也使用当前边距。
        startupScript?.remove()
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
          startupScript = WebViewCompat.addDocumentStartJavaScript(webView, js, setOf("*"))
        }
        webView.evaluateJavascript(js, null)
      }
      insets
    }
    webView.post { ViewCompat.requestApplyInsets(webView) }
  }
}
