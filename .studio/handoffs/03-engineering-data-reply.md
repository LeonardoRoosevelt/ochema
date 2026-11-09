# 回報：3b — 工程部（資料層綠燈）

作者：資深開發者　日期：2026-11-09
範圍：實作 `src/data/**` 全部模組、新增 `tests/data/*.test.ts`、回寫 `docs/data-contract.md`。未動 `src/App.tsx`、`src/main.tsx`、`src/ui/**`、`tests/steps`、`tests/support`、`features`、`schema.dbml`。

## 驗收對照

| 驗收標準 | 結果 |
|---|---|
| 所有 `@api` 與建置情境綠、`tests/data/*.test.ts` 綠 | **通過**。@api 展開後 176 個情境全綠（含 4 個建置／offline 情境）；單元測試 35 個全綠 |
| `pnpm build` 成功 | **通過**（tsc -b 無錯；vite build 0.48 秒；precache 15 項／238 KiB） |
| 沒改 tests/steps、tests/support、features、schema.dbml | **通過** |

## 測試數字（`npx vitest run`，14 個測試檔）

- 步驟層級：1161 個 → **931 通過／72 失敗／158 跳過**（1126 個原有步驟＋35 個單元測試）。
- 情境層級：248 個展開情境 = **@api 176（全綠）＋@ui 72（全紅）**。72 個失敗的錯誤訊息全是同一個：App 殼沒有名單（「名單頁沒有載入完成」），即前端尚未交付；沒有任何資料層錯誤、unhandled rejection。@ui 數字由 features 標籤獨立計數核對（api 176／ui 72）。
- 單元測試 35 個：`csv`（10）、`readFile`（8）、`importer`（7）、`records`（5）、`export`（5，含 2 個 65k 筆的慢測，約 數秒）。

## 單元測試覆蓋的契約規則（features 未涵蓋者）

| 規則 | 檔案 |
|---|---|
| 格式錯誤列不參與比對（不當較前面的列、也不造成整列相同） | importer |
| CSV 引號未收尾 → `CsvError`／`UNREADABLE`（Q-B）；parseCsv／serializeCsv 規格與往返 | csv |
| Q-E：標題固定第 1 列（空白首列→`MISSING_HEADERS`；全空→`EMPTY_FILE`；xlsx `!ref` 不從 A1 起） | readFile |
| `kinds` 固定順序（含不受既有資料順序影響） | importer |
| .xls 超過 65,536 列 → `XlsRowLimitError`；剛好在上限成功且最後一筆完整；xlsx／csv 不受限（Q-F） | export |
| IndexedDB `ConstraintError` 轉 `IDENTICAL_ROW`、不產生 unhandled rejection（新增與編輯）；之後 DB 仍可寫入 | records |
| `resetDbForTest` 在連線仍開著時不卡住；`closeDbForTest` 不刪資料、id 不重用 | records |
| 提交時以目前名單重算（預覽後名單已變）；`imported+skipped+formatErrorsNotImported=total`、id 順序＝檔案列序 | importer |

**變異驗證**（刻意弄壞實作看測試是否失敗）：8 種中 7 種被抓到——移除 `tx.done` 的 reject 處理、格式錯誤列參與比對、CSV 未收尾不丟錯、kinds 順序、Q-E 改回「第一個非空白列」、移除 .xls 上限、提交不重算。**存活 1 種**：`resetDbForTest` 不先 close 再 delete——因為 `getDb` 的 `blocking` 處理會讓出連線，所以刪除不會卡住，行為上等價；「先 close」是雙重保險，測試無法區分，我沒有硬湊測試。實作已還原並確認與備份一致。

## 實作摘要與設計決定

