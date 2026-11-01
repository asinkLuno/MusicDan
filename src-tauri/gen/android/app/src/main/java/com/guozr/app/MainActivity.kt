package com.guozr.app

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : TauriActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
  }

  /** 原生 inset 是物理像素，注入时按 WebView 的 DPR 换算为 CSS 像素。 */
  override fun onWebViewCreate(webView: WebView) {
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
