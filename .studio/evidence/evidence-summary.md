# ochema 證據摘要

- 產生時間：2026-11-09T08:32:50.278Z
- 步驟：39 通過／0 失敗（共 39）
- console error／pageerror：0
- 對外請求（非 http://127.0.0.1:4173）：0（預期 0）
- axe（WCAG 2.1 A／AA）違規規則數（各畫面加總）：0

## 環境

- Node：v26.4.0
- 平台：darwin/arm64
- playwright：1.64.0
- Chromium 執行檔：/Users/leonardoroosevelt/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing（存在，沿用既有）
- Chromium 版本：156.0.8078.4

## 步驟

| 編號 | 步驟 | 結果 | 截圖 | 備註 |
|---|---|---|---|---|
| 01 | 空狀態 | 通過 | [01-空狀態-desktop.png](../../.studio/evidence/screens/01-空狀態-desktop.png)<br>[01-空狀態-mobile.png](../../.studio/evidence/screens/01-空狀態-mobile.png) |  |
| 02 | 新增表單-空白 | 通過 | [02-新增表單-空白-desktop.png](../../.studio/evidence/screens/02-新增表單-空白-desktop.png)<br>[02-新增表單-空白-mobile.png](../../.studio/evidence/screens/02-新增表單-空白-mobile.png) |  |
| 03 | 新增成功 | 通過 | [03-新增成功-desktop.png](../../.studio/evidence/screens/03-新增成功-desktop.png)<br>[03-新增成功-mobile.png](../../.studio/evidence/screens/03-新增成功-mobile.png) | seal 動畫：seal 0.5s |
| 04 | 擋下-欄位錯誤 | 通過 | [04-擋下-欄位錯誤-desktop.png](../../.studio/evidence/screens/04-擋下-欄位錯誤-desktop.png)<br>[04-擋下-欄位錯誤-mobile.png](../../.studio/evidence/screens/04-擋下-欄位錯誤-mobile.png) |  |
| 05 | 擋下-整列相同 | 通過 | [05-擋下-整列相同-desktop.png](../../.studio/evidence/screens/05-擋下-整列相同-desktop.png)<br>[05-擋下-整列相同-mobile.png](../../.studio/evidence/screens/05-擋下-整列相同-mobile.png) |  |
| 06 | 重複標示-同車頭車號通知 | 通過 | [06-重複標示-同車頭車號通知-desktop.png](../../.studio/evidence/screens/06-重複標示-同車頭車號通知-desktop.png)<br>[06-重複標示-同車頭車號通知-mobile.png](../../.studio/evidence/screens/06-重複標示-同車頭車號通知-mobile.png) |  |
| 07 | 駕駛身分證警示-表單與通知 | 通過 | [07-駕駛身分證警示-表單-desktop.png](../../.studio/evidence/screens/07-駕駛身分證警示-表單-desktop.png)<br>[07-駕駛身分證警示-表單-mobile.png](../../.studio/evidence/screens/07-駕駛身分證警示-表單-mobile.png)<br>[07-駕駛身分證警示-通知-notice-desktop.png](../../.studio/evidence/screens/07-駕駛身分證警示-通知-notice-desktop.png)<br>[07-駕駛身分證警示-通知-notice-mobile.png](../../.studio/evidence/screens/07-駕駛身分證警示-通知-notice-mobile.png) |  |
| 08 | 總覽 | 通過 | [08-總覽-desktop.png](../../.studio/evidence/screens/08-總覽-desktop.png)<br>[08-總覽-mobile.png](../../.studio/evidence/screens/08-總覽-mobile.png) |  |
| 09 | 查詢-命中 | 通過 | [09-查詢-命中-desktop.png](../../.studio/evidence/screens/09-查詢-命中-desktop.png)<br>[09-查詢-命中-mobile.png](../../.studio/evidence/screens/09-查詢-命中-mobile.png) |  |
| 10 | 查詢-無結果 | 通過 | [10-查詢-無結果-desktop.png](../../.studio/evidence/screens/10-查詢-無結果-desktop.png)<br>[10-查詢-無結果-mobile.png](../../.studio/evidence/screens/10-查詢-無結果-mobile.png) |  |
| 11 | 刪除確認 | 通過 | [11-刪除確認-desktop.png](../../.studio/evidence/screens/11-刪除確認-desktop.png)<br>[11-刪除確認-mobile.png](../../.studio/evidence/screens/11-刪除確認-mobile.png) | 預設焦點＝取消 |
| 12 | 刪除完成 | 通過 | [12-刪除完成-desktop.png](../../.studio/evidence/screens/12-刪除完成-desktop.png)<br>[12-刪除完成-mobile.png](../../.studio/evidence/screens/12-刪除完成-mobile.png) | 刪除後 activeElement=h2#list-h.stitle（名單） |
| 13 | 資料頁 | 通過 | [13-資料頁-desktop.png](../../.studio/evidence/screens/13-資料頁-desktop.png)<br>[13-資料頁-mobile.png](../../.studio/evidence/screens/13-資料頁-mobile.png) |  |
| 13a | 分頁標題 | 通過 | — | document.title：{"名單":"名單 — ochema","總覽":"總覽 — ochema","資料":"資料 — ochema"}（切換分頁後有改變） |
| 14 | 匯出-xlsx | 通過 | [14-匯出-xlsx-desktop.png](../../.studio/evidence/screens/14-匯出-xlsx-desktop.png)<br>[14-匯出-xlsx-mobile.png](../../.studio/evidence/screens/14-匯出-xlsx-mobile.png) | ochema-名單-20261109-1632.xlsx（16459 bytes） |
| 15 | 匯出-xls | 通過 | [15-匯出-xls-desktop.png](../../.studio/evidence/screens/15-匯出-xls-desktop.png)<br>[15-匯出-xls-mobile.png](../../.studio/evidence/screens/15-匯出-xls-mobile.png) | ochema-名單-20261109-1632.xls（4096 bytes） |
| 16 | 匯出-csv | 通過 | [16-匯出-csv-desktop.png](../../.studio/evidence/screens/16-匯出-csv-desktop.png)<br>[16-匯出-csv-mobile.png](../../.studio/evidence/screens/16-匯出-csv-mobile.png) | ochema-名單-20261109-1632.csv（164 bytes） |
| 17 | 匯入-選擇檔案 | 通過 | [17-匯入-選擇檔案-desktop.png](../../.studio/evidence/screens/17-匯入-選擇檔案-desktop.png)<br>[17-匯入-選擇檔案-mobile.png](../../.studio/evidence/screens/17-匯入-選擇檔案-mobile.png) |  |
| 18 | 匯入預覽-xls | 通過 | [18-匯入預覽-xls-desktop.png](../../.studio/evidence/screens/18-匯入預覽-xls-desktop.png)<br>[18-匯入預覽-xls-mobile.png](../../.studio/evidence/screens/18-匯入預覽-xls-mobile.png) | 可新增 1 筆 與既有資料重複 3 筆 檔內重複 1 筆 格式錯誤 1 筆 |
| 19 | 匯入預覽-csv | 通過 | [19-匯入預覽-csv-desktop.png](../../.studio/evidence/screens/19-匯入預覽-csv-desktop.png)<br>[19-匯入預覽-csv-mobile.png](../../.studio/evidence/screens/19-匯入預覽-csv-mobile.png) | 可新增 1 筆 與既有資料重複 3 筆 檔內重複 1 筆 格式錯誤 1 筆 |
| 20 | 匯入預覽-xlsx | 通過 | [20-匯入預覽-xlsx-desktop.png](../../.studio/evidence/screens/20-匯入預覽-xlsx-desktop.png)<br>[20-匯入預覽-xlsx-mobile.png](../../.studio/evidence/screens/20-匯入預覽-xlsx-mobile.png) | 可新增 1 筆 與既有資料重複 3 筆 檔內重複 1 筆 格式錯誤 1 筆；未選方式時「確認匯入」aria-disabled＝true |
| 21 | 匯入預覽-選照樣匯入 | 通過 | [21-匯入預覽-選照樣匯入-desktop.png](../../.studio/evidence/screens/21-匯入預覽-選照樣匯入-desktop.png)<br>[21-匯入預覽-選照樣匯入-mobile.png](../../.studio/evidence/screens/21-匯入預覽-選照樣匯入-mobile.png) |  |
| 22 | 匯入結果 | 通過 | [22-匯入結果-desktop.png](../../.studio/evidence/screens/22-匯入結果-desktop.png)<br>[22-匯入結果-mobile.png](../../.studio/evidence/screens/22-匯入結果-mobile.png) | 匯入完成：已匯入 3 筆、略過 2 筆 |
| 23 | 匯入後名單 | 通過 | [23-匯入後名單-desktop.png](../../.studio/evidence/screens/23-匯入後名單-desktop.png)<br>[23-匯入後名單-mobile.png](../../.studio/evidence/screens/23-匯入後名單-mobile.png) |  |
| 24 | 離線-首次載入後 SW 就緒 | 通過 | — | SW scope=http://127.0.0.1:4173/ochema/，預快取 11 項 |
| 25 | 離線-重新載入可開啟並查詢 | 通過 | [25-離線-查詢-desktop.png](../../.studio/evidence/screens/25-離線-查詢-desktop.png)<br>[25-離線-查詢-mobile.png](../../.studio/evidence/screens/25-離線-查詢-mobile.png) |  |
| 26 | 離線-新增 | 通過 | [26-離線-新增後-desktop.png](../../.studio/evidence/screens/26-離線-新增後-desktop.png)<br>[26-離線-新增後-mobile.png](../../.studio/evidence/screens/26-離線-新增後-mobile.png) | 離線新增並重載後共 4 筆 |
| dk0 | 暗色主題-建立資料 | 通過 | — |  |
| dk1 | 暗色主題-名單 | 通過 | [dk1-暗色主題-名單-desktop.png](../../.studio/evidence/screens/dk1-暗色主題-名單-desktop.png)<br>[dk1-暗色主題-名單-mobile.png](../../.studio/evidence/screens/dk1-暗色主題-名單-mobile.png) | body 背景=rgb(23, 20, 15) |
| dk2 | 暗色主題-總覽 | 通過 | [dk2-暗色主題-總覽-desktop.png](../../.studio/evidence/screens/dk2-暗色主題-總覽-desktop.png)<br>[dk2-暗色主題-總覽-mobile.png](../../.studio/evidence/screens/dk2-暗色主題-總覽-mobile.png) |  |
| dk3 | 暗色主題-新增表單擋下 | 通過 | [dk3-暗色主題-新增表單擋下-desktop.png](../../.studio/evidence/screens/dk3-暗色主題-新增表單擋下-desktop.png)<br>[dk3-暗色主題-新增表單擋下-mobile.png](../../.studio/evidence/screens/dk3-暗色主題-新增表單擋下-mobile.png) |  |
| dk4 | 暗色主題-刪除確認 | 通過 | [dk4-暗色主題-刪除確認-desktop.png](../../.studio/evidence/screens/dk4-暗色主題-刪除確認-desktop.png)<br>[dk4-暗色主題-刪除確認-mobile.png](../../.studio/evidence/screens/dk4-暗色主題-刪除確認-mobile.png) |  |
| dk5 | 暗色主題-資料頁 | 通過 | [dk5-暗色主題-資料頁-desktop.png](../../.studio/evidence/screens/dk5-暗色主題-資料頁-desktop.png)<br>[dk5-暗色主題-資料頁-mobile.png](../../.studio/evidence/screens/dk5-暗色主題-資料頁-mobile.png) |  |
| rm0 | reduced-motion-建立資料 | 通過 | — |  |
| rm1 | reduced-motion-名單 | 通過 | [rm1-reduced-motion-名單-desktop.png](../../.studio/evidence/screens/rm1-reduced-motion-名單-desktop.png)<br>[rm1-reduced-motion-名單-mobile.png](../../.studio/evidence/screens/rm1-reduced-motion-名單-mobile.png) | reduce 命中=true；.seal=none 0s / transition 0s；.btn-primary=none 0s / transition 0s |
| rm2 | reduced-motion-總覽 | 通過 | [rm2-reduced-motion-總覽-desktop.png](../../.studio/evidence/screens/rm2-reduced-motion-總覽-desktop.png)<br>[rm2-reduced-motion-總覽-mobile.png](../../.studio/evidence/screens/rm2-reduced-motion-總覽-mobile.png) |  |
| rm3 | reduced-motion-新增表單擋下 | 通過 | [rm3-reduced-motion-新增表單擋下-desktop.png](../../.studio/evidence/screens/rm3-reduced-motion-新增表單擋下-desktop.png)<br>[rm3-reduced-motion-新增表單擋下-mobile.png](../../.studio/evidence/screens/rm3-reduced-motion-新增表單擋下-mobile.png) |  |
| rm4 | reduced-motion-刪除確認 | 通過 | [rm4-reduced-motion-刪除確認-desktop.png](../../.studio/evidence/screens/rm4-reduced-motion-刪除確認-desktop.png)<br>[rm4-reduced-motion-刪除確認-mobile.png](../../.studio/evidence/screens/rm4-reduced-motion-刪除確認-mobile.png) |  |
| rm5 | reduced-motion-資料頁 | 通過 | [rm5-reduced-motion-資料頁-desktop.png](../../.studio/evidence/screens/rm5-reduced-motion-資料頁-desktop.png)<br>[rm5-reduced-motion-資料頁-mobile.png](../../.studio/evidence/screens/rm5-reduced-motion-資料頁-mobile.png) |  |

