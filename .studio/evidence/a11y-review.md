# 無障礙審核報告：ochema

## 審核概覽
**範圍**：`index.html`、`src/App.tsx`、`src/ui/**`（含 `styles.css`）
**標準**：WCAG 2.2 Level AA
**日期**：2026-11-09
**審核員**：無障礙審核員
**方法**：僅程式碼層級靜態審核（沙箱內無法啟動瀏覽器）。**未**做 axe、Lighthouse、VoiceOver、實機鍵盤、縮放測試——這些全部列在文末「需在 axe／實機確認」。因此本報告的結論是「程式碼層級部分合規」，**不能**當作無障礙已通過的證明。
**對比計算**：依 `styles.css` 第 1–4 行的 token，以 WCAG 相對亮度公式算出（腳本在 scratchpad，未入專案）。

## 總結
發現 15 項：嚴重 0／重要 1／中等 7／輕微 7。

- 整體基礎紮實（原生 `<dialog>`、label 關聯、`aria-invalid`／`aria-describedby`、圖示＋文字、44px 目標、reduced-motion、全部 token 對比達標）。
- 最大風險是一個疑似 CSS 類別名稱衝突（發現 1），會把「目前沒有重複與警示」訊息縮成 44×44px；其餘集中在**焦點管理**與**動態訊息播報**，這兩類只有真實螢幕閱讀器能定論。

## 發現的問題

### 1. 「總覽乾淨」訊息被 `.clear` 按鈕樣式縮成 44×44px
**WCAG**：1.4.10 重排（AA）、1.4.4 調整文字大小（AA）；可能同時影響 1.4.3（文字溢出疊在其他內容上）
**嚴重度**：重要
**位置**：`src/ui/OverviewView.tsx:51`（`className="msg msg-ok clear"`）與 `src/ui/styles.css:61`（`.clear{display:grid;…width:44px;height:44px;border:0;…}`）
**說明**：`.clear` 本來是查詢框的「清除關鍵字」按鈕（ListView.tsx:69）。同名 class 加在總覽的成功訊息 div 上，會套用固定寬高 44px；`.msg-ok`（styles.css:237）只覆寫 border／background，不覆寫寬高。推論結果：沒有任何重複時，使用者看到的是一個 44px 方塊，內文溢出。無法在沙箱內以瀏覽器驗證，標為「高度疑似」。
**修復建議**：把總覽那個 class 改名（例如 `ov-clean`），或把按鈕樣式改成 `button.clear`。
**驗證**：實機開 `#/overview`、名單無重複，量測訊息方塊寬度；放大 200%／400% 再看。

### 2. 刪除（及其他讓觸發按鈕消失的操作）後焦點掉到 `<body>`
**WCAG**：2.4.3 焦點順序（A）
**嚴重度**：中等
**位置**：`src/ui/Modal.tsx:27`、`src/App.tsx:97-109`、`src/ui/ListView.tsx:138`、`src/ui/ImportView.tsx:217-228`
**說明**：Modal 關閉時只在 `trigger?.isConnected` 時還焦點。刪除流程是先 `await refresh()`（該列已從 DOM 移除）再關對話框，所以觸發的「刪除」按鈕已不在 DOM，焦點歸零，鍵盤與讀屏使用者要從頁首重新 Tab。同類情形：空名單時按「新增第一筆」存檔後該按鈕消失（ListView.tsx:138）；匯入選檔後 file input 被卸載（ImportView.tsx:217，picking 結束）。
**修復建議**：觸發點消失時改把焦點送到合理的後備（例如 `#main`、查詢框、或剩餘清單的第一個列按鈕／下一列）；匯入各階段切換後把焦點移到該階段的 `h2`（加 `tabIndex={-1}`）。
**驗證**：純鍵盤走「刪除一筆」；刪除後按 Tab，第一個停點應在合理位置而非頁首。

