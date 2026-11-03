/** Preserve Android upgrade ordering, including records written before website-only releases. */
export function nextBuildNumber(releases) {
  if (!Array.isArray(releases) || !releases.length) throw new Error('服务器发布记录为空，拒绝重置构建编号');
  const numbers = releases.map(item => item.build_number
    ?? (Number.isInteger(item.version_code) ? item.version_code - 1_000_000_000 : undefined)
    ?? Number(/\/build-(\d+)(?:\/|$)/.exec(item.release_url ?? item.github_url ?? '')?.[1]));
  if (numbers.some(number => !Number.isSafeInteger(number) || number <= 0)) {
    throw new Error('服务器发布记录缺少有效构建编号');
  }
  return Math.max(...numbers) + 1;
}

export function releaseHistory(entry, previous) {
  return [entry, ...previous.filter(item => item.version !== entry.version).map(item => {
    // A former latest entry must keep downloading its own APK after the next release.
    if (item.download_url !== '/releases/latest.apk') return item;
    return { ...item, download_url: `/releases/${item.name}` };
  })];
}

/** Files are already staged; the last rename is the only visibility switch. */
export function publishCommand({ base, stage, buildNumber, sha256, siteSha256, apkName, siteBundleName, expectedState, owner = 'musicdan:musicdan' }) {
  const releaseDir = `${base}/public/releases/build-${buildNumber}`;
  return `set -e
exec 9>${base}/.publish.lock
flock -n 9
cd ${stage}
printf '%s  %s\n' '${sha256}' '${apkName}' '${siteSha256}' '${siteBundleName}' | sha256sum -c -
python3 -c 'import json,hashlib; p=json.load(open("${base}/public/releases.json")); assert hashlib.sha256(json.dumps(p,ensure_ascii=False,separators=(",",":")).encode()).hexdigest()=="${expectedState}", "发布记录已变化，请重试"'
if [ -e ${releaseDir} ]; then
  # 旧记录尚未引用此编号：这是前次失败留下的未发布目录。
  rm -rf ${releaseDir}
fi
mkdir site
tar -xzf ${siteBundleName} -C site
ln -s ${apkName} app.apk
ln -s ${apkName}.sha256 app.apk.sha256
chown -R ${owner} ${stage}
chmod 755 ${stage}
mv ${stage} ${releaseDir}
# 将原来普通 latest 目录迁移为符号链接；保留原元数据供回滚。
if [ -d ${base}/public/latest ] && [ ! -L ${base}/public/latest ]; then
  cp -a ${base}/public/latest ${base}/public/.latest-legacy
  mv ${base}/public/latest ${base}/public/.latest-before-${buildNumber}
  ln -s .latest-before-${buildNumber} ${base}/public/latest
fi
# 第一次迁移时，先让旧版本仍能通过统一指针提供文件。
old=$(readlink -f ${base}/public/latest)
if [ ! -e "$old/app.apk" ]; then
  cp -L ${base}/public/releases/latest.apk "$old/app.apk"
  cp -L ${base}/public/releases/latest.apk.sha256 "$old/app.apk.sha256"
  cp ${base}/public/releases.json "$old/releases.json"
  ln -s "$(readlink -f ${base}/site)" "$old/site"
fi
ln -s ../latest/app.apk ${base}/public/releases/.apk-next-${buildNumber}
mv -Tf ${base}/public/releases/.apk-next-${buildNumber} ${base}/public/releases/latest.apk
ln -s ../latest/app.apk.sha256 ${base}/public/releases/.sum-next-${buildNumber}
mv -Tf ${base}/public/releases/.sum-next-${buildNumber} ${base}/public/releases/latest.apk.sha256
ln -s latest/releases.json ${base}/public/.history-next-${buildNumber}
mv -Tf ${base}/public/.history-next-${buildNumber} ${base}/public/releases.json
ln -s public/latest/site ${base}/.site-next-${buildNumber}
mv -Tf ${base}/.site-next-${buildNumber} ${base}/site
# 兼容旧记录的无 build 路径下载地址。
ln -s build-${buildNumber}/${apkName} ${base}/public/releases/${apkName}
ln -s build-${buildNumber}/${apkName}.sha256 ${base}/public/releases/${apkName}.sha256
ln -s releases/build-${buildNumber} ${base}/public/.latest-next-${buildNumber}
mv -Tf ${base}/public/.latest-next-${buildNumber} ${base}/public/latest`;
}