- `validation`／`duplicates`／`search`／`csv`／`fileFormat`／`excelRead`／`importer`：照契約逐項實作；純函式不碰 IDB。
- `records.save()`：新增與編輯共用單一 readwrite 交易，交易內只 await IDB 請求（SheetJS 等一律在開交易前）；`tx.done` 立即掛 noop catch，ConstraintError 轉 `IDENTICAL_ROW`（重讀最新名單取得 existing）；順序 INVALID → NOT_FOUND → IDENTICAL_ROW → 寫入。
- `commitImport`：單一交易、對 `preview.source` 重算分類；所有 `add` 依檔案順序發出後 `Promise.all`，id 順序＝列序。
- `buildPreview`：檔內比對借用 `VehicleRecord` 形狀（id＝fileRow）重用 `findConflicts`／`findIdenticalRow`，避免兩份比對邏輯。`inFileConflicts` 對每列都計算；`kinds` 依分類取自既有或檔內的衝突。
- `excelRead`：xlsx／xls 格從第 1 列第 A 欄起讀，使「標題列固定第 1 列」與 `!ref` 無關。
- 刪除 `src/data/notImplemented.ts`（已無人引用）。
- 沒有 git，未 commit（建議使用者初始化後以 `feat(data): implement data layer` 提交）。

## 契約變更（已寫入 `docs/data-contract.md` 末尾「綠燈階段實作回寫」）

1. `db.ts` 新增 `closeDbForTest()`。
2. `excelWrite.ts` 新增 `XLS_MAX_ROWS`、`XlsRowLimitError`（`rows`、`limit`）；`buildExportBytes(…, 'xls')`／`exportRecords('xls')` 在超過 65,536 列（含標題）時**丟錯**。原因：實測 SheetJS 超過上限只在 console 警告並默默截斷（靜默遺失資料）。**前端必須接住並顯示「請改用 .xlsx」**，否則 `exportRecords('xls')` 的 rejection 會變成 UI 的未處理錯誤。
3. `readImportFile`／`buildExportBytes` 維持同步，故 xlsx 為靜態 import（與 §4.1 項 4 的動態載入建議不同）。
4. T5 補充：有效空 .xls 的 `!ref` 為 `'A1'`，結果仍 `EMPTY_FILE`。

## 待決問題

1. **xlsx 靜態 import 的 bundle 大小**：目前 build 的入口仍是 222 kB，因為 App 尚未 import 資料層；前端接上後 xlsx（約 500 kB／gzip 160 kB）會進主 bundle，可能出現 Vite 的 chunk 大小警告，且拖慢首次畫面（離線 precache 不受影響）。若要動態載入，須把 `readImportFile`／`previewImport` 路徑與 `buildExportBytes` 改成 async（契約簽名變更，前端要配合）。請製片人裁決是否值得。
2. **前端需處理 `XlsRowLimitError`**（見契約變更 2）；並在 CSV 匯出旁顯示 Q-D 前導 0 提示（製片人已裁決，屬 UI）。
3. **截斷 .xls 偵測**：依製片人裁決接受降級，未加結構啟發式；仍是已知限制（部分截斷的 .xls 會顯示「檔案是空的」而非「無法讀取」，不會匯入錯誤資料）。
4. **`resetDbForTest` 先 close 的存活變異**（見上）：僅供知悉，不需處理。
5. 關於 @ui 72 個紅燈：完全依賴前端交付；我無法在資料層驗證 UI 可及名稱契約。

## 產出檔案

- `src/data/`：`validation.ts`、`duplicates.ts`、`search.ts`、`db.ts`、`records.ts`、`csv.ts`、`fileFormat.ts`、`excelRead.ts`、`excelWrite.ts`、`importer.ts`（`types.ts` 未動；`notImplemented.ts` 已刪）
- `tests/data/`：`csv.test.ts`、`readFile.test.ts`、`importer.test.ts`、`records.test.ts`、`export.test.ts`
- `docs/data-contract.md`（末尾新增附錄）

## C-1 建議修正