### 3. 路由切換沒有焦點移動、沒有播報、標題不變
**WCAG**：2.4.3 焦點順序（A）、4.1.3 狀態訊息（AA）、2.4.2 頁面標題（A，SPA 同標題）
**嚴重度**：中等
**位置**：`src/App.tsx:60-61`、`src/ui/router.tsx:34-41`、`index.html:26`
**說明**：點「名單／總覽／資料」只改 state 與 hash，焦點留在已被替換內容的導覽連結上，讀屏不會得知畫面已換；`document.title` 永遠是「ochema 車輛所屬名單」。
**修復建議**：路由變更後設 `document.title`（如「總覽 － ochema」）並把焦點移到新畫面 `h2`（`tabIndex={-1}`），或用 polite live region 播報畫面名稱。
**驗證**：VoiceOver 切換三個分頁，確認有聽到新畫面名稱。

### 4. 掛載時就帶內容的 `role="status"` 區塊，讀屏可能不播報
**WCAG**：4.1.3 狀態訊息（AA）
**嚴重度**：中等（需 SR 確認）
**位置**：`src/ui/Notice.tsx:23`、`src/ui/ListView.tsx:100`、`src/ui/ImportView.tsx:252,277,333`、`src/ui/OverviewView.tsx:51`
**說明**：`Flash.tsx` 的做法是對的（live region 常駐、之後才填內容，Flash.tsx:13-22）。但上列區塊是「連同內容一起新插入 DOM」，多數讀屏對剛插入的 live region 不可靠。重要的是 C1 存檔後通知（Notice）：它含「重複」「身分證警示」，若沒被讀到，使用者不知道存了有問題的資料；此時 Flash 只會說「已儲存」。
**修復建議**：讓這些容器常駐、內容後填（比照 Flash），或至少 Notice 內容併進 Flash 的播報。
**驗證**：VoiceOver＋Safari 實測：存一筆會觸發重複的資料，確認有聽到警示內容。

### 5. 表單錯誤摘要 `role="alert"` 在重驗時每次按鍵都可能被重新播報
**WCAG**：4.1.3 狀態訊息（AA）；3.3.1 錯誤識別（A）運作良好但體驗有風險
**嚴重度**：中等（需 SR 確認）
**位置**：`src/ui/RecordForm.tsx:73`（`attempted` 後每次 change 即重驗）、`:123`、`:131`（標題含動態欄位數）
**說明**：送出失敗後焦點移到摘要（RecordForm.tsx:65，做法正確）；但之後使用者輸入時摘要文字（「請修正 N 個欄位」與連結列表）持續變動，而容器是 assertive 的 `role="alert"`，可能每個字元都打斷朗讀。
**修復建議**：焦點已在摘要時不需 `role="alert"`（改 `role="group"`＋`aria-labelledby`），或重驗只更新欄位下方錯誤、摘要等下次送出再更新。
**驗證**：VoiceOver 故意送出空表單，再在第一欄輸入字元，觀察是否每鍵都朗讀。

### 6. 停用中的按鈕沒有任何「停用」外觀，且停用原因說明讀不到
**WCAG**：1.4.1 非僅顏色（A）精神、3.3.2 標籤或說明（A）、2.1.1 鍵盤（A，原因說明無法以鍵盤到達）
**嚴重度**：中等
**位置**：`src/ui/styles.css`（全檔無 `:disabled` 規則；僅 `:50` 的 `.btn[aria-disabled=true]`，且 TSX 內沒有任何地方使用 `aria-disabled`）、`src/ui/ImportView.tsx:472-489`、`src/ui/RecordForm.tsx:215`、`src/ui/DataView.tsx:124-132`
**說明**：`.btn-primary` 以作者樣式明定顏色與底色，原生 disabled 外觀被蓋掉，停用的「確認匯入」看起來和可按時一模一樣（且 cursor:pointer）。同時，原生 `disabled` 的按鈕不能取得焦點，`aria-describedby` 指向的原因（「請先選擇上方的匯入方式」）鍵盤使用者碰不到。
**修復建議**：對需要說明原因的按鈕（確認匯入、匯出 .xls 超限）改用 `aria-disabled="true"`＋點擊時略過，沿用已寫好的 `.btn[aria-disabled=true]` 虛線樣式；其餘 busy 狀態補 `:disabled` 樣式。
**驗證**：實機未選匯入方式時，確認按鈕外觀不同，且 Tab 可停在按鈕上並讀出原因。

