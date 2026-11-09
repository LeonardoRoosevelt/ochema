#!/usr/bin/env bash
# 收集 ochema 的測試證據（截圖、axe、離線、console）。
# 沙箱內 Chromium 無法啟動，請在沙箱外執行：! bash ~/Project/ochema/scripts/evidence.sh
# 參數會傳給 evidence.mjs（--dry-run、--skip-build）。
set -eu
cd "$(dirname "$0")/.."
[ -d node_modules/playwright ] || pnpm install
exec node scripts/evidence.mjs "$@"
