# 回報：3a — 工程部（骨架＋step definitions 紅燈）

作者：資深開發者　日期：2026-11-09
範圍：只做到紅燈。未動 `features/`、`schema.dbml`、`scripts/bdd-dryrun.sh`、`docs/data-contract.md`。`src/` 裡沒有任何功能邏輯（只有型別、常數與丟 `not implemented: <函式名>` 的 stub，以及最小 App 殼）。

## 驗收對照

| 驗收標準 | 結果 |
|---|---|
| `scripts/bdd-dryrun.sh` exit 0 | **通過**（exit 0）。負向對照：暫時拿掉 `registerSearch` 後，腳本列出 `Missing steps…` 且判定失敗；已還原 |
| `.studio/evidence/red.txt` 存在，失敗皆為未實作類 | **通過**。245 個失敗步驟：244 個 `not implemented`、1 個斷言不成立（App 殼沒有名單）；`SyntaxError／Cannot find module／StepAble*／NotCalledError／ReferenceError／TypeError` 計數 0 |
| 141 情境全有 step、無空斷言 | **通過**（見下「驗證 step 不是空殼」） |
| `pnpm build` 在 stub 狀態成功 | **通過**：`tsc -b` 無錯；`vite build` 0.75 秒；PWA precache 15 項／238 KiB |

## 紅燈數字（`npx vitest run`，9 個測試檔）

- 步驟層級（vitest-cucumber 把每個 step 當一個 test）：共 1126 個 → **44 通過／245 失敗／837 跳過**。
- 情境層級：141 個標題，Scenario Outline 展開後 **248 個情境** → **245 個紅燈、3 個綠燈**。
- 44 個通過者：SheetJS 實測 21（`tests/sheetjs.test.ts`）、步驟綁定檢查 8（`tests/stepBinding.test.ts`）、建置情境 15 步（3 個情境完整綠燈：預先快取清單、無外部網址、manifest 與 service worker 註冊）。這三個情境檢查的是 `vite.config.ts` 與 `public/` 的設定，骨架本來就該完成，所以是綠的；不是空斷言（我用變異確認過會抓到：見下）。
- 失敗型態分布（步驟層級）：

| 型態 | 數量 | 說明 |
|---|---|---|
| `not implemented: resetDbForTest` | 210 | 幾乎所有碰名單的情境，第一步（「名單是空的」「名單上有…」）就停在這裡 |
| `not implemented: checkPlate` | 21 | field-validation 車牌 |
| `not implemented: checkIdNumber` | 13 | field-validation 身分證 |
| 斷言不成立 | 1 | `When 我開啟 App`：畫面只有「ochema」，找不到名單表格／空狀態 |
| 語法、匯入、step 綁定錯誤 | **0** | |

- 被「跳過」的 837 步是同一情境中失敗步驟之後的步驟（與 Cucumber 一致，由 `runFeature.ts` 的 `ctx.skip()` 實作），為的是不讓連鎖失敗灌水。
- 提醒：紅燈集中在 `resetDbForTest`，是因為 DB 一碰就停。實作 `db.ts` 後，失敗前緣會往後移，第一批實作會暴露一批新的紅燈；這是正常現象，不代表 step 有問題。

## 驗證 step 不是空殼（紅燈階段看不到的部分）

紅燈時絕大多數 Given 就失敗，後面的 When／Then 其實沒被執行過。為了不讓 step 的 bug 留到綠燈階段才爆，我在**拋棄式的暫存目錄**（scratchpad，不在專案內）寫了一份能過的資料層與一個最小 `<App/>`，跑整個測試：

