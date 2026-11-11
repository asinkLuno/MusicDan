## ✨ v0.1.1 更新内容

更新基线：在 v0.1.0 基础上更换应用签名，并恢复 GitHub Actions 构建。

### 签名与安装

- 启用新的应用签名证书，后续版本统一使用这把新证书。
- 已安装 v0.1.0 或更早版本的用户必须先卸载旧版，再安装 v0.1.1；直接覆盖安装会因签名不一致失败。

### 构建与发布

- 从 main 同步到 releases 分支时，GitHub Actions 自动构建并校验签名 arm64 APK，创建 GitHub Release。
- 发布页改由 GitHub Pages 托管，与 APK 在同一次构建中生成；下载地址指向 GitHub Release 附件。
- GitHub Release 与发布页提供相同的安装包和 SHA-256 校验值。