### 7. 手機固定元素可能遮住取得焦點的元素
**WCAG**：2.4.11 焦點不被遮擋（最低）（AA，2.2 新增）
**嚴重度**：中等（需實機）
**位置**：`src/ui/styles.css:65`（手機 sticky 查詢區）、`:284`（fixed 底部導覽）、`:294`（fixed「新增資料」浮動鈕）；全檔無 `scroll-padding-*`
**說明**：小螢幕上，鍵盤（外接鍵盤／切換控制）Tab 到清單列的「編輯／刪除」時，瀏覽器只保證捲入視窗，不會避開 fixed／sticky 元素；底部有 56px 導覽與浮動鈕，頂部有 sticky 查詢區。`body` 的 `padding-bottom:140px`（:272）只在捲到最底時有效。
**修復建議**：`html{scroll-padding-top:<sticky 查詢區高度>;scroll-padding-bottom:140px}`（手機媒體查詢內）。
**驗證**：390px 寬、外接鍵盤，Tab 逐列檢查焦點環是否被底部列或浮動鈕蓋住。

### 8. 結果訊息出現在頁首，捲動後看不到；且 8 秒自動消失
**WCAG**：3.3.1 錯誤識別／4.1.3（視覺面）、2.2.1 可調整時間（A）
**嚴重度**：中等
**位置**：`src/App.tsx:164`、`src/ui/Flash.tsx:11,15-19`；Notice 位於 `src/ui/ListView.tsx:96`（按鈕區上方）
**說明**：Flash／Notice 渲染在 `<main>` 頂端。使用者在長名單中段按「編輯→儲存」或「刪除」後，對話框關閉、訊息在視窗外，8 秒後消失；低視力放大者與認知障礙者可能完全沒看到。Flash 沒有「滑入或聚焦時暫停計時」，也沒有手動關閉。（Notice 不自動消失，較好。）
**修復建議**：Flash 改為視窗內固定位置（如 `position:sticky/fixed` 並避開底部導覽），並在 hover／focus 時暫停計時，或提供關閉鈕與更長停留時間。
**驗證**：實機載入 200 筆資料，捲到中段刪除一筆，確認訊息可見。

### 9. 匯入預覽的小表格在手機會失去表格語意
**WCAG**：1.3.1 資訊與關聯（A）
**嚴重度**：中等（需 SR 確認）
**位置**：`src/ui/styles.css:90-103`（`.grid.mini` 改 `display:block`）、`src/ui/ImportView.tsx:98-127`
**說明**：主名單表格已明確標 `role="table/row/cell…"`（RecordTable.tsx:57-66）以對抗 display 改寫導致語意被丟棄；`.grid.mini` 沒有同樣處理，在 Safari／Chrome 手機版上很可能被當成一堆 div。欄位標題被 `thead` 的 clip 隱藏，只剩 `td::before` 的產生內容當標籤（各讀屏對產生內容的處理不一）。
**修復建議**：比照 RecordTable 補上明確 ARIA 角色。
**驗證**：iPhone VoiceOver 開匯入預覽，用轉子檢查是否被辨為表格。

### 10. 可橫向捲動的區塊沒有鍵盤可達性保證
**WCAG**：2.1.1 鍵盤（A）
**嚴重度**：輕微（需實機）
**位置**：`src/ui/styles.css:332`、`src/ui/ImportView.tsx:97`
**說明**：`.tablescroll{overflow-x:auto}` 未設 `tabindex="0"`。新版 Chromium 會讓可捲區塊自動可聚焦，Safari 不一定。
**修復建議**：加 `tabIndex={0}`、`role="region"`、`aria-label`（用 caption 文字）。
**驗證**：Safari 窄視窗下 Tab 是否能停在表格容器。

