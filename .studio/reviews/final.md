判定：通過

# 終審：點擊複製名單欄位（範圍僅限本功能）

評分：B（功能正確、測試有意圖；手機觸控與機制性提示不足，需下一輪修）
生產就緒性：本功能 READY，附中度問題待追（見下）。

## 我自己跑的證據（不採信回報）
- `npm_config_cache=$TMPDIR/npm-cache npx vitest run`：23 檔 passed，Tests 1434 passed | 10 todo（與工程回報 green-copy-full.txt 一致）。
- `git diff` 顯示 tests/ 只動 stepLib/index.ts（註冊）與 support/ui.ts（掛假剪貼簿並於 dispose 還原），沒有任何既有 tests/ui/*、features/ 被改動，無放寬。
- 讀過 desktop／mobile 的 10a 截圖：訊息「已複製「20-9A」」可見，四格值為純文字。
- 沙箱無瀏覽器：焦點外框、手機觸控、iPhone Safari 我無法親自驗證，僅能引用 evidence-summary.md（42/42，10a 在真 Chromium 讀回剪貼簿＝20-9A）。

## 五個情境對照意圖
| 情境 | 證據 | 結論 |
|---|---|---|
| 點任一欄只複製該值（4 例） | copy.ts:47-53 以 `writes toEqual([value])` 斷言完全相等＋訊息含「已複製「值」」；若複製整列／加前綴會失敗 | PASS |
| 查詢標示後仍複製完整值 | 值取自 r.headPlate（RecordTable.tsx:85），不是 DOM 文字；測試在 `<mark>` 分段下仍斷言 `["KLP-7988"]` | PASS |
| 鍵盤 | copy.ts:42-44 真的 user.tab() 迴圈走到按鈕（上限 60 次）才按 Enter，不是直接 click/focus | PASS |
| 不開編輯、不改名單 | copy.ts:67-76 查無表單／dialog，並同時查畫面列數與資料庫筆數 | PASS |
| 失敗 | copy.ts:55-65：writes 為空、訊息含「無法複製」與值、不含「已複製」、無 msg-ok 樣式。實作 App.tsx:101-108 用 tone=warn（Flash.tsx:51-53） | PASS |

表格前四格 textContent 仍是值：按鈕內只放值（RecordTable.tsx:37-43），名稱走 aria-label，既有測試全綠可證。

## 無障礙
- 名稱：「複製車頭車號 KLP-7988」格式一致，真 `<button>`，Tab/Enter/Space 原生支援。
- 焦點：沿用全域 `:focus-visible{outline:3px…!important}`（styles.css:15），.cellcopy 未覆蓋 outline，理論上有外框；未實機看過（無證據）。
- 讀屏重複：aria-label 取代按鈕內容，值不會被唸兩次；訊息在 role=status 常駐容器，關閉鈕在容器外（Flash.tsx:49,65）。同值連按以 key=id 重建節點，會再播報。

## 問題清單
中度：
1. 手機觸控面積不足。`.cellcopy`（styles.css:83）無 min-height／padding；手機卡片 td padding:0（styles.css:95），姓名、身分證兩格可點範圍只有一行文字高（約 20 多 px），低於本專案其他按鈕一律 44px 的標準（styles.css:46,61,326）。此功能的主要場景是手機，且無實機量測證據。建議 `.cellcopy` 在手機加 `min-height:44px`、讓按鈕撐滿 td。
2. 可發現性：只有桌面 hover 才看得到淡底＋虛線（styles.css:84）；觸控與非 hover 使用者沒有任何「可點」提示（名單頁無說明文字）。建議在 .help 或查詢區加一句「點車號／姓名／身分證可複製」。
3. 鍵盤 Tab 停駐點暴增：每列多 4 個停駐點，PAGE_SIZE=200 時最多 800 個才走到列尾的編輯／刪除（RecordTable.tsx:7,85-108）。可考慮 roving tabindex 或提供略過；本次未列為阻擋，因 Enter 情境已證明可用。

輕度／已知限制：
4. 非 HTTPS 或 clipboard 不存在時，`navigator.clipboard.writeText` 丟 TypeError，被 try/catch 接住走失敗訊息（App.tsx:103-107）——程式邏輯正確，但測試只模擬「拒絕」，沒有「API 不存在」的案例（clipboard.ts:18）。已知限制請補進使用說明（HTTPS／localhost 才可複製）。
5. iPhone Safari 未實測（寫入在 click 同步呼叫內，理論符合 user-gesture 要求，但無證據）。請使用者實測並回報。
6. 手機 10a 截圖顯示 FAB「新增資料」壓在第二張卡的車斗車號上（既有版面，非本功能引入），會擋住該格點擊；一併留意。
7. 失敗訊息把完整身分證顯示在畫面 8 秒（App.tsx:107）。這是裁決要求「顯示值」，屬刻意取捨，僅記錄。

## 結論
5 個情境皆有意圖測試且重跑全綠，既有測試未放寬，無嚴重問題；中度問題 1-3 建議下一輪處理，使用者需在 iPhone 實測後才能算真機驗收完成。