## 離線與對外請求

- 刪除一筆後 document.activeElement：h2#list-h.stitle（名單）
- document.title：{"名單":"名單 — ochema","總覽":"總覽 — ochema","資料":"資料 — ochema"}（切換分頁後有改變）
- 離線流程期間對外（非 http://127.0.0.1:4173）請求：0
- reduced-motion 計算樣式：{"seal":"none 0s / transition 0s","btn":"none 0s / transition 0s","mq":true}

對外請求：0 筆。

## console error／pageerror

- 無

## axe（完整結果見 `axe.json`）

| 畫面 | 違規 | 需人工確認 | 通過規則 | 違規規則 |
|---|---|---|---|---|
| 01-empty | 0 | 1 | 26 | — |
| 02-add-form | 0 | 0 | 17 | — |
| 03-list-1record | 0 | 1 | 30 | — |
| 04-add-form-blocked | 0 | 0 | 24 | — |
| 06-list-notice | 0 | 1 | 33 | — |
| 08-overview | 0 | 1 | 24 | — |
| 09-search-hit | 0 | 1 | 30 | — |
| 11-delete-dialog | 0 | 0 | 16 | — |
| 13-data | 0 | 1 | 26 | — |
| 17-import-select | 0 | 1 | 25 | — |
| 20-import-preview | 0 | 1 | 31 | — |
| 22-import-result | 0 | 1 | 22 | — |
| dk1-list-dk | 0 | 1 | 30 | — |
| dk2-overview-dk | 0 | 1 | 24 | — |
| dk3-add-blocked-dk | 0 | 0 | 23 | — |
| dk5-data-dk | 0 | 1 | 26 | — |
| rm1-list-rm | 0 | 1 | 30 | — |
| rm2-overview-rm | 0 | 1 | 24 | — |
| rm3-add-blocked-rm | 0 | 0 | 23 | — |
| rm5-data-rm | 0 | 1 | 26 | — |