### 11. 匯出頁的動態提示沒有播報、也沒關聯到 radio
**WCAG**：4.1.3（AA）
**嚴重度**：輕微
**位置**：`src/ui/DataView.tsx:102-115`
**說明**：切換到 CSV 或 .xls 超限時出現的提示（`hint`／`err`）不是 live region；CSV 提示的 `id` 也沒進任何 `aria-describedby`。匯出失敗那個才有 `role="alert"`（:117，正確）。
**修復建議**：提示放進常駐的 `role="status"` 容器，或掛到該 radio 的 `aria-describedby`。

### 12. 身分證警示提示只在 blur 後出現，且不是 live
**WCAG**：3.3.1（A）／4.1.3（AA）
**嚴重度**：輕微
**位置**：`src/ui/RecordForm.tsx:111,187,204-209`
**說明**：離開身分證欄位後才出現「仍可儲存」的警示，焦點已移走，讀屏不會得知；只在回到該欄時透過 `aria-describedby` 讀到。
**修復建議**：該提示容器改為常駐的 `role="status"`。

### 13. 主題切換鈕沒有狀態
**WCAG**：4.1.2 名稱、角色、值（A）
**嚴重度**：輕微
**位置**：`src/App.tsx:156-159`
**說明**：`aria-label="切換外觀主題"` 固定，切換後無狀態、無播報。「資料」頁有 radiogroup（DataView.tsx:149-156，良好），此鈕僅為捷徑。
**修復建議**：`aria-pressed={dark}`，或讓 label 隨狀態變化（「切換為暗色」）。

### 14. 刪除後 Flash 的「劃除」文字半透明，對比僅勉強達標
**WCAG**：1.4.3 對比（最低）（AA）
**嚴重度**：輕微
**位置**：`src/ui/styles.css:340`（`.strike{opacity:.62}`）、`src/App.tsx:102`
**說明**：以 ink 對 `--ok-bg` 混合計算：亮色 4.51:1（剛好過）、暗色 5.20:1。若瀏覽器合成誤差或使用者自訂色，邊緣會掉到 4.5 以下。該文字本身是已刪除資料的確認，需要讀得到。
**修復建議**：opacity 提高到 .75 以上，或不用透明度改用 `--muted`。

### 15. 其他程式碼層級小項
**嚴重度**：輕微
- `src/ui/RecordForm.tsx:117`：`<form aria-labelledby>` 與 `<dialog aria-labelledby>` 指向同一標題，會讓部分讀屏多出一個重複命名的 form landmark。建議 form 移除 `aria-labelledby`。
- `src/ui/Modal.tsx:21-30`：`useEffect` 在 StrictMode **開發模式**會跑兩次，第二次的 `trigger` 可能變成對話框內的 input，導致關閉後焦點掉失。僅限開發環境，正式建置不受影響，列為已知。
- `src/ui/RecordTable.tsx:57`：`aria-rowcount` 搭配只渲染 200 列的「顯示更多」，沒有 `aria-rowindex`；讀屏的「第 N 列／共 M 列」可能與實際不符。
- 全站沒有 `forced-colors`／`prefers-contrast` 的專門處理：`.btn-primary` 以背景色區分（styles.css:47）、`.tag` 以邊框區分，強制色彩模式下應多半仍可辨，但無法在沙箱確認。
- 輸入欄位未宣告 `autocomplete` 目的（`autoComplete="off"`，RecordForm.tsx:188）。1.3.5 針對「使用者自己的資料」；此處輸入的是他人（車主）資料，判定不適用，僅備註。

## 逐項檢查結果（交接單列出的項目）