- **1126／1126 全綠**（含 141 情境全部、建置情境、步驟綁定、SheetJS）。這證明 step definitions 可執行、參數綁定正確、fixture 造得出來。
- 變異測試（刻意弄壞暫存實作，看測試會不會抓到）：資料層 10 種，**8 種被抓到**（`cell.w` 改 `String(v)`、CSV 匯出沒 BOM、同身分證忽略姓名、照樣匯入把整列相同也匯入、xls 魔術數字錯、標題列號偏移、匯出反序、`checkPlate` 不去前後空白），存活 2 種（下一條）；UI 6 種，**抓到 5 種**（刪除免確認、編輯後清掉查詢、匯出只匯篩選、通知列出全部種類、身分證遮罩），存活 1 種（總覽導覽時不重算，但暫存實作每次寫入後都會重算，屬等價變異）。
- 存活的 2 個資料層變異（「格式錯誤列仍參與比對」「identical 列額外標 SAME_HEAD」）：後者是等價變異；前者是 **features 沒有涵蓋的規則**，見待決問題 3。
- 這份暫存實作**不是交付物**，沒有放進專案。綠燈階段的實作請照契約重寫。

## 專案結構

```
package.json / pnpm-lock.yaml / pnpm-workspace.yaml   Vite 7、React 19、idb、xlsx(file:vendor/xlsx-0.20.3.tgz)、vitest 5、vitest-cucumber 8
vite.config.ts      base '/ochema/'；PWA registerType 'prompt'；spaFallback 404.html
vitest.config.ts    jsdom、fake-indexeddb（setupFiles）、include tests/**/*.steps.ts 與 *.test.ts、testTimeout 30s
tsconfig*.json、index.html、.gitignore、.github/workflows/deploy.yml（照 BloomIn，測試通過才部署）
public/             favicon.svg、icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png（佔位，見待決 5）
src/main.tsx、src/App.tsx          最小殼；App 收 `download?: (file) => void`（可注入下載函式）
src/data/                          types.ts（型別與常數）＋ notImplemented.ts ＋ 契約開頭模組表的 10 個模組 stub
tests/steps/<feature>.steps.ts × 7 每個只有一行 runFeature('<feature>.feature')
tests/support/
  runFeature.ts   載入 feature、註冊全部情境與步驟、失敗後跳過、情境結束重置
  gherkin.ts      Scenario Outline 展開器（見設計決定 1）
  world.ts        每個情境一份的共用狀態（單例）
  ui.ts           UI 驅動器；檔頭是「畫面可及名稱契約」
  workbook.ts、csvFixture.ts   fixture 造檔（xlsx／xls／CSV／Big5／二進位／截斷）與匯出檔讀回
  build.ts        建置一次並讀 dist/（跑 vite build）；network.ts 網路防護
  stepLib/        全部 step definitions（按領域分檔）
tests/stepBinding.test.ts      每個步驟恰好符合一個 step definition，且沒有死 step
tests/sheetjs.test.ts          T1–T9 實測
```

### step 檔清單與情境數

| steps 檔 | feature 情境（標題） | 其中 @api／@ui | 展開後情境 | 步驟定義位置 |
|---|---|---|---|---|
| field-validation.steps.ts | 9 | 7／2 | 36 | stepLib/fieldValidation、records、common |
| duplicate-detection.steps.ts | 23 | 9／14 | 29 | stepLib/duplicates、records、common |
| record-management.steps.ts | 15 | 0／15 | 18 | stepLib/records、common |
| search.steps.ts | 7 | 0／7 | 11 | stepLib/search |
| offline-use.steps.ts | 10 | 4／6 | 10 | stepLib/offline、export、importApi |
| excel-import.steps.ts | 54 | 50／4 | 104 | stepLib/importApi、importUi、importFlow |
| excel-export.steps.ts | 23 | 17／6 | 40 | stepLib/export |
| **合計** | **141** | **87／54** | **248** | |

## 設計決定（需要你知道的）

