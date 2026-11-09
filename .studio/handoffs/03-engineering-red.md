# 交接單：3 — 工程部（第一段：骨架＋step definitions 紅燈）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 資深開發者（工程部） |
| 階段 | 3a — 紅燈 |
| 時間 | 2026-11-09 |

## 背景
**需求**：ochema——車輛所屬名單離線 PWA。門禁 A（`features/`，141 情境）與 B（`schema.dbml`、設計方向 ledger）已核可並**鎖定，不可修改**。
**相關檔案**：
- `features/*.feature`（7 檔）— 唯一需求來源
- `docs/data-contract.md` — 資料層模組 API、分類演算法、格式判定、追溯表、待實測清單 T1–T9、附錄製片人裁決（Q-E：標題列固定第 1 列）
- `schema.dbml` — IndexedDB 結構
- `design/ia.md`、`design/directions/ledger/brief.md` — UI（第二段才實作，但 @ui step 需要知道畫面結構與可及名稱）
- `.studio/decisions/*.md`、`.studio/log.md` — 所有裁決
- `~/Project/BloomIn/` — 參考：package.json、vite.config.ts（base、PWA、spaFallback）、vitest.config.ts、tsconfig、src/ 資料層寫法、.github/workflows/deploy.yml
- `vendor/xlsx-0.20.3.tgz` — SheetJS CE（使用者已下載並驗證 SHA-256），以 `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` 引用
- `scripts/bdd-dryrun.sh` — dryrun（每個 `features/X.feature` 必須有 `tests/steps/X.steps.ts`）
**限制**：
- 棧：Vite 7＋React 19＋TS、idb、vite-plugin-pwa、vitest 5＋@amiceli/vitest-cucumber 8（已在 devDependencies）、jsdom、fake-indexeddb、@testing-library/react。對齊 BloomIn 版本與風格；base 為 `/ochema/`。
- 測試指令：`npx vitest run`；dryrun：`scripts/bdd-dryrun.sh`。
- 執行期不得依賴外部網址。

## 交付要求（本段只到紅燈，不實作功能）
1. 專案骨架：package.json（scripts：dev/build/preview/test）、vite.config.ts、vitest.config.ts（jsdom、fake-indexeddb/auto、include `tests/**/*.steps.ts` 與 `tests/**/*.test.ts`）、tsconfig、index.html、`src/` 下依 data-contract 的模組檔案，**只放型別與會拋出 `not implemented` 的 stub**（UI 只放最小 App 殼）。`.github/workflows/deploy.yml` 照 BloomIn。
2. 每個 feature 一個 `tests/steps/<feature>.steps.ts`，涵蓋全部情境：
   - `@api`：呼叫 data-contract 的函式並斷言「那麼」。
   - `@ui`：Testing Library render `<App/>`，以角色／可及名稱操作（不依賴 CSS class），斷言畫面文字。下載以可注入的下載函式攔截；選檔以 File 觸發 change。
   - `@table:none` 建置情境：讀 `dist/` 產物（manifest、precache 清單、不含外部網址）；建置在測試中只做一次並共用（或用 globalSetup）。
   - 測試 fixture（.xlsx/.xls/CSV/Big5/二進位/截斷檔）由 helper 產生；helper 可直接用 xlsx（契約 §7.1）。
   - 每個「那麼」都要有實質斷言，禁止空斷言或 `expect(true)`。
3. 跑 `scripts/bdd-dryrun.sh` 必須 exit 0（無缺 step／缺情境）。
4. 跑 `npx vitest run`：必須紅燈，且失敗原因是 `not implemented` 或斷言不成立，**不是**語法、匯入、step 綁定錯誤。把完整輸出存到 `.studio/evidence/red.txt`。
5. 契約「待工程部實測」T1–T9：用 helper 實測能測的（T1/T2/T3/T4/T7/T9 等），結果寫進回報；若 T1–T3 失敗且無備案，停手回報。

**沙箱**：
- 安裝：`npm_config_cache=$TMPDIR/npm-cache pnpm install`（網域 registry.npmjs.org）。
- 不要用裸 ls（用 eza 或 fd）；等待迴圈要設上限。
- 不要改 `features/`、`schema.dbml`、`scripts/bdd-dryrun.sh`。

**驗收標準**：
- [ ] dryrun exit 0。
- [ ] `.studio/evidence/red.txt` 存在，失敗皆為未實作類。
- [ ] 141 情境全有 step；無空斷言。
- [ ] `pnpm build` 可在 stub 狀態下成功（tsc 無錯）。

## 回報
寫到 `.studio/handoffs/03-engineering-red-reply.md`：專案結構、step 檔清單與情境數、red.txt 摘要（通過／失敗數與失敗類型分布）、T1–T9 實測結果、待決問題。
