#!/bin/sh
# redeploy-dist.sh — 최신 dist 를 무중단 교체 (rsync 원자적 갱신)
set -eu
SRC="${1:-/opt/dropword-kiosk/dist}"
DEST="/var/www/dropword-kiosk"
[ -f "$SRC/index.html" ] || { echo "ERR: $SRC/index.html 없음 — 먼저 npm run build"; exit 1; }
sudo rsync -a --delete "$SRC"/ "$DEST"/
curl -sf http://127.0.0.1:8737/ >/dev/null && echo "OK: SPA 재배포 완료 (에이전트 재시작 불요)"