1. **Scenario Outline 先在記憶體展開再載入。** vitest-cucumber 8 要求 Outline 的每個 `<變數>` 都出現在「步驟文字」裡（只看步驟標題，不看資料表、docstring），否則載入就丟 `ScenarioOutlineVariableNotCalledInStepsError`。已鎖定的 features 有 7 個 Outline 的變數只在資料表內（或有未使用的「說明」欄），**無法原生載入**。`tests/support/gherkin.ts` 把每個範例展開成獨立 Scenario（等同 Cucumber 的 pickle，標題為「原標題 ［範例 n｜值…］」），`features/` 檔案不動。附帶好處：step 內文都是具體值，不需處理 `<變數>`。
2. **同一組 step 給 7 個 feature 共用**（同一句話常跨 feature 出現），`tests/steps/*.steps.ts` 因此只有一行。情境由 feature 自己列舉，新增情境若沒對應步驟，載入時就失敗（dryrun 會抓）。
3. **同一句話前置與斷言的區分**：「名單上有以下資料：」在行動之前是建立資料、在 When 之後是斷言包含；以 World 的 `acted` 旗標區分。「名單上有 N 筆資料」在 UI 已開啟時，畫面列數與資料庫筆數兩邊都要對。
4. **步驟綁定檢查**：vitest-cucumber 遇到多個 pattern 同時符合時不報錯、悄悄取先註冊者。`stepBinding.test.ts` 要求每個步驟恰好符合一個 pattern，並檢查沒有死 step。
5. **建置情境**：在測試內跑一次 `vite build`（memoize），子行程強制 `NODE_ENV=production`（vitest 預設 `test` 會讓 PWA plugin 產出未壓縮的 sw.js，precache 解析會失敗）。「不依賴外部網址」掃的是**載入資源的參照**（HTML 的 src／href、CSS url()／@import、manifest），再加 JS 內字面值載入與常見 CDN 主機；不掃全部 `https://`，因為 React 的錯誤訊息字串含 `react.dev`。
6. **PWA 用 `registerType: 'prompt'`**（BloomIn 是 autoUpdate）：offline-use 要求「新版本取得後不會自動重新載入正在使用的頁面」。測試檢查 sw.js 沒有 `clientsClaim`、`skipWaiting` 只出現在 `SKIP_WAITING` 訊息處理器內、註冊腳本不含 reload。「資料庫不被清除」另以資料層驗證（寫入→關閉連線→重開→資料仍在，目前紅燈）。
7. **測試與 `src/` 的界線**：只有 `tests/support/` 引用 `xlsx`；`src/` 骨架沒有 import `xlsx`。
8. **測試環境補丁**：`<dialog>.showModal/close`、`matchMedia`、`scrollIntoView`。刻意**不**在全域 `afterEach` 清理畫面——每個 step 是一個 test，全域清理會在每步之後把 App 卸載；改在情境結束時由 `World.dispose()` 處理。

## T1–T9 實測（`tests/sheetjs.test.ts`，21 項全過；SheetJS 0.20.3，tgz SHA-256 與基準值一致 `8dc73fc3…99fe8`）

