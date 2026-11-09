#!/usr/bin/env bash
# 為 design/directions/*/index.html 截桌面（1440）與手機（390）圖。
# 沙箱內 Chromium 無法註冊 Mach port，需在沙箱外執行：! bash ~/Project/ochema/scripts/shoot-directions.sh
set -eu
CH=$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell | tail -1)
PROFILE=$(mktemp -d)
cd "$(dirname "$0")/.."
for d in design/directions/*/; do
  f="$PWD/${d}index.html"
  "$CH" --headless --hide-scrollbars --user-data-dir="$PROFILE" --window-size=1440,2200 --screenshot="$PWD/${d}screenshot-desktop.png" "file://$f" >/dev/null 2>&1
  "$CH" --headless --hide-scrollbars --user-data-dir="$PROFILE" --window-size=390,2200 --force-device-scale-factor=2 --screenshot="$PWD/${d}screenshot-mobile.png" "file://$f" >/dev/null 2>&1
  echo "✓ ${d}"
done
rm -rf "$PROFILE"
ls -l design/directions/*/screenshot-*.png
