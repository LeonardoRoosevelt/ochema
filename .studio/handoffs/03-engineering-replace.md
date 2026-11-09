# 交接單：3 — 工程部（匯入整份替換）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 資深開發者（兼前端，工程部） |
| 階段 | 3 — 替換實作（紅→綠） |
| 時間 | 2026-11-09 |

## 背景
使用者裁決＋製片人裁決：`.studio/decisions/import-replace.md`（先讀）。`features/` 已改寫並重新核可（142 情境；審查 `.studio/reviews/A-5.md`，其中「建議」第 7 點：「名單上有以下資料」在 Given／Then 語意不同，step 要分開處理）。產品回報 `.studio/handoffs/01-product-replace-reply.md` 列出新步驟用語。DBML 不變（四欄複合 unique 仍成立：整列相同在檔內合併為一筆）。
**本次使用者授權修改 `tests/steps/**`、`tests/support/**`、`tests/ui/**`、`tests/data/**`、`tests/qa/**` 中與匯入累計語意相關的部分**（刪除已不存在的選項／分類的 step 與測試，新增替換相關 step），**其他斷言不得放寬**。

## 交付要求（依序）
1. **契約**：更新 `docs/data-contract.md` 匯入段：分類（FORMAT_ERROR > IDENTICAL_IN_FILE > DUP_IN_FILE > NEW，錯誤列不參與比對）、預覽回傳（將刪除 N＝目前筆數、將匯入 M、合併 K、是否可確認）、`replaceAllFromImport(preview)`（單一交易：清空＋依檔案順序寫入；任何失敗整筆回滾；提供測試接縫注入寫入失敗）、移除 ImportMode／commitImport 舊語意。追溯表更新。
2. **紅燈**：先改 step definitions 與測試使其對應新 features（新 API 先放會丟 not implemented 的 stub），跑 `scripts/bdd-dryrun.sh`（須 exit 0）與 `npx vitest run`，把輸出存 `.studio/evidence/red-replace.txt`；失敗須是未實作或斷言不成立，不是語法／綁定錯誤。
3. **資料層**：實作 `src/data/importer.ts` 等。
4. **UI**：匯入預覽改為四類＋「將刪除 N 筆、匯入 M 筆」說明＋整列相同合併告知；有格式錯誤時「確認匯入」為 aria-disabled 並說明原因；確認後跳二次確認對話框（原生 dialog，預設焦點「取消」，含「先匯出目前資料」按鈕＝匯出全部預設 .xlsx、匯出後對話框仍在、名單不變），確認後替換並顯示結果（已刪除 N、已匯入 M、合併 K）。空名單也要二次確認。沿用 ledger 樣式與既有 a11y 做法（live 容器常駐、焦點管理）。
5. 更新 `tests/ui`（移除舊選項測試，新增：錯誤時確認 aria-disabled、二次確認預設焦點取消、取消後名單不變、先匯出後名單不變）。
6. `scripts/evidence.mjs`：匯入組改為新流程（預覽統計、二次確認、先匯出、替換後筆數＝檔案筆數；fixture 若含格式錯誤列需改為另一份無錯誤檔來驗證替換成功，並保留一份含錯誤的檔驗證擋下）。`node --check` 通過。
7. 綠燈：`scripts/bdd-dryrun.sh` exit 0；`npx vitest run` 序列連跑 2 次皆 0 失敗；`pnpm build` 成功。`README.md` 匯入說明更新為「整份替換」。
不可修改 `features/`、`schema.dbml`。npm 相關加 `npm_config_cache=$TMPDIR/npm-cache`；不要用裸 ls；沙箱內不能開瀏覽器；等待迴圈要有上限；不要留下背景行程。

## 回報
寫到 `.studio/handoffs/03-engineering-replace-reply.md`：契約變更、紅燈摘要、刪除／新增的測試清單（說明為何刪除不是放寬）、綠燈數字、build、evidence 腳本改動。