| # | 結果 |
|---|---|
| T1 | **通過**。xlsx 與 xls（biff8）：數字 7＋格式 `000` → `cell.w`=`"007"`；General → `"7"`。備案 `XLSX.SSF.format('000',7)`=`"007"` 也可用。限制：xls fixture 是 SheetJS 自己寫的，**沒有用 Excel 另存的真實 .xls 驗證** |
| T2 | **通過**。xlsx／xls 的 `李"美玲"`、`王,小明`、`歐陽・小明`、`ＫＬＰ` 原樣 |
| T3 | **通過**。biff8 往返：`0012-007`、`00-01`、`007` 保持文字（`t:'s'`）；空名單只有標題列 |
| T4 | **通過**。xlsx 與 xls 的 `" 929-X2 "`、`"   "` 往返皆保留空白，不需要 fflate 備案 |
| T5 | **部分**。(a) 截斷的 .xls：長度 512–2176 皆丟錯；但 2304、2944、3072、3328、3456 位元組處**讀回空工作表而不丟錯**（會被判 `EMPTY_FILE` 而非 `UNREADABLE`），只少 1 位元組（3583）則讀回完整資料。fixture 取 1024（確定丟錯）。契約備案的啟發式 `(長度−512)%512≠0` 攔得到 2304／2944／3328／3456，攔不到 3072（512 的整數倍），見待決 4。(b) 有效空 .xls：`!ref` 是 `'A1'`（**契約預期 undefined 有誤**），但沒有任何非空儲存格，`gridToRawRows` 仍會判 `EMPTY_FILE`；空 .xlsx 的 `!ref` 為 undefined，與契約相符 |
| T6 | **通過**。`PK\x03\x04`＋雜訊、截斷 30 位元組的真實 xlsx 皆丟錯（`Unsupported ZIP file`／`Unsupported ZIP encryption`） |
| T7 | **通過**。`XLSX.write(type:'array')` 回傳 `ArrayBuffer`（xlsx、biff8 皆是），`new Uint8Array(out)` 可用；jsdom 下讀取 Uint8Array 輸入正常 |
| T8 | **通過**。vitest（jsdom）下 `await import('xlsx')` 可用。實測 `vite build`：xlsx 獨立成一個 chunk **499.54 kB（gzip 161.55 kB）**，入口 chunk 1.18 kB。骨架目前尚未 import xlsx，precache 238 KiB；接上後 precache 約再增加 500 kB |
| T9 | **通過**。文字格的 `cell.w` 等於字串原樣（前導 0、全形字） |

T1–T3 皆通過，無需停手升級。

## UI 可及名稱契約（第二段前端必須滿足；完整版與註解在 `tests/support/ui.ts` 檔頭）

- 導覽：`link`「名單」「總覽（名稱可帶徽章數字）」「資料」。查詢：`textbox`「查詢」＋`button`「清除關鍵字」。
- 名單：`table`「車輛所屬名單」，cell 依序 車頭、車尾、姓名、身分證、標示、操作；標示格含「同車頭／同車尾／同身分證不同姓名」與「身分證警示：<原因>」；操作格有 `button`「編輯…」「刪除…」。空狀態文字「名單目前沒有資料」＋`button`「新增第一筆」「匯入 Excel」；無結果「查無符合的資料」。
- 表單：`form`「新增資料」／「編輯資料」，`textbox` 以「車頭／車尾／姓名／身分證」開頭，`button`「儲存」「取消」；擋下訊息放 `role=alert`（「「姓名」為必填」、「車頭 格式不合」＋「只接受大寫英文或數字、以單一連字號相連」、「與既有資料整列相同，未儲存」＋既有四欄）。
- 通知：`status` 名稱「重複與警示通知」（沒有新問題時不存在）。刪除：`dialog`「刪除這筆資料？」。
- 總覽：重複組 `group` 名稱「<種類> <值>」含「涉及 N 筆資料」與每筆的「編輯」鈕；警示 `group` 名稱「身分證警示 <姓名>」；無問題文字「目前沒有重複與警示」。
- 資料頁：`radiogroup`「匯出格式」（radio「.xlsx」預設／「.xls」／「CSV」）、`button`「匯出全部…」、`status` 內「已匯出 N 筆資料」、`button`「匯入 Excel」。匯入：file input 標籤「選擇 Excel 檔」；預覽文字「可新增 N 筆／與既有資料重複 N 筆／檔內重複 N 筆／格式錯誤 N 筆」；錯誤明細同一個 listitem／row 內有「檔案第 N 列」與原因；radio「略過重複」「照樣匯入」；`button`「確認匯入」；結果「已匯入 N 筆、略過 M 筆」；無法讀取時「檔案無法讀取」（Big5 另含「CSV UTF-8」），且不得有預覽統計、選項、「確認匯入」。
- `<App download?>`：下載函式可注入（簽名 `(file: {fileName, mimeType, bytes}) => void | Promise<void>`）。

## 待決問題

