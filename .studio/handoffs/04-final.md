# 交接單：4 — 終審（現實檢驗者）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 現實檢驗者（測試部） |
| 階段 | 4 — 終審 |
| 時間 | 2026-11-09 |

## 背景
ochema（車輛所屬名單離線 PWA）。需求 `features/`（141 情境，使用者核可並鎖定）、`schema.dbml`（鎖定）、設計方向 ledger。所有裁決：`.studio/decisions/*.md`、`.studio/log.md`、`docs/data-contract.md` 各附錄。

## 證據（只依這些判斷，預設不通過）
- BDD／單元：`.studio/evidence/test-C.txt`（gate check C 輸出）、`.studio/evidence/red.txt`（紅燈證據）。可自行重跑 `npx vitest run`（加 `npm_config_cache=$TMPDIR/npm-cache`，序列執行勿與其他行程同時 build）。
- 實機（沙箱外 Playwright）：`.studio/evidence/evidence-summary.md`、`.studio/evidence/axe.json`、`.studio/evidence/screens/*.png`（用 Read 看圖）、`.studio/evidence/downloads/`。
- 審查：`.studio/reviews/A-*.md`、`B-1.md`、`C-1.md`。
- 測試部：`.studio/evidence/a11y-review.md`、`.studio/handoffs/04-*-reply.md`、`tests/qa/`。
- 工程回報：`.studio/handoffs/03-*-reply.md`。

## 判定要求
寫到 `.studio/reviews/final.md`，**第一行必須一字不差**是 `判定：通過` 或 `判定：不通過`（全形冒號、不加 #、不加粗）。第二行之後接你的完整報告（依角色檔格式），至少包含：
- 每個 feature 的情境是否有測試與（UI 情境）實機證據支撐；抽查至少 10 張截圖與其情境是否相符。
- 已知限制清單是否誠實列出（未經實機：VoiceOver／讀屏實際朗讀、iPhone Safari 安裝與下載行為、真實 Excel 另存的 .xls、截斷 .xls 偵測不完整、xlsx 內 CRLF→LF、CSV 公式注入不轉義、SW 更新需關閉所有視窗、佔位圖示）。
- 若不通過：具體缺陷（檔案:行或截圖）、屬實作缺陷或情境外新行為。
不可修改任何檔案（除了 final.md）。沙箱內瀏覽器無法啟動。不要用裸 ls。
回報：`.studio/handoffs/04-final-reply.md`（簡短）。
