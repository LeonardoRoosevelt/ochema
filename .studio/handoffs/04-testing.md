# 交接單：4 — 測試部

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 證據收集者、API 測試員、無障礙審核員（測試部） |
| 階段 | 4 — 驗證 |
| 時間 | 2026-11-09 |

## 背景
ochema 工程交付已過門禁 C（1179 測試全綠；審查 `.studio/reviews/C-1.md`）。需求 `features/`（141 情境，鎖定），契約 `docs/data-contract.md`，UI 規格 `design/ia.md`＋`design/directions/ledger/brief.md`，所有裁決 `.studio/log.md`、`.studio/decisions/`。
**沙箱限制**：沙箱內 Chromium 無法啟動（Mach port 1100），任何瀏覽器都不要在沙箱內嘗試。需要真瀏覽器的部分寫成腳本，由使用者在沙箱外執行。
**共同禁止**：不可修改 `features/`、`schema.dbml`、`src/**`、`tests/steps/**`、`tests/support/**`。發現缺陷只記錄，不修。

## A. 證據收集者
產出 `scripts/evidence.mjs`（＋必要時 `scripts/evidence.sh` 包裝），使用者在沙箱外以 `! bash ~/Project/ochema/scripts/evidence.sh` 執行。腳本須：
1. `pnpm build` → 啟動 `vite preview`（固定埠，結束時一定關閉）→ 用 Playwright Chromium（優先使用 `~/Library/Caches/ms-playwright` 已有的 chromium，選擇與之相容的 `playwright` 版本加入 devDependencies，避免下載瀏覽器；做不到就在回報說明）。
2. 走過關鍵 UI 情境（至少：空狀態、新增、擋下（車牌格式／整列相同）、重複標示與總覽、身分證警示、查詢、匯入 .xlsx／.xls／CSV 預覽（含整列相同提醒、選項停用）、匯入結果、三格式匯出、刪除確認），每個狀態截桌面 1440 與手機 390 兩張，存 `.studio/evidence/screens/<編號>-<名稱>-{desktop,mobile}.png`；另加暗色主題與 reduced-motion 各一組關鍵畫面。
3. 離線驗證：首次載入後等 service worker 就緒，`context.setOffline(true)` 後重新載入，確認 App 可開啟、可查詢、可新增；記錄所有對外請求（應為 0）。
4. 收集 console error／pageerror。
5. 以 `@axe-core/playwright` 對主要畫面跑 axe（WCAG 2.1 AA），結果存 `.studio/evidence/axe.json`。
6. 全部結果摘要寫 `.studio/evidence/evidence-summary.md`（每步通過／失敗、截圖路徑、console 錯誤、axe 違規數、離線結果）。腳本任何一步失敗都要繼續其他步驟並在摘要標記，最後以非零退出碼表示有失敗。
在沙箱內能驗證的：`node --check`、型別、腳本的參數與路徑；安裝依賴用 `npm_config_cache=$TMPDIR/npm-cache pnpm add -D ...`（registry.npmjs.org）。加依賴後 `npx vitest run` 與 `pnpm build` 仍須通過。

## B. API 測試員
在 `tests/qa/*.test.ts` 新增契約之外的邊界測試（資料層，不經 UI）：超長字串、Unicode（全形、emoji、組合字、零寬字元、NBSP）、身分證邊界（小寫字母開頭、新式居留證 8/9、長度 9/11）、車牌邊界（單字元段 `A-1`、多連字號、全形連字號）、匯入大檔（例如 5,000 列）的耗時、CSV 怪異輸入（只有 CRLF、混用 LF/CRLF、引號內換行、尾端多餘逗號）、三格式匯出含 emoji 往返、並行新增同一整列（ConstraintError 不成未處理）。
只寫測試、不修 src。**測試要反映已核可的規則**；遇到 features／契約沒規定的行為，用 `it.todo` 或記錄實際行為（不要擅自斷言成你認為對的），在回報列為「未定義行為」。發現違反規則的缺陷：留下失敗測試並在回報列出（製片人決定是否退回）。回報：`.studio/handoffs/04-api-tester-reply.md`。

## C. 無障礙審核員
在沙箱內做程式碼層級審核：`src/ui/**`、`src/App.tsx`、`index.html`、CSS。檢查鍵盤操作順序與焦點管理（對話框開關焦點、刪除確認預設焦點、通知 role=status 時機）、語意標籤、表單錯誤關聯（aria-describedby／aria-invalid）、顏色以外的辨識、對比（依 brief token 計算）、`prefers-reduced-motion`、觸控目標大小、`lang="zh-Hant"`。寫 `.studio/evidence/a11y-review.md`：每項發現（WCAG 準則編號、嚴重度、檔案:行、建議修法）。真瀏覽器的 axe 結果由證據收集者的腳本產生，你的報告要列出「需在 axe／實機確認」的項目。回報：`.studio/handoffs/04-a11y-reply.md`。

## 回報格式
依 `~/.claude/skills/agency-studio/references/handoffs.md`。
