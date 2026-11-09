# 回報：4 — 證據收集者（測試部 A）

| 欄位 | 值 |
|---|---|
| 發送方 | 證據收集者 |
| 接收方 | 製片人 |
| 階段 | 4 — 驗證 |

## 完成了什麼
- `scripts/evidence.mjs`（主腳本）與 `scripts/evidence.sh`（包裝，缺依賴時先 pnpm install）。
- 流程：pnpm build → `vite preview`（127.0.0.1:4173，--strictPort，結束／SIGINT 必關）→ Playwright Chromium。
- 情境（每個狀態桌面 1440＋手機 390 兩張，存 `.studio/evidence/screens/<編號>-<名稱>-{desktop,mobile}.png`）：空狀態、新增表單、新增成功、擋下（欄位錯誤）、擋下（整列相同）、同車頭通知、身分證警示（表單＋通知）、總覽、查詢命中／無結果、刪除確認（驗證預設焦點為「取消」）、刪除完成、資料頁、三格式匯出（實際下載並存檔）、匯入選檔、.xls／CSV／.xlsx 預覽（斷言統計 2/2/1/1、整列相同提醒、未選方式時「確認匯入」停用）、選「照樣匯入」、匯入結果（斷言已匯入 3 筆）、匯入後名單。
- 離線：等 SW activated 且預快取>0 → 重載使受控 → setOffline → 重載、查詢、新增、再重載資料仍在；全程記錄對外請求（預期 0）。
- 暗色（colorScheme dark）與 reduced-motion（reducedMotion reduce）各一組：名單、總覽、表單擋下、刪除確認、資料頁；reduced-motion 另記錄 .seal／按鈕的計算動畫樣式。
- console.error／pageerror 全程收集。axe 標籤：wcag2a、wcag2aa、wcag21a、wcag21aa、wcag22aa（依製片人補充），對約 20 個畫面狀態執行，存 `axe.json`。
- 製片人補充的兩項檢查已加入並寫進摘要「離線與對外請求」段與步驟備註：(1) 刪除後 activeElement 不得為 body（步驟 12，掉回 body 即失敗，並記錄實際元素）；(2) 步驟 13a 切換名單／總覽／資料後記錄各自 document.title 並標示是否改變。
- 任何步驟失敗會截 `-FAILED.png`、嘗試復原後繼續；有步驟失敗、console 錯誤或對外請求>0 則退出碼 1。

## 產出檔案
- scripts/evidence.mjs、scripts/evidence.sh
- package.json／pnpm-lock.yaml：devDependencies 新增 `playwright` 1.64.0（精確版本）、`@axe-core/playwright` ^4.14.0
- 執行後產生：.studio/evidence/evidence-summary.md、axe.json、screens/*.png、downloads/、fixtures/（已由 dry-run 產出 import-sample.xlsx/.xls/.csv）

## 取捨與理由
- Playwright 1.64.0 的 chromium 修訂版為 1248，與 `~/Library/Caches/ms-playwright/chromium-1248`（及 headless-shell-1248）完全相符，不需下載瀏覽器（1.65.0 需要 1254，故未採用）。
- 匯入測試檔由腳本以 vendor 的 xlsx 即時產生，不引入二進位檔進版控。
- 「選項停用」：src 中匯入方式 radio 並無 disabled，實際停用的是「確認匯入」按鈕（有重複且未選方式時），腳本據此斷言。

## 沙箱內已驗證
- `node --check`、`bash -n` 通過。
- `bash scripts/evidence.sh --dry-run` 通過：build、固定埠預覽啟動並取得 sw.js、Chromium 執行檔存在、三個匯入測試檔產生且讀回 7 列；預覽已關閉（4173 無殘留）。
- 未啟動任何瀏覽器；瀏覽器端選擇器與斷言（含新增的兩項）尚未實跑，首次在沙箱外執行可能需微調。
- `pnpm build` 通過；`npx vitest run` 最終 19 檔 1316 通過／7 todo。注意：加依賴後第一次跑曾有 1 筆失敗（重跑兩次皆全綠），推測為 API 測試員同時寫入 tests/qa 的中間狀態或時序不穩，未查明，請留意。

## 待決問題
- 無涉商業意圖的問題。

## 第一次實跑後修正
使用者實跑結果：16 步失敗、console 錯誤 0、對外請求 0。判讀為腳本問題，已修 `scripts/evidence.mjs`（未動 src／tests／features）。沙箱內僅驗證 `node --check` 與 `--dry-run`，修正後的選擇器尚未在真瀏覽器實跑。

根因與修正：
- 07：`getByText('仍可儲存')` 同時命中欄位說明與警示（strict mode violation），對話框因此沒關，08／09／12 連鎖失敗。改為 `dlg.locator('.hint').filter({ hasText: '檢查碼' })`。
- 14–23：根因是連鎖而非選擇器——前一步失敗後 `recover()` 把頁面拉回「名單」，之後的步驟在錯誤頁面找匯出 radio／匯入鈕／file input。14 本身已成功下載 xlsx，只是因 07 缺一筆，預期「已匯出 3 筆資料」變成 2 筆。
- 17 起的「確認匯入」：src 已改用 `aria-disabled`（非 `disabled`），原本的 `isDisabled()`／`isEnabled()` 會判錯；改為檢查 `aria-disabled="true"`（未選方式時）與無該屬性（選方式後）。
- 25／26：預期值寫死 6／7 筆，依賴前面匯入成功；改為該組自建 3 筆資料，預期 3 筆，離線新增後 4 筆。

結構調整（避免連鎖）：
- 流程拆成五組：名單（01–12）、匯出（13、13a、14–16）、匯入（17–23）、離線（24–26）、暗色與 reduced-motion；每組用全新 browser context（全新 IndexedDB），自行用 UI 建立所需資料（匯出、匯入、離線組各建 R1／R2／R3 三筆）。
- 每個步驟開始前先 `closeDialogs()`（按 Esc 直到沒有 `dialog[open]`）。
- 匯出步驟自行先前往「資料」頁；匯入預覽改用 `toPreview()`（前往資料 → 匯入 Excel → 選檔），不依賴目前停在哪一頁；18–22 各自獨立。
- 12 刪除後筆數改為相對值（刪除前筆數 -1）。
- 刪除一筆後 activeElement 非 body、頁籤 document.title 兩項檢查保留（後者搬到匯出組的 13a）。