1. **匯入預設選項（IA 的 Q2）**：「在畫面上預覽並匯入」只寫「我確認匯入」，沒有選擇選項。step 照字面直接按「確認匯入」，所以 UI 必須在預覽時**預先選好一個選項**，否則該情境過不了。建議預選「略過重複」（較保守）。這是商業意圖，請裁決；若要求使用者必須明確選擇，則 features（已鎖定）需走 🧑‍⚖️ 修訂。
2. **UI 可及名稱是我定的**（上節）。導覽用 `link`、通知／總覽用 `status`／`group` 命名等都是我依 IA 與 ledger 做的選擇，沒有現成規範。請前端與設計部確認；若要改名，只需改 `tests/support/ui.ts` 與少數 stepLib 字串。
3. **features 沒涵蓋、契約卻有規則的行為**（變異測試證實目前沒有測試會抓到）：(a) 格式錯誤列「不當較前面的列」參與比對（契約 §3.5 分類演算法第 1 點；features 裡格式錯誤列恰好都在最後一列）；(b) CSV 引號欄沒有收尾 → `UNREADABLE`（Q-B）；(c) Q-E 的邊界：第 1 列空白、標題在第 2 列時回什麼（契約 §3.5.1 規則 1 的「第一個非空白列」與附錄 Q-E「固定第 1 列」互相矛盾，附錄雖勝出但正文沒改）；(d) Q-D（CSV 匯出的前導 0 提示）、Q-F（.xls 超過 65,536 列告知）沒有 @ui 情境；(e) 匯入預覽「整列相同不匯入」的**告知文案**沒有 @ui 情境（資料層行為已在 @api 驗證）。建議綠燈階段在 `tests/*.test.ts` 補單元測試，不動 features。
4. **截斷 .xls 偵測不完整**（T5）：SheetJS 對部分截斷長度不丟錯而讀回空表，契約備案啟發式也攔不全（例如 3072 位元組）。選項：接受降級（會顯示「檔案是空的」而非「無法讀取」，不會匯入錯誤資料）；或在 `detectFormat` 加 CFB 結構檢查。我沒有自行決定。
5. **圖示是佔位**：用 sharp 產生的幾何圖案（帳冊風格、不含文字），只為讓 manifest／precache 完整；正式圖示請設計部在第二段提供。
6. **PWA `prompt` 模式的後續**：第二段需要加「有新版本，重新載入」提示（`virtual:pwa-register` 的 `onNeedRefresh`）。一旦引入，`offline.ts` 對 `registerSW.js` 不含 reload 的靜態檢查要跟著調整（註冊程式碼會進入口 JS）。「更新時不中斷操作」仍須真機手動驗收。
7. **契約需回寫（我沒改契約）**：`db.ts` 新增 `closeDbForTest()`（契約只有 `resetDbForTest`）；App 的 `download` prop 與 `DownloadedFile` 型別。
8. **dryrun 腳本的盲點**（腳本已鎖定，沒動）：它的 grep 清單沒有 `ScenarioOutlineVariableNotCalledInStepsError`。若日後有人把展開器拿掉、改回原生 Outline，該錯誤會讓整個測試檔載入失敗，但 dryrun 可能仍 exit 0。建議製片人考慮把該錯誤名稱加進清單。
9. **沒有 git**：專案目錄尚未 `git init`，所以我沒有 commit（依你的「驗證通過才 commit」，紅燈本來也不該 commit；建議在使用者初始化版控後，以 `chore: scaffold red phase` 類型提交）。

## 產出檔案清單

- 設定：`package.json`、`pnpm-lock.yaml`、`vite.config.ts`、`vitest.config.ts`、`tsconfig.json`／`tsconfig.app.json`／`tsconfig.node.json`、`index.html`、`.gitignore`、`.github/workflows/deploy.yml`、`public/**`
- 骨架：`src/main.tsx`、`src/App.tsx`、`src/data/*.ts`（12 個）
- 測試：`tests/steps/*.steps.ts`（7）、`tests/support/**`（含 `stepLib/` 12 個）、`tests/stepBinding.test.ts`、`tests/sheetjs.test.ts`
- 證據：`.studio/evidence/red.txt`
