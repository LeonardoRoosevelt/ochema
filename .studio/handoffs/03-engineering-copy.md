# 交接單：3 — 工程部（點擊複製名單欄位）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 前端開發者（工程部） |
| 階段 | 3 — 紅燈→綠燈 |
| 時間 | 2026-11-14 |

## 背景
使用者核可（門禁 A，已鎖定）新情境 `features/copy-value.feature`（5 個情境，Outline 展開後 8 個）。裁決：
- 在名單頁點車頭車號／車斗車號／駕駛姓名／駕駛身分證任一格，**只把該格的值**寫入剪貼簿（不加欄位名稱、不含查詢標示）。
- 只在名單頁（`src/ui/RecordTable.tsx`，只有 ListView 使用）。總覽頁不加。
- 成功：畫面告知「已複製「<值>」」（沿用 App 的結果訊息 Flash，即 `App.tsx` 的 `say()`；ListView 目前沒有拿到 say，需要經 props 傳入）。
- 失敗（剪貼簿 API 不存在或 reject）：告知無法複製，並在訊息裡顯示要複製的值，讓使用者手動選取。
- 鍵盤可用：每個可複製的格子要能用 Tab 聚焦、Enter 觸發 → 建議把值包成 `<button type="button">`，accessible name 例如「複製車頭車號 KLP-7988」。
- 點擊不開表單、不改名單。

## 不可動
- `features/`（已鎖定）、`schema.dbml`。
- 現有測試依賴：表格前四格的 textContent **就是值**（無前綴）——包按鈕時按鈕內只放值（含 `<Hl>` 標示），accessible name 用 aria-label 給；`tests/support/ui.ts` 用 `getByRole('table', { name: '車輛所屬名單' })`、以 cell 文字找列。改完 1400 個現有測試必須全綠。
- 不要放寬任何既有測試。

## 做法
1. **紅燈**：新增 `tests/steps/copy-value.steps.ts`（照 `tests/steps/search.steps.ts` 只呼叫 `runFeature('copy-value.feature')`），在 `tests/support/stepLib/` 新增 `copy.ts` 並在 `index.ts` 註冊。可沿用的既有步驟：「名單上有以下資料：」、「我查詢 {string}」、「名單共有 {int} 筆資料」（先確認實際 pattern）。剪貼簿在 jsdom 用可控的假 `navigator.clipboard.writeText`（記錄寫入內容；「這台裝置不允許寫入剪貼簿」時讓它 reject）。每個情境結束要還原。
   - 斷言要驗意圖：剪貼簿內容**完全等於**值；「沒有開啟任何表單或對話框」要檢查 dialog／表單都不存在；鍵盤情境用 focus + Enter（keyDown/keyUp 或 user-event，看專案有沒有裝），不能直接呼叫 click。
   - 跑 `npx vitest run tests/steps/copy-value.steps.ts`，把失敗輸出存到 `.studio/evidence/red-copy.txt`。失敗原因必須是功能未實作，不能是綁定錯誤；`bash scripts/bdd-dryrun.sh` 要過。
2. **綠燈**：實作 RecordTable／ListView／App 的接線與複製函式（只用 `navigator.clipboard.writeText`；不存在或失敗就走失敗訊息，不要加 execCommand 後援）。樣式沿用既有 token（`src/ui/styles.css`），按鈕看起來仍是表格文字（無邊框、繼承字型與顏色、游標 pointer、`:focus-visible` 有外框、hover 有細微提示），手機卡片版面不能跑掉。
3. 全部測試：`npx vitest run` 全綠，`npx tsc -b --noEmit` 無錯，`npx vite build` 成功。

## 環境
- 跑 npm／npx 一律加 `npm_config_cache=$TMPDIR/npm-cache`。不要用裸 ls。沙箱內無法開瀏覽器。

## 回報
寫到 `.studio/handoffs/03-engineering-copy-reply.md`：改了哪些檔、紅燈與綠燈數字（實際輸出）、做了哪些自行判斷、待決問題。
