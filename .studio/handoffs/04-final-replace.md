# 交接單：4 — 終審重審（匯入改為整份替換）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 現實檢驗者（測試部） |
| 階段 | 4 — 終審（變更重審） |
| 時間 | 2026-11-09 |

## 背景
ochema 交付後使用者要求：「匯入的資料直接替換原始資料，不再需要累計」。使用者裁決見 `.studio/decisions/import-replace.md`：
- 任何格式錯誤列 → 整份擋下不能確認；
- 檔內重複照樣匯入並標示；整列相同只保留第一筆；
- 預覽寫明「將刪除目前 N 筆、匯入 M 筆」＋二次確認（預設焦點取消，可先匯出目前資料）；空名單也要二次確認；
- 保留手動新增／編輯／刪除。
需求重新經門禁 A 核可（142 情境，`features/` 已鎖定）；`schema.dbml` 未變。

## 證據（只依這些判斷，預設不通過）
- BDD／單元：`.studio/evidence/test-C.txt`、`.studio/evidence/red-replace.txt`（替換變更的紅燈）。可自行重跑 `npx vitest run`（加 `npm_config_cache=$TMPDIR/npm-cache`）。
- 程式：`src/data/importer.ts`（`replaceAllFromImport` 單一交易）、`src/ui/ImportView.tsx`、`src/ui/ReplaceDialog.tsx`。
- 審查：`.studio/reviews/C-2.md`（變異 7/7 被抓）。
- 實機：`.studio/evidence/evidence-summary.md`（41/41）、`screens/18-*`～`23-*`、`21a-*`、`21b-*`、`axe.json`。第一次跑 18–20 失敗是腳本對 aria-disabled 按鈕 click 逾時，已改 `click({force:true})`（見 log.md），請自行判斷此修正是否放寬了驗證。
- 先前終審：`.studio/reviews/final.md`（改名版）。

## 判定要求
覆寫 `.studio/reviews/final.md`，**第一行必須一字不差**是 `判定：通過` 或 `判定：不通過`。之後完整報告，至少包含：
- 替換規則每一條（上列）是否有情境＋測試＋（UI）實機證據；抽查至少 8 張截圖。
- 交易失敗時名單維持原狀是否有測試證明（非只有宣稱）。
- 先前累加相關的舊文案／舊文件是否還殘留（README、契約、UI 文字）。
- 已知限制是否誠實（沿用上次清單，加上與替換相關的新風險，例如誤操作整份覆蓋）。
不可修改任何檔案（除了 final.md 與回報）。沙箱內瀏覽器無法啟動。不要用裸 ls。
回報：`.studio/handoffs/04-final-replace-reply.md`（簡短）。