| 項目 | 結果 | 依據 |
|---|---|---|
| `lang="zh-Hant"` | 通過 | index.html:2 |
| 縮放未被禁止 | 通過 | index.html:6 無 user-scalable／maximum-scale |
| 跳到主要內容 | 通過 | App.tsx:114-123；`#main` 有 `tabIndex={-1}`（:163）；聚焦時顯示（styles.css:14） |
| 對話框開啟焦點 | 通過 | 原生 `showModal()`（Modal.tsx:25）；表單聚焦第一個 input、刪除聚焦「取消」（DeleteDialog.tsx:37） |
| 刪除確認預設焦點 | 通過 | DeleteDialog.tsx:37、:67 `data-cancel` |
| 對話框關閉還焦點 | 部分 | 觸發點仍在時通過；觸發點消失時失敗（發現 2） |
| Esc 關閉 | 通過 | Modal.tsx:37；儲存中不關（RecordForm.tsx:108） |
| 通知 role=status 時機 | 部分 | Flash 正確（Flash.tsx:13-22）；Notice 等掛載即帶內容（發現 4） |
| 表單標籤 | 通過 | 每欄 `label htmlFor`（RecordForm.tsx:178）；「必填」以文字呈現而非僅靠星號 |
| 錯誤關聯 | 通過 | `aria-invalid`（:192）、`aria-describedby` 含說明＋錯誤＋警示（:173-194）；摘要連結可聚焦對應欄位（:139-147） |
| 錯誤聚焦摘要 | 通過 | RecordForm.tsx:64-66；但有發現 5 的播報風險 |
| 顏色以外的辨識 | 通過 | 重複／警示標籤皆有圖示＋文字（RecordTable.tsx:18-34）；查詢命中用粗體＋底線的 `<mark>`（styles.css:23）；錯誤欄位邊框加粗（:136）且有文字 |
| 對比 | 通過 | 見下表，全部 token 組合達標 |
| `prefers-reduced-motion` | 通過 | styles.css:199-202 全域關閉；裝飾動畫僅在 no-preference 播放（:260-267、:345-355）；預設即最終狀態 |
| 觸控目標 | 通過 | `.btn`／`.clear`／導覽 44–56px（styles.css:46,61,279,285）；radio 24px 且整個 label 可點（:170-171） |
| 可及名稱 | 通過 | 編輯／刪除的 `aria-label` 以可見字「編輯／刪除」開頭（RecordTable.tsx:107-110），符合 2.5.3；徽章有螢幕閱讀器專用文字（App.tsx:147） |
| 標題層級 | 通過 | h1（App.tsx:130）→ 各畫面 h2 → h3，對話框標題為 h2 |
| 圖示 | 通過 | 皆 `aria-hidden`（icons.tsx:9,69） |
| 搜尋結果數 | 通過 | `aria-live="polite"`（ListView.tsx:77），查詢結果數會播報 |

## 對比計算（依 brief token）

淺色（亮）／暗色，單位 :1；門檻文字 4.5、非文字 3。

| 組合 | 亮 | 暗 |
|---|---|---|
| ink／bg | 14.93 | 14.80 |
| ink／surface | 16.43 | 13.51 |
| muted／bg | 6.67 | 7.90 |
| muted／surface | 7.34 | 7.22 |
| 主按鈕（accent-ink／accent） | 8.19 | 7.31 |
| 危險鈕（bg／block） | 7.76 | 9.21 |
| dup／bg | 9.81 | 10.49 |
| warn／bg | 7.18 | 12.08 |
| warn／warn-bg | 6.83 | 8.94 |
| block／bg | 7.76 | 9.21 |
| block／block-bg | 6.86 | 7.17 |
| ok／ok-bg | 7.48 | 8.12 |
| 輸入框邊框 edge／surface（非文字，≥3） | 4.83 | 4.43 |
| edge／bg | 4.39 | 4.85 |
| 焦點環 focus／bg | 9.81 | 10.49 |
| 焦點環 focus／surface | 10.79 | 9.58 |

