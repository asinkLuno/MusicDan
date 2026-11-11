# Android 发布签名迁移

> 当前从 v0.1.1 起使用新的发布证书，已配置到 GitHub Actions Secrets。下方“从现有缓存迁移”记录的是旧证书的迁移过程，仅作历史参考；不要重新生成或替换现有证书。

GitHub Actions 发布流程从以下 Repository Secrets 恢复签名，缺失时停止构建，绝不生成新证书：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`

必须迁移现有 `android-release-keystore-v1` 缓存中的证书，才能覆盖安装已发布的 APK。
不要清理该缓存，直至完成备份和签名指纹核对。

## 从现有缓存迁移

先将 `.github/workflows/migrate-android-signing.yml` 合入默认分支及 `releases` 分支，使手动工作流可用。
以下命令在本机仓库目录执行，需要已登录且具有仓库 Secrets 写权限的 `gh`。

1. 在 Git 忽略的目录生成临时加密证书。私钥只留在本机，不上传到 GitHub。

   ```sh
   mkdir -p android-signing
   chmod 700 android-signing
   openssl req -x509 -newkey rsa:3072 -nodes \
     -keyout android-signing/migration.key \
     -out android-signing/migration.pem \
     -subj '/CN=MusicDan signing migration' -days 7
   chmod 600 android-signing/migration.key
   gh workflow run migrate-android-signing.yml --ref releases \
     -f recipient_certificate="$(cat android-signing/migration.pem)"
   gh run list --workflow migrate-android-signing.yml --limit 1
   ```

2. 用上一步输出的运行 ID 等待完成、下载并解密。工作流只上传加密文件，下载有效期为一天。

   ```sh
   gh run watch RUN_ID --exit-status
   gh run download RUN_ID --name encrypted-android-signing --dir android-signing
   openssl cms -decrypt -binary -inform DER \
     -in android-signing/musicdan.keystore.cms \
     -recip android-signing/migration.pem \
     -inkey android-signing/migration.key \
     -out android-signing/musicdan.keystore
   chmod 600 android-signing/musicdan.keystore
   keytool -list -v -keystore android-signing/musicdan.keystore
   ```

   旧工作流的 alias、store password、key password 均为 `musicdan`。
   用 Android SDK 的 `apksigner verify --print-certs 已发布的.apk` 查看已发布 APK 的
   SHA-256 证书指纹，并与 keystore 对比；不一致时停止迁移，寻找原证书。

3. 确认指纹一致后写入 Secrets，并将 keystore 另存到可靠的私密备份位置。

   ```sh
   base64 < android-signing/musicdan.keystore | gh secret set ANDROID_KEYSTORE_BASE64
   printf '%s' musicdan | gh secret set ANDROID_KEY_ALIAS
   printf '%s' musicdan | gh secret set ANDROID_KEYSTORE_PASSWORD
   printf '%s' musicdan | gh secret set ANDROID_KEY_PASSWORD
   ```

4. 合入正式构建修复，或重新运行 `releases` 分支构建。确认新 APK 可以覆盖安装旧版后，
   可删除本机迁移私钥与加密中转文件，保留安全备份。

若已经有原始 keystore，可以跳过导出步骤，直接核对指纹并设置 Secrets。
若缓存和原始 keystore 都已丢失，应停止发布；生成新证书不能修复旧安装的升级链路。
