# 回報：3b — 工程部（前端 UI 綠燈）

作者：前端開發者　日期：2026-11-09

## 結果
- `npx vitest run`：16 個測試檔；1171 步驟層級 = **1167 通過／2 失敗／2 跳過**。
- @ui 情境 72 個（含 Outline 展開）：**70 綠、2 紅**；@api 176 與建置情境全綠；`tests/ui` 元件測試 9 個全綠。
- `pnpm build`：成功（tsc -b 無錯；vite build；precache 16 項）。chunk 超過 500 kB 的警告依製片人裁決接受。
- 未修改 tests/steps、tests/support、features、schema.dbml、src/data。

## 2 個紅燈：裁決與已鎖定情境互相衝突（證據）
情境「無網路時仍可預覽並匯入 Excel」與「所有操作都不對外發出網路請求」都會呼叫 `chooseImportMode('略過重複')`（tests/support/ui.ts:316、stepLib/offline.ts:156），但其匯入檔沒有任何重複。依裁決「無重複時不顯示選項」，畫面上沒有 radio「略過重複」，`findByRole` 逾時。
我照裁決實作，沒有私下放寬。解法請裁決：(a) 改 step（只在 radio 存在時才選）；(b) 無重複時仍顯示選項（預設「略過重複」，確認可用），但就違反「不顯示選項」。

## 實作摘要
- `src/App.tsx`（狀態、hash 路由、載入、通知）、`src/ui/**`：ListView／RecordTable／RecordForm／DeleteDialog／OverviewView／DataView／ImportView／Notice／Flash／Modal 等；樣式 `src/ui/styles.css` 沿用 ledger 的 token 與 CSS。
- S1–S6、C1–C4 完成（C5 不做）。表單與刪除確認用原生 `<dialog>.showModal()`；導覽只有一組 DOM（桌面頂部、手機底部分頁列由 CSS 轉換）；桌面表格與手機卡片共用 DOM 並明確標 ARIA 角色。
- 名單一次只畫 200 列，其餘「顯示更多」；查詢 100ms 去彈跳，組字期間不篩選；查詢條件存在 App 層，跨頁保留。
- 重複、警示、總覽皆由目前名單即時計算；每次切換畫面重讀資料庫。
- 微互動：L1 蓋章（存檔結果、匯入結果）、L3 結帳雙線（預覽加總相符）、L2 劃線；皆預設靜態最終狀態，動畫僅在 no-preference。
- 匯出：三種格式、CSV 前導 0 提示（Q-D）、.xls 超量：筆數預判並停用，且接住資料層 `XlsRowLimitError` 顯示「資料超過 .xls 上限…請改用 .xlsx」。
- 主題：跟隨系統／亮／暗，存 localStorage；index.html 內嵌小腳本首繪前套用。
- 雜項設定變更：`vitest.config.ts` 加入 `tests/**/*.test.tsx` 與 `esbuild.jsx:'automatic'`（元件測試需要）；`index.html` 加主題腳本。vite.config.ts 未動（manifest name 為「ochema 車輛所屬名單」、short_name ochema、theme_color #8E2418、registerType 'prompt'、無更新提示 UI）。

## 與設計／裁決的偏差
1. L2 劃線顯示在刪除後的結果訊息，不是留在已消失的列上（留幽靈列會讓 `rows()` 列數多出）。
2. UX 裁決 7（取消時若有未儲存變更要確認）：與情境「編輯後放棄修改」（按取消後表單必須立即關閉）衝突。折衷：「取消」鈕立即放棄；Esc 在有變更時不關閉、顯示提醒。
3. 查無結果時只留一個「清除關鍵字」（隱藏搜尋框內的 ×），避免同名按鈕兩個讓 `findByRole` 報多重符合。
4. 總覽的重複組一律展開（未做收合）。

