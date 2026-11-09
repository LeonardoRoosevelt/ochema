# 回報：4 — API 測試員（測試部）

| 欄位 | 值 |
|---|---|
| 發送方 | API 測試員 |
| 接收方 | 製片人 |
| 階段 | 4 — 驗證 |
| 時間 | 2026-11-09 |

## 完成了什麼
只新增 `tests/qa/*.test.ts`（4 檔），未改 `src/**`、`features/`、`schema.dbml`、`tests/steps|support/**`、`package.json`。
共 181 個（170 個實測 + 11 個 `it.todo`）；`tests/qa` 169 通過、**1 失敗（刻意留紅，見缺陷 1）**；全套 `npx vitest run`：1348 通過、1 失敗（同一個）、11 todo。

## 產出檔案
- `tests/qa/validation-boundary.test.ts` — 車牌（單字元段、多連字號、全形連字號、零寬、NBSP、組合字、emoji、優先序、超長）、身分證（小寫開頭、新式居留證 8/9、長度 9/11、26 字母×4 性別碼用獨立公式交叉驗證）、姓名。
- `tests/qa/records-concurrency.test.ts` — Unicode／超長資料往返、查詢邊界、並行新增同一整列（10 路）、並行編輯成同一整列、新增×匯入並行、同預覽重複提交、CRUD 邊界。
- `tests/qa/csv-weird-input.test.ts` — parseCsv／readImportFile：CR／LF／CRLF 混用、引號內換行、尾端多餘逗號、BOM、NUL、非法 UTF-8、截斷多位元組、UTF-16、未收尾引號、短列／長列、標題順序。
- `tests/qa/import-export-scale.test.ts` — 5,000 列匯入（三格式）、最壞情況（全同車頭）、三格式匯出往返（emoji／ZWJ／公式字元／引號等 23 種值）、.xls 列數上限、xlsx 文字型別。

## 發現的缺陷
1. **（低～中）.xlsx 匯出再匯入，姓名內的 CRLF 變成 LF**。違反契約 §3.6「匯出再匯入…四欄內容完全還原（三種格式皆然）」。證據：`tests/qa/import-export-scale.test.ts`「xlsx：姓名內含 CRLF 換行，匯出再讀回逐字相同」失敗，`"王\r\n小明"` → `"王\n小明"`；最小重現為 SheetJS 單獨寫入再讀回即如此（XML 換行正規化），csv／xls 正常。建議：承認為已知限制並在契約記載，或匯出時 LF 正規化；製片人決定。
2. **（中，規則空白）超過 32,767 字元的姓名／車牌可存入，但匯出 .xlsx 會丟一般 `Error: Text length must not exceed 32767 characters`**（`buildExportBytes`／`exportRecords` 未處理），整個匯出失敗。契約無長度規則，故列未定義行為，但後果是「一筆合法資料讓匯出整個壞掉」。測試目前以特性紀錄鎖住實際行為。

## 契約文件缺陷（非程式）
- 契約 §3.5.1 `gridToRawRows` 規則 1 正文仍寫「標題列＝第一個非空白列」，與附錄 Q-E「固定第 1 列」矛盾；實作與測試依附錄（第 1 列空白 → `MISSING_HEADERS`）。

## 未定義行為清單（皆為 it.todo 或 [特性紀錄]）
1. 車牌／姓名長度上限（目前無上限，10 萬字元可存）；超過 32,767 字元時 .xlsx 匯出丟錯（缺陷 2）。
2. 身分證長度以 UTF-16 code unit 計（emoji 算 2）；code point 或 code unit 未規定。
3. 姓名只有零寬字元（U+200B）：`trim` 不移除，視為有值而存入（看起來是空白）。
4. 刪除不存在的 id：靜默成功（特性紀錄）。
5. 孤立代理字元的姓名經 CSV 往返會變 U+FFFD。
6. 兩個分頁同時寫入的跨分頁競態（契約只提 blocked／blocking）。
7. CSV 檔案大小上限（無防護）。
8. 宣告範圍極大（A1:XFD1048576）的 .xlsx：SheetJS 的 `XLSX.write` 造檔就會卡死，無法用現有 fixture 驗證讀端；未驗證。
9. 標題含 NFD 組合字或中間夾全形空白。
10. 零寬字元／NFC vs NFD 造成「看起來相同」的整列可存入、不算整列相同（契約 §2 明定原樣 `===`，故為依規則行為，但使用者可能意外）。

## 實測耗時（jsdom＋fake-indexeddb，僅供參考）
5,000 列預覽：xlsx 約 870ms、xls 約 680ms、csv 約 610ms；csv 提交 5,000 列約 1.3s；最壞情況（全同車頭）預覽 1.4s；5,000 筆匯出＋讀回：xlsx 168ms／xls 305ms／csv 11ms；.xls 65,535 筆匯出＋讀回約 9.9s（上限內可行，但慢）。

## 驗證通過的重要不變式
- 並行 10 路同一整列：恰 1 成功、9 個 IDENTICAL_ROW、無 unhandled rejection。
- 同預覽連按兩次提交（兩種模式）：名單不出現整列相同。
- 並行新增同車頭：「新造成的重複通知」恰出現一次。

## 待決問題（交製片人）
缺陷 1、2 是否退回工程部或記為已知限制；未定義行為 3（零寬姓名）與 1（長度上限）是否要補規則。
