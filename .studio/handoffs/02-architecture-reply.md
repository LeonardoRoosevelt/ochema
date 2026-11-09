# 回報：2a 架構部（後端架構師）

## 完成內容
- `schema.dbml`：單一資料表 `vehicle_records`（本專案所有 `@table:` 只有它與 `none`）。
- `docs/data-contract.md`：資料層模組 API（TS 簽名）、DBML↔IndexedDB 對應、Excel 函式庫選型、追溯表（全部 `@api` 情境逐一對應；`@ui` 情境依檔案分組）、原因代碼一致性表。
- 驗證：`dbml2sql schema.dbml --postgres` 退出碼 0、輸出無 `ERROR`。

## 資料表與關鍵約束
`vehicle_records`：`id`（integer pk、autoIncrement）、`headPlate`、`tailPlate`、`ownerName`、`idNumber`（皆 not null）。
- unique 複合索引 `(headPlate, tailPlate, ownerName, idNumber)`：擋整列相同（資料層先查出衝突資料回報，unique 為最後防線）。
- 一般索引：`headPlate`、`tailPlate`、`idNumber`（找同車頭／同車尾／同身分證衝突）。
- IndexedDB：db `ochema` v1，store `vehicle_records`，`keyPath:'id'`、`autoIncrement:true`。
- 重複標示、身分證警示、總覽皆**不入庫**，讀取時計算（刪除／編輯後即時消失、重開仍在）。

## 設計取捨
1. **排序與「第一次出現」用 autoIncrement `id`，不建 createdAt**：沒有情境需要時間；編輯不改 id、刪除不重用、批次匯入同交易依列序 add，所以列表、匯出、匯入順序都由 id 決定。
2. **先 trim → 再格式檢查 → 再整列相同比對／寫入**：`" 929-X2 "` 與 `"929-X2"` 視為同一值，複合 unique 看到的永遠是 trim 後的值。比對 `===`，不分大小寫、不轉全半形。
3. **驗證順序**：INVALID → IDENTICAL_ROW → 寫入。
4. **存檔通知「只通知新造成」的實作規則**：新增＝全部衝突；編輯＝該種類的比對鍵有變（HEAD→headPlate、TAIL→tailPlate、ID→(idNumber, ownerName)）才通知。
5. **匯入分類**：格式錯誤列不參與比對 → 對既有有衝突＝與既有重複 → 否則對檔內較前面的非錯誤列（含自己被分為既有重複者）有衝突＝檔內重複 → 其餘可新增。可同時推得 A-pre-1 與 A-gate 修訂 3。
6. **`commitImport` 提交時重算分類**（用預覽帶的 `source` 對當下名單重算，單一交易），避免預覽後名單變動造成與 unique 衝突。
7. **「整列相同」列兩種選項都不匯入**以 `identicalTo`（對既有或檔內較前列四欄全同）判定，不靠 unique 例外處理。
8. **衍生資料不入庫**，不建 duplicate_flags 之類的表。

## Excel 函式庫：SheetJS CE `xlsx` 0.20.3
- 實測（暫存目錄，非專案）：SheetJS 讀數字 7＋格式 `000` → `w="007"`、General → `"7"`；文字 `"0012-007"` 往返不變。ExcelJS `cell.text` 對同一檔回 `"7"`（失敗）；read-excel-file 回數字 `7`（失敗）。
- 理由：唯一同時滿足「讀顯示文字」與「寫文字儲存格」；純 JS、可離線打包、Node 可測。
- 實測發現的陷阱：隨機二進位資料 SheetJS **不丟錯**（當文字解析）→ 必須先驗前 4 bytes 為 `PK\x03\x04`，否則回 `UNREADABLE`；截斷／偽造 ZIP 會丟錯，需 try/catch。
- npm 上的 `xlsx` 停在 0.18.5（有 CVE-2023-30533、CVE-2024-22363）；0.20.3 只在 `cdn.sheetjs.com` 發佈（我已下載並以 0.20.3 重跑顯示文字與空檔測試）。

## 待決問題（我沒有自己猜）
- **Q1 SheetJS 安裝來源**：接受 `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` 作為依賴（安裝期連外、執行期離線），還是把 tgz 納入 repo `vendor/`？不可用 npm 的 0.18.5（有 CVE）。另打包大小我未實測。
- **Q2 匯入檔中間的全空白列**：目前契約是略過且不計入資料列數（Excel 常有格式化的空白尾列）；features 沒寫。若要視為 REQUIRED 格式錯誤，須回產品部加情境。
- **Q3 檔案範圍**：目前只接受 `.xlsx`（ZIP 標頭），舊式 `.xls`、CSV 回「無法讀取」；多工作表只讀第一個；標題重複時取第一欄；0 byte 檔回 `EMPTY_FILE`（也可視為無法讀取）。features 未涵蓋，是否需要調整？
- **Q4 同身分證不同姓名組的成員**：目前＝該身分證下的所有筆（含與別人同姓名者），例如王小明×2＋王小名×1 → 1 組涉及 3 筆。features 的範例只有 2 筆，未釘住；若只要算「姓名不同的那幾筆」請裁示。
- **Q5 空白字元定義**：trim 採 JS `String.prototype.trim()`（含全形空白 U+3000、NBSP）。features 只寫「前後空白」，未區分種類。
- **Q6（給工程部／審查）**：`@table:none` 的離線建置檢查情境不屬資料層，追溯表標示為建置產物檢查，非資料契約的一部分。

## 產出清單
- `/Users/leonardoroosevelt/Project/ochema/schema.dbml`
- `/Users/leonardoroosevelt/Project/ochema/docs/data-contract.md`
- `/Users/leonardoroosevelt/Project/ochema/.studio/handoffs/02-architecture-reply.md`