## 已知限制
- App 圖示仍為佔位；沙箱無法啟動瀏覽器，未做實機／視覺驗證（版面、手機卡片、暗色、動畫皆只靠 CSS 與 jsdom 測試，**未目視確認**）。
- 匯出在 iPhone 走 `<a download>`，未接分享選單。
- 對比與 AA 沿用 brief 實算值，未重新量測。

## 元件測試（tests/ui）
Q-D 提示、.xls 超量（含資料層 reject）、匯入確認鈕在有重複時未選停用／選後可用、無重複不顯示選項、確認把所選方式交給 commitImport、整列相同告知。

## 待決問題
1. 上述 2 個紅燈（a 或 b）。
2. UX 裁決 7 的折衷是否接受。

## 製片人裁決後修正（取代上文相關段落）
- 匯入預覽一律顯示「略過重複」「照樣匯入」兩個 radio、不預選。無重複時「確認匯入」可直接按（視同略過重複）；有重複時未選前停用並說明原因。上文「2 個紅燈」與待決 1 作廢。
- UX 裁決 7 撤回：取消鈕與 Esc 都直接放棄並關閉表單（儲存中 Esc 不關）。待決 2 作廢。
- tests/ui/importView.test.tsx 同步：無重複時選項存在、不預選、確認可用。
- 結果：`npx vitest run` 16 檔、1171 步驟全數通過（0 失敗），@ui 72 情境全綠；`pnpm build` 成功。
- 待決問題：無。

## C 退回 1 修正（前端開發者，2026-11-09）

依 `.studio/evidence/a11y-review.md` 發現編號逐項對應。沙箱內無法啟動瀏覽器：以下全部只做到 jsdom 與程式碼層級驗證，**未做 axe、VoiceOver、實機鍵盤或視覺確認**，結論不等於「無障礙已通過」。

| 發現 | 修正 | 位置 |
|---|---|---|
| 1 | 總覽乾淨訊息 class 由 `clear` 改為 `ov-clean`，不再套用查詢框清除鈕的 44×44 樣式 | OverviewView.tsx |
| 2 | Modal 關閉時若觸發點已消失（刪除後、空名單新增第一筆後）改把焦點送到畫面標題（`[data-view-heading]`，h2 加 `tabIndex=-1`）。同時修一個測試抓到的缺陷：Safari 點按鈕不會聚焦，`activeElement` 是 `<body>`，原本會把 body 當觸發點還焦點（等於沒還），現改為視同無觸發點。匯入各階段（選檔→解析→預覽→結果）切換後焦點移到匯入標題（停在選檔畫面的失敗除外，檔案輸入還在） | Modal.tsx、ImportView.tsx、各 View 的 h2 |
| 3 | 切換畫面時 `document.title` 設為「名單／總覽／資料／匯入 — ochema」，並把焦點移到新畫面標題；首次載入不搶焦點。註：實際標題元素是各畫面的 h2（h1 是全站 ochema 品牌） | App.tsx |
| 4 | 常駐 `aria-live="polite"` 容器、內容後填：C1 Notice（`data-live=notice`，Notice 自身 `aria-live=off` 避免重複朗讀，仍保留 role=status＋名稱供測試契約）、總覽乾淨訊息、匯入（解析中／空檔／結果）、載入中 | ListView、Notice、OverviewView、ImportView |
| 5 | 摘要改用「送出時快照」，輸入中不變動；欄位底下錯誤仍即時更新（非 alert）；全部改正後摘要收起（移除不會播報）。摘要保留 `role=alert`（測試契約 `tests/support/ui.ts` 要求） | RecordForm.tsx |
| 6 | 新增 `.btn:disabled` 樣式；「確認匯入」與「匯出（.xls 超限）」改用 `aria-disabled`（虛線框）＋ onClick 防呆，按鈕可聚焦，`aria-describedby` 的原因說明因此讀得到。busy 狀態仍用原生 `disabled` | ImportView、DataView、styles.css |
| 7 | `html{scroll-padding-*}`（手機 top 170px／bottom 150px，桌面 16px） | styles.css |
| 8 | Flash 加「關閉」鈕（放在 live 容器外，不被多念）；hover／焦點在訊息內時暫停 8 秒計時；桌面 `position:sticky`，手機固定在底部導覽與浮動鈕之上 | Flash.tsx、styles.css |
| 9 | 匯入預覽小表格補明確 ARIA role（table／rowgroup／row／columnheader／cell） | ImportView.tsx |
| 10 | `.tablescroll` 加 `tabIndex=0`、`role=region`、`aria-label` | ImportView.tsx |
| 11 | 匯出提示放進常駐 live 容器；CSV 提示 id 併入 CSV radio 的 `aria-describedby` | DataView.tsx |
| 12 | 身分證警示提示放進常駐 live 容器 | RecordForm.tsx |
| 13 | 主題鈕 `aria-label="暗色主題"`＋`aria-pressed`（可見字「主題」包含在名稱內，符合 2.5.3） | App.tsx |
| 14 | `.strike` 透明度 .62 → .78（含動畫終點） | styles.css |
| 15 | 表格列加 `aria-rowindex`（標題列 1、資料列 2 起），與 `aria-rowcount` 一致 | RecordTable.tsx |
| 資料層新錯誤 | 接住 `CellTooLongError`（以 `name` 判斷，同 `XlsRowLimitError`），顯示「有資料超過 Excel 儲存格上限，請改用 CSV 匯出」，不顯示「匯出失敗」；切換格式時清除 | DataView.tsx |

