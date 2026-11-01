网易云音乐经典表情资源，来自官方 CDN：

`https://s1.music.126.net/style/web2/emt/emoji_{id}.png`

`map.json` 为两端共享的名称与编号映射；WebView 通过本地静态路径读取，Android 通过 Gradle assets 打包同一份资源。新增映射时必须同时添加对应 PNG。
