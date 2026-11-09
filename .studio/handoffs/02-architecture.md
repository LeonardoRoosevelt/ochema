# 交接單：2 — 架構部

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 後端架構師（架構部） |
| 階段 | 2a — 資料契約 |
| 時間 | 2026-11-09 |

## 背景
**需求**：ochema——車輛所屬名單（車頭、車尾、姓名、身分證）離線 PWA。資料只在裝置 IndexedDB。
**目前狀態**：門禁 A 已核可並鎖定 `features/*.feature`（7 檔、110 情境）。使用者裁決：`.studio/decisions/A-pre-1.md`、`.studio/decisions/A-gate.md`；受理紀錄 `.studio/log.md`。
**相關檔案**：
- `features/*.feature` — 唯一需求來源（檔頭註解有分類規則、原因代碼與優先序）
- `~/Project/BloomIn/src/` — 參考專案的 IndexedDB（idb）資料層寫法與 Excel 以外的備份做法，請沿用其風格
**限制**：
- 沒有後端、沒有 HTTP。技術棧：Vite 7＋React 19＋TS、idb、vitest 5＋@amiceli/vitest-cucumber（jsdom＋fake-indexeddb）。
- 不可修改 `features/`（已鎖定）。
- 執行期不得依賴外部網址（離線情境）。

## 交付要求
**產出**：
1. `schema.dbml`（專案根）：至少 `vehicle_records`（所有 `@table:` 都要存在；`@table:none` 不需要）。寫出 pk、not null、unique、indexes、Note（服務哪些情境）。注意：整列四欄相同被禁止 → 考慮四欄複合 unique；同車頭／同車尾／同身分證允許重複 → 一般索引供重複偵測。說明 DBML 欄位如何對應 IndexedDB object store 與 index（keyPath、是否需要 createdAt 之類的排序／「第一次出現」依據）。
2. `docs/data-contract.md`（取代 API 契約）：
   - 資料層模組 API（TS 函式簽名）：新增／編輯／刪除／列表／查詢、欄位檢查（回傳原因代碼）、重複偵測（種類、衝突資料、總覽）、匯入解析→預覽→提交（略過重複／照樣匯入）、匯出。
   - 每個函式對應哪些情境（追溯表：情境名稱 → 函式 → 資料表）。
   - 原因代碼、重複種類的列舉與 features 註解一致。
   - Excel 函式庫選型建議（需能讀「儲存格顯示文字」以滿足數字型儲存格情境、能寫出文字格式儲存格以保留前導 0、可在離線打包、在 jsdom/Node 下可測），列出候選與取捨，選一個。
**驗收標準**：
- [ ] `npx -y -p @dbml/cli dbml2sql schema.dbml --postgres` 成功。
- [ ] 每個 `@api` 情境都能在追溯表找到對應函式。
- [ ] DBML 與 data-contract 欄位、約束一致。
**規範**：`~/.claude/skills/agency-studio/references/bdd-conventions.md`（DBML 段）

## 回報
寫到 `.studio/handoffs/02-architecture-reply.md`：完成內容、產出清單、設計取捨（例如複合 unique 與前後空白去除的先後、排序依據）、待決問題。