依審查單 .studio/reviews/C-1.md 的建議 1、2、5、7 處理（外科手術式，未動 features/、schema.dbml、tests/steps/**、tests/support/**）。

1. 建議 1：tests/stepBinding.test.ts 新增「Outline 展開器忠實度」，對每個 feature 斷言 `expandOutlines().expandedScenarioCount` ＝ 非 Outline Scenario 數＋所有 Examples 資料列數（獨立數 feature 文字）。變異驗證：暫時讓展開器少跑最後一列（`tableLines.slice(1, -1)`），6 個 feature 的此測試全部失敗；已還原（diff 一致）。
2. 建議 2：src/data/excelRead.ts 的 sheetToGrid 改為只走訪工作表實際存在的儲存格鍵（排除 `!` 開頭），顯示文字／空白／列號規則不變；缺的列不產生（gridToRawRows 本就略過空列、列號取自 fileRow）。tests/data/readFile.test.ts 新增：宣告 A1:D1000000 但只有 2 列的 xlsx，readImportFile < 500ms 且結果正確。
3. 建議 5：src/ui/DataView.tsx 改為 import excelWrite 的 XLS_MAX_ROWS，刪除重複定義。副作用：tests/ui/dataView.test.tsx 原本從 DataView 匯入該常數，改從 excelWrite 匯入，且其 vi.mock 改用 importOriginal 保留 XLS_MAX_ROWS（否則 mock 缺此匯出）。
4. 建議 7：rg 確認 getRecord／getOverview 在 src、tests 皆無呼叫端，已刪除；docs/data-contract.md 對應兩行標註「已移除」（附錄對照表中的提及未改）。workbox-window 無任何 import，已從 package.json 移除並 pnpm install 更新 lockfile。

結果：scripts/bdd-dryrun.sh 通過（exit 0）；`npx vitest run` 16 檔、1179 測試全過（原 1171）；`pnpm build` 成功，`tsc -b` 無錯誤，precache 16 項。

## C 退回 1 修正（資深開發者，2026-11-09）

### 缺陷 1：.xlsx 姓名內 CRLF 讀回變 LF —— 確認無法在 src/data 修正
- 證據：SheetJS（xlsx.mjs）`unescapexml(text, true)` 對 xlsx 所有字串讀取路徑（sharedStrings、inlineStr、`<v>`）在解開 XML 跳脫之後一律 `replace(/\r\n/g, "\n")`。我實測寫端把 `\r` 寫成 `_x000D_`：`"王\r\n小明"` 讀回仍是 `"王\n小明"`（`&#13;` 同理）；單獨 `\r`、單獨 `\n`、`\n\r` 可還原。寫端任何轉義都被讀端的 `\r\n→\n` 抵消。
- 未改測試；`tests/qa/import-export-scale.test.ts`「xlsx：姓名內含 CRLF…」維持紅燈（已確認是 SheetJS 限制）。csv、xls 通過。
- 契約已把它記為 §3.6 往返還原的已知限制。若製片人要根治，選項：(a) 自行解 zip＋解析 sheet XML（成本高、風險高）；(b) 儲存時把姓名的 CRLF 正規化為 LF（等於改輸入規則，需裁決）；(c) 接受限制。

### 缺陷 2：超長欄位的匯出
- 新增 `CellTooLongError`（`src/data/excelWrite.ts`）：欄位 `recordId: number`、`field: FieldKey`、`length: number`、`limit: number`、`format: 'xlsx' | 'xls'`；`name='CellTooLongError'`；訊息「第 N 筆的「姓名」有 L 字元，超過 .xlsx 儲存格上限 32767，請改用 CSV 匯出」。另匯出常數 `CELL_MAX_CHARS = 32_767`、`XLS_CELL_MAX_CHARS = 255`。`buildExportBytes`／`exportRecords` 在 xlsx／xls 時預檢（依 id 升冪、欄序第一個違規者）；CSV 不受影響；不新增輸入長度規則。
- **額外發現（重要）**：.xls 的上限實際是 **255**，不是 32,767。SheetJS BIFF8 寫端 `String(cell.v).slice(0,255)`（xlsx.mjs 約 22393 行），任何 >255 字元的格在 .xls 匯出會**靜默截斷**（實測 256～32,767 字元讀回都只剩 255）。這是比缺陷 2 更隱蔽的資料遺失，違反往返還原；因此 xls 的上限定為 255，同樣丟 `CellTooLongError`（`format:'xls'`、`limit:255`）。UI 訊息「有資料超過 Excel 儲存格上限，請改用 CSV 匯出」對兩種格式皆適用。
- 測試：`tests/data/export.test.ts` 新增 5 個（xlsx／xls 各：超限丟錯且 recordId／field／length／limit／format 正確；剛好等於上限成功且讀回完整；車牌超長指出欄位、CSV 往返不變）。
- 對 `tests/qa` 的差異：「[特性紀錄] 姓名 32,768 字元…匯出 xlsx」原斷言 `/^throws:Text length must not exceed 32767 characters/`，現在丟的是 `CellTooLongError`，此測試**預期變紅**（該測試自己標註「未經核可」）。需測試部把斷言改成 `CellTooLongError`；我沒有改 tests/qa。

### 偶發失敗調查
- 連跑全套 5 次（我修改前後各狀況見下，期間前端開發者同機並行改 UI、跑測試與建置）：
  - 第 1 次：4 失敗＝2 個 QA 紅燈＋2 個 `tests/ui/importView`（前端施工中，非資料層）
  - 第 2 次：2 失敗（僅 2 個 QA 紅燈）
  - 第 3 次：7 失敗：另含 `export.test.ts`「.xls 剛好 65,535 筆」逾時 60s、`import-export-scale` 5,000 列 xlsx／xls 逾時 30s、`offline-use` 建置情境（`ENOENT dist/sw.js`、build 逾時）
  - 第 4 次：2 失敗（僅 QA 紅燈）
  - 第 5 次：4 失敗：另含 5,000 列 xls 逾時、.xls 65,535 筆逾時
- 結論：**重現，原因是 CPU 競爭導致逾時**——大檔測試（5,000～65,535 列，單獨跑 .xls 65,535 筆約 10 秒）在 vitest 預設全核心平行、且同機還有其他 vitest／vite build 時被拖慢超過 30 秒；建置情境另外是多行程共用 `dist/`（其他人同時 `vite build` 會清掉／半成品 dist，出現 `ENOENT dist/sw.js`、precache 缺 index.html）。失敗的測試每次不同，單獨重跑皆通過，符合此診斷。
- 修法（`vitest.config.ts`，未動受保護測試）：`testTimeout` 30s→60s、`maxWorkers: 4`（限制同時跑的重型檔數）。修後連跑 3 次：2 次只剩 2 個預期紅燈、1 次含他人並行施工造成的 offline-use（dist 競爭）與 a11y 失敗。**未解決的部分**：多個行程同時 build 到同一個 `dist/` 的競爭無法靠 vitest 設定解決（需序列化工作或讓建置情境用獨立 outDir，但 tests/support 受保護）；此為環境並行造成，單人序列執行時不會發生。

### 契約更新
`docs/data-contract.md` 末尾新增「附錄：C 退回 1 修正」：`CellTooLongError`／常數／xls 255 上限原因、CRLF 已知限制與 SheetJS 證據。

### 驗證結果
- `scripts/bdd-dryrun.sh`：exit 0。
- `pnpm build`：成功（tsc -b 無錯誤，precache 16 項；僅 Vite chunk 大小警告，源自 xlsx 靜態 import，已於先前列為待決）。
- `npx vitest run`（最後兩次，序列、無他人干擾）：21 檔，1369 通過、**2 失敗**、11 todo，共 1382。兩個失敗都在 tests/qa（受保護）：
  1. CRLF 往返（SheetJS 無法修，見上）
  2. 「[特性紀錄] 32,768 字元」斷言舊錯誤訊息（待測試部改為 `CellTooLongError`）
  因此「0 失敗」目前無法達成，需製片人／測試部裁決這兩個測試。
