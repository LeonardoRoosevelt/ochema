# 回報：3 — 工程部（欄位改名同步）

## 結果
- bdd-dryrun：exit 0、無輸出（無缺 step／缺情境／缺 steps 檔）
- vitest（序列）：21 檔全過，1377 passed｜10 todo（0 failed）
- `pnpm build`：成功（tsc -b + vite build，PWA precache 16 entries）
- `node --check scripts/evidence.mjs`：通過
- evidence.mjs 只做語法檢查與字串同步，沙箱不能開瀏覽器，**未實跑**。

## 改動檔案
- src：data/types.ts（COLUMN_TITLES 與註解）、ui/labels.ts、ListView、RecordTable、OverviewView、ImportView、Notice、data/validation.ts（註解）、ui/styles.css（版面）。內部欄位名（headPlate…）與 DBML 未動。
- tests：steps 文字由 features 驅動，step 定義字串、support/**（ui.ts、world、workbook、stepLib/*）、data/**、qa/**、ui/**、sheetjs.test.ts 同步新用詞。
- docs/data-contract.md、README.md、design/ia.md、scripts/evidence.mjs（選擇器、HEADER、fixture 標題列）同步。
- 未動 features/、schema.dbml。

## 測試改動（授權範圍內，未放寬斷言）
- `tests/support/stepLib/importApi.ts`「預覽不接受這份檔案，並指出缺少欄位標題「{any}」」：新情境一次列四個標題（`」、「` 分隔）。原本單標題 `toContain` 會失敗；改為逐一 toContain，且多標題時 missing 必須與列出者**恰好相同（排序後 toEqual）**。單標題行為不變，只更嚴。
- `tests/data/readFile.test.ts` 新增單元測試：舊標題列（車頭、車尾、姓名、身分證）→ MISSING_HEADERS，missing 為四個新標題。
- 重複種類名稱依 features：同車頭車號、同車斗車號、同駕駛身分證不同姓名（姓名不加「駕駛」）。tests/support/ui.ts 的 regex 已對齊。

## 自查（rg 舊詞）
`rg -n "(?<!駕駛)姓名|車尾|車頭(?!車號)|(?<!駕駛)身分證"` 於 src tests scripts docs README.md design/ia.md，僅剩：
1. 重複種類名稱「同駕駛身分證不同姓名」——features 定案的正式名稱，故意保留「姓名」（src/ui/labels.ts、ImportView 說明、tests、docs、ia.md、evidence.mjs）。
2. docs/data-contract.md §203、§490 的「不同駕駛姓名」為說明性散文，非 UI 字串。
3. 新增的舊標題拒收單元測試（readFile.test.ts）刻意含舊詞「車頭、車尾、姓名、身分證」。
- 程式內部欄位名／代碼（headPlate、tailPlate、ownerName、idNumber、SAME_HEAD…）保留。
- features/ 內的舊詞（舊標題拒收情境）屬核可需求，未動。
- 「舊式居留證格式」非欄位名，保留。

## 版面調整
- 手機（≤767px）卡片：車頭車號／車斗車號仍 2 欄並排，標籤 .75rem，4 字可容納，不用改。駕駛姓名、駕駛身分證各佔整列，不擠。
- 匯入預覽 `.grid.mini` 的 `td::before` 標籤 `min-width` 4.5em→6em，容納「駕駛身分證」（5 字＋字距），避免溢出／值不對齊。這是唯一 CSS 改動。
- 桌面表頭 6 欄：th 為 .8125rem、可換行，未改。
- 未能以 390 寬實機截圖驗證（沙箱不能開瀏覽器），僅依 CSS 推算；建議製片人／QA 於 390 寬看一次手機卡片與匯入預覽。

## 待注意
- 第一輪 vitest 曾出現 search.steps「在查詢結果中編輯後，查詢條件保持」失敗一次（結果含「李美玲」）；當時 ui.ts regex 尚有一處誤改（「不同駕駛姓名」），修正後連跑兩次全綠。不確定該次失敗是否純由 regex 引起，未做獨立重現，故在此如實記錄。

## 間歇失敗調查
**根因：step 時序，不是 App 缺陷，也與改名無關。** 「我查詢了 "王"」的 Given 只等輸入框值生效（`ui.search`）；名單篩選由 `useKeyword` 防抖 100ms 後才套用 `applied`。後續編輯（開表單、填、存）在快機器上可在 100ms 內完成，Then「結果仍依 "王" 篩選」立即斷言時 `applied` 還是空字串，名單顯示全部資料（含李美玲），故失敗。與我前一段誤判「regex 誤改造成」不同，已更正。
**證據：** 單獨重跑 `tests/steps/search.steps.ts` 20 次：修前失敗 15/20（75%，皆同一情境同一斷言）；修後 0/20。
**修法：** 只改 `tests/support/stepLib/search.ts` 的 Then：把原本的逐列斷言（每列含關鍵字、至少一列）包進 `waitFor`（timeout 2000ms）。條件本身一字未放寬；輸入框值保持的斷言仍立即檢查。
**為何不是掩蓋缺陷：** 100ms 防抖是 IA 規定的設計（≤150ms），未篩選的短暫畫面只存在於使用者按下關鍵字後的防抖窗內，編輯存檔不會重設 `applied`（keyword 狀態在 App 層，onSaved 只 refresh/關表單）。waitFor 逾時仍失敗，因此若存檔後最終畫面不是篩選結果，測試照樣紅；且下一步「結果列出車頭車號為 929-X2、5566-AB」同樣驗證最終畫面。未新增 tests/ui（無 App 缺陷可抓）。
**修後驗證：** 全套 3 次皆 1377 passed｜10 todo｜0 failed；bdd-dryrun exit 0 無輸出；`pnpm build` 成功。未留任何背景 vitest／build 行程。
