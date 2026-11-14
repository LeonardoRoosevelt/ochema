# 交接單：4 — 終審（點擊複製名單欄位）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 現實檢驗者 |
| 階段 | 4 — 終審（變更重審，範圍只限本功能） |
| 時間 | 2026-11-14 |

## 背景
使用者裁決：名單頁點車頭車號／車斗車號／駕駛姓名／駕駛身分證任一格，只複製該格的值；只在名單頁；失敗要告知並顯示值。情境 `features/copy-value.feature`（5 個，門禁 A 已核可，共 147）。

## 證據
- 工程回報 `.studio/handoffs/03-engineering-copy-reply.md`；紅燈 `.studio/evidence/red-copy.txt`；綠燈 `green-copy-full.txt`。
- 程式：`src/ui/RecordTable.tsx`（CopyValue）、`src/ui/ListView.tsx`、`src/App.tsx`（onCopy）、`src/ui/Flash.tsx`（tone=warn，製片人修改）、`src/ui/styles.css`（.cellcopy）。
- 測試：`tests/support/stepLib/copy.ts`、`tests/support/clipboard.ts`、`tests/steps/copy-value.steps.ts`。
- 實機：`.studio/evidence/evidence-summary.md`（42/42，步驟 10a 在真 Chromium 讀回剪貼簿＝20-9A）、`screens/10a-*`。
- 可重跑 `npx vitest run`（加 `npm_config_cache=$TMPDIR/npm-cache`）。

## 判定要求
覆寫 `.studio/reviews/final.md`，第一行一字不差 `判定：通過` 或 `判定：不通過`。至少檢查：
- 5 個情境各有意圖測試（剪貼簿內容完全等於值、鍵盤真的走 Tab+Enter、失敗不寫入且不顯示成功樣式）。
- 既有測試沒有被放寬；表格前四格 textContent 仍是值。
- 無障礙：按鈕名稱、焦點外框、讀屏是否重複朗讀。
- 已知限制是否需要補（非 HTTPS 無法複製、手機觸控面積、iPhone Safari 未實測）。
不可修改 final.md 與回報以外的檔案。沙箱內無法開瀏覽器。不要用裸 ls。
回報：`.studio/handoffs/04-final-copy-reply.md`（簡短）。
