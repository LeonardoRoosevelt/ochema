# 回報：2 — 架構部（資料契約更新，範圍調整後只做第 1 項）

## 完成內容
只更新 `docs/data-contract.md`。未動 `features/`、`schema.dbml`；未下載、安裝或執行任何外部程式碼（含 SheetJS）；交付要求第 2、3 項依製片人調整，改由使用者放入 tgz、工程部實測。

## 契約變更摘要
- 讀檔：`detectFormat` 判定順序（長度 0→EMPTY_FILE；PK→xlsx；D0CF11E0→xls；去 BOM 後長度 0→EMPTY_FILE；含 NUL→UNREADABLE；非合法 UTF-8→UNREADABLE＋`hint:'SAVE_AS_CSV_UTF8'`；其餘→csv）。`readWorkbook` 更名 `readImportFile`；三格式共用純函式 `gridToRawRows`（標題列＝第一個非空白列、標題 trim、少欄補空／多欄忽略、四格皆空的列略過、`fileRow`＝實際列號）。
- CSV：**自寫 RFC 4180（`csv.ts`），不經 SheetJS**；取捨表在 §4.2（保持字串、UTF-8 驗證本來就要自己做、SheetJS 的 raw/codepage 行為未驗證）。
- 匯出：`exportRecords(format='xlsx')`、`buildExportBytes(records, format)`、`exportFileName(now, format)`；MIME／副檔名表；CSV＝UTF-8 BOM＋CRLF＋必要時引號；xlsx／xls 為 `t:'s'` 文字格（xls 用 `bookType:'biff8'`）。
- 追溯表：補 26 個 `@api`（import 17、export 9）與 5 個 `@ui`；`@api` 87 個逐一核對缺漏 0。
- 吸收 B-1 建議 1–10（對照表在 §7.1）：測試 helper 可直接用 xlsx／手寫位元組；`kinds` 固定順序；標題 trim；全空白列定義；IndexedDB 交易注意；SAME_ID_DIFF_NAME 邊界；tgz 雜湊 `8dc73fc3…99fe8` 記入 §4.1（入庫時須 `shasum -a 256` 比對）。
- 更正：情境總數為 **141**（110＋31），產品部回報書的「+27／137」是計數誤差。

## 待工程部實測清單（§4.1，皆未驗證；備案已寫入契約）
T1 .xls 數字格 `cell.w`（備案 `XLSX.SSF.format`，不得默默退回 `String(v)`）；T2 .xls 中文與特殊字元；T3 .xls 寫出再讀回（前導 0、特殊字元、空表）；T4 前後空白往返／xml:space（僅影響測試 fixture；備案：fflate 改 XML 或改以 CSV／.xls 驗證）；T5 截斷 .xls 是否丟錯、有效空 .xls 能否產生與讀回（備案：CFB 磁區長度啟發式）；T6 PK＋雜訊／非 xlsx 的 ZIP；T7 `XLSX.write type:'array'` 回傳型別；T8 動態 `import('xlsx')` 在 vitest／Vite 與 bundle 大小；T9 `cell.w` 對文字格＝原字串。T1–T3 失敗且無備案屬範圍層級問題，工程部須停手回報。
另：先前階段的「已實測」結論（xlsx 的 `w`、`t:'s'` 往返、隨機二進位不丟錯、截斷 ZIP 丟錯、空表 `!ref`）證據未存檔，契約已註明，請工程部在測試中重現。

## 待決問題（§7.2）
- Q-A：DBML `varchar(n)` 長度無人實作（DBML 已鎖，契約暫定「僅文件參考」），是否解鎖改成不帶長度？
- Q-B：CSV 引號欄沒有收尾，暫定 `UNREADABLE`（嚴格）。
- Q-C：CSV 公式注入（`=`、`+`、`-`、`@` 開頭的姓名）；features 要求原樣，契約不轉義，是否接受？
- Q-D：Excel 直接開 CSV 會讓前導 0 消失；UI 是否加提示？
- Q-E：標題列取「第一個非空白列」而非固定第 1 列，是否同意？
- Q4（沿用）：同身分證不同姓名涉及的資料含該身分證下所有筆。
- Q-F：.xls 超過 65,536 列行為未定義（建議不處理）。
