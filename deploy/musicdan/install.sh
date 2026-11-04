#!/usr/bin/env bash
set -euo pipefail

# Run on the ECS host from an extracted deployment bundle containing site/.
# 官网静态页与 /releases 下的 APK 均为静态文件。
# 发布在 main 分支通过 yarn release 完成，APK 同时上传 GitHub Release。
bundle=$(cd -- "$(dirname -- "$0")" && pwd)
test "$(id -u)" -eq 0
test -f "$bundle/site/index.html"
test -f /root/caddy/Caddyfile
test -f /root/caddy/docker-compose.yml

if ! id musicdan > /dev/null 2>&1; then
  useradd --system --home-dir /srv/musicdan --no-create-home --shell /usr/sbin/nologin musicdan
fi
install -d -o musicdan -g musicdan -m 755 /srv/musicdan /srv/musicdan/public /srv/musicdan/public/releases /srv/musicdan/public/latest
install -m 644 "$bundle/Caddyfile" /srv/musicdan/Caddyfile

site=$(mktemp -d /srv/musicdan/site-XXXXXXXX)
chmod 755 "$site"
cp -a "$bundle/site/." "$site/"
ln -s "$(basename "$site")" "/srv/musicdan/.site-next-$$"
mv -Tf "/srv/musicdan/.site-next-$$" /srv/musicdan/site

backup=$(date -u +%Y%m%dT%H%M%SZ)
cp -a /root/caddy/Caddyfile "/root/caddy/Caddyfile.before-musicdan-$backup"
cp -a /root/caddy/docker-compose.yml "/root/caddy/docker-compose.yml.before-musicdan-$backup"
python3 - <<'PY'
from pathlib import Path
compose = Path('/root/caddy/docker-compose.yml')
text = compose.read_text()
mount = '      - /srv/musicdan:/srv/musicdan:ro'
if mount not in text:
    anchor = '      - ./Caddyfile:/etc/caddy/Caddyfile:ro'
    if text.count(anchor) != 1:
        raise SystemExit('Caddy Compose file changed; check its mounts before installing')
    compose.write_text(text.replace(anchor, anchor + '\n' + mount))
caddyfile = Path('/root/caddy/Caddyfile')
text = caddyfile.read_text()
directive = 'import /srv/musicdan/Caddyfile'
if directive not in text:
    caddyfile.write_text(text.rstrip() + '\n\n' + directive + '\n')
PY

# Validate the complete central configuration before starting/recreating Caddy.
if ! docker run --rm --network none \
  -v /root/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v /srv/musicdan:/srv/musicdan:ro \
  caddy:alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  cp -a "/root/caddy/Caddyfile.before-musicdan-$backup" /root/caddy/Caddyfile
  cp -a "/root/caddy/docker-compose.yml.before-musicdan-$backup" /root/caddy/docker-compose.yml
  exit 1
fi

# 兼容旧安装：移除已废弃的自动同步服务（现由本地钩子在推送时部署）
systemctl disable --now musicdan-sync.timer musicdan-sync.service 2>/dev/null || true
rm -f /etc/systemd/system/musicdan-sync.service /etc/systemd/system/musicdan-sync.timer
systemctl daemon-reload

docker compose -f /root/caddy/docker-compose.yml up -d caddy
echo 'MusicDan site deployed; APK 更新由本地推送钩子完成，服务器不再运行同步服务。'
