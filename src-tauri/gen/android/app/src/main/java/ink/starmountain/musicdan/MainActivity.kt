package ink.starmountain.musicdan

import android.os.Bundle
import android.webkit.WebView
import ink.starmountain.musicdan.window.WebViewInsets
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat

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
    WebViewInsets.attach(webView)
  }
}