唯一低於 3 的是載入骨架（`--line` 對 `--bg` 1.56/1.58），屬純裝飾且有「載入中」文字，不適用 1.4.11。
補充：`.tag` 在後段被設為 `background:transparent`（styles.css:227），所以標籤實際底色是所在容器的底色；已用 bg／surface／warn-bg 驗算，皆達標。

## 做得好的地方
- 原生 `<dialog>.showModal()`：焦點陷阱、背景惰性化、Esc 都交給瀏覽器，沒有自製焦點陷阱的風險。
- 錯誤處理完整：摘要＋逐欄訊息＋可點連結＋焦點移動＋`aria-invalid`。
- 刪除確認預設聚焦「取消」，破壞性動作需要明確操作。
- 所有狀態（重複、警示、封鎖、成功）都是「圖示＋文字＋形狀」，不靠單一顏色。
- reduced-motion 的做法是「預設最終狀態、動畫選擇性加上」，比「預設有動畫再關掉」更穩。
- 手機導覽與桌面共用同一份 DOM，避免重複可及名稱。
- 全部 token 對比通過，暗色模式也同樣驗算過。

## 修復優先級
### 立即修（上線前）
1. 發現 1：`.clear` 類別衝突（先在實機確認，再改名）。
### 短期修（下個迭代）
2. 發現 2、3：焦點管理（刪除後、路由切換、匯入階段）。
3. 發現 4、5：先用 VoiceOver 實測，再決定 live region 調整範圍。
4. 發現 6：停用按鈕樣式與說明可達性。
5. 發現 7、8：手機固定元素遮擋、Flash 位置與計時。
6. 發現 9：匯入預覽小表格 ARIA 角色。
### 持續改進
7. 發現 10–15。

## 需在 axe／實機確認
**axe（證據收集者腳本）可自動確認**
- 對比（含暗色主題、`.tag` 透明底）
- `aria-*` 屬性合法性、重複 id、`role="table"` 與原生元素的冗餘
- 表單 label 關聯、對話框名稱、`aria-describedby` 指向存在
- 注意：交接單中的 axe 設定是 WCAG 2.1 AA，**抓不到** 2.4.11（2.2 新規）；建議加 `wcag22aa` 標籤，並且仍抓不到 2.4.11 實際遮擋，需要人工

**必須實機／人工**（axe 無法判定）
1. 發現 1：總覽乾淨狀態實際尺寸（桌面＋手機，200%／400% 縮放）
2. 發現 2：刪除後、新增第一筆後、匯入選檔後的實際焦點落點
3. 發現 3：路由切換時 VoiceOver 的播報
4. 發現 4：Notice、匯入解析中／完成、總覽乾淨訊息是否被朗讀（VoiceOver＋Safari、NVDA＋Firefox 各一）
5. 發現 5：表單重驗時是否每鍵朗讀
6. 發現 6：停用按鈕外觀與鍵盤到達
7. 發現 7：390px＋外接鍵盤的焦點遮擋
8. 發現 8：長名單捲動後結果訊息是否看得到
9. 發現 9、10：iPhone Safari 的表格轉子與可捲區塊聚焦
10. 純鍵盤全流程：新增→擋下→修正→儲存→編輯→刪除→匯入→匯出，確認沒有鍵盤陷阱
11. 縮放：200%、400%（320 CSS px）下是否水平捲動、有無截斷
12. 強制色彩（Windows 高對比）、`prefers-contrast: more`、iOS「減少動態」
13. 手機語音控制：可見標籤（「編輯」「刪除」「新增資料」）可被語音指令命中

## 後續建議
- 修完發現 1–9 後做一輪 VoiceOver＋Safari（iOS 與 macOS）實測再複審。
- 把「路由切換→焦點／標題」「刪除後焦點落點」寫成 UI 測試（現有 `tests/ui/*` 可擴充），因為這兩項目前沒有任何測試守住。