### 未修（附原因）
- 15 中「form 與 dialog 重複命名」：未修。`tests/support/ui.ts` 以 `getByRole('form', { name: '新增資料' })` 找表單，form 一旦拿掉名稱就不再是 form role，會讓受保護的 BDD 步驟全部失敗；改拿掉 dialog 的名稱則對話框變成無名稱，對讀屏更差。需測試部同意改契約才能動。
- 15 中 StrictMode 開發模式 Modal 焦點雙跑、`forced-colors`／`prefers-contrast`、`autocomplete`：報告原判定為僅開發環境／無法在沙箱確認／不適用，未動。
- 5 的 `role=alert` 與焦點移動在摘要首次出現時仍可能念兩次（契約要求 alert），需 VoiceOver 實測。

### 新增測試
`tests/ui/a11y.test.tsx`（17 項）：刪除後與空名單新增第一筆後焦點在名單標題（不是 body）、取消編輯焦點還原觸發按鈕、切換分頁後焦點在 h2 且 title 改變（首次載入不搶焦點）、Notice／總覽／匯出提示的 live 容器在內容出現前已存在且前後為同一節點、總覽無 `.clear`、摘要輸入中不變且為同一節點／全改正後收起、.xls 超限按鈕 aria-disabled 可聚焦且說明關聯且點了不匯出、Flash 關閉／hover 暫停／focus 暫停／收掉後不殘留暫停、主題鈕 aria-pressed、aria-rowindex、`CellTooLongError` 顯示改用 CSV。
同步修改 `tests/ui/dataView.test.tsx`、`tests/ui/importView.test.tsx`：`disabled` 斷言改為 `aria-disabled`，並加「停用鈕可聚焦、說明關聯、點了不送出」。

### 驗證
- `scripts/bdd-dryrun.sh`：無缺 step／缺情境。
- `pnpm build`：成功。
- `npx vitest run`：1369 通過、2 失敗、11 todo。2 項失敗皆在 `tests/qa/import-export-scale.test.ts`，屬資料層（資深開發者範圍）：xlsx 姓名內 CRLF 往返、「32,768 字元姓名」特性紀錄因 `CellTooLongError` 上線而改變結果。UI 相關 @ui 情境與 `tests/ui` 全綠。
- 第一次全套跑時另有 3 項因機器負載逾時（建置情境 30 秒、.xls 65,535 筆 68 秒），build 完成後重跑已消失。
