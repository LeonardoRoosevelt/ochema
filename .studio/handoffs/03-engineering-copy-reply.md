# 回報：3 — 工程部（點擊複製名單欄位）

## 改了哪些檔
- 新增 tests/steps/copy-value.steps.ts、tests/support/stepLib/copy.ts、tests/support/clipboard.ts（假剪貼簿）
- 修改 tests/support/stepLib/index.ts（註冊）、tests/support/ui.ts（掛 FakeClipboard、dispose 時還原）
- 修改 src/ui/RecordTable.tsx（CopyValue 按鈕＋onCopy prop）、src/ui/ListView.tsx（轉傳 onCopy）、src/App.tsx（onCopy，用 say()）、src/ui/styles.css（.cellcopy）
- 未動 features/、schema.dbml、既有測試

## 紅燈（.studio/evidence/red-copy.txt）
Tests 8 failed | 10 passed | 14 skipped (32)。8 個失敗全是「那一格應有可操作的複製按鈕（button）: expected [] to have a length of 1」，即功能未實作；無綁定錯誤，bdd-dryrun 通過。

## 綠燈
- copy-value：32 passed (32)
- 全部：Test Files 23 passed；Tests 1434 passed | 10 todo（舊測試全綠，含 stepBinding）。完整輸出 .studio/evidence/green-copy-full.txt
- tsc -b --noEmit 無輸出（無錯）；vite build 成功；bdd-dryrun exit 0

## 自行判斷
- 按鈕內只放值（含 Hl），aria-label「複製<欄位> <值>」；原本的 plate／idv span 包在按鈕內，樣式不變。
- 失敗訊息：「無法複製到剪貼簿，請自行選取：<值>」；不用 execCommand。
- 鍵盤情境用 userEvent.tab() 真的走到按鈕再 Enter；假剪貼簿在 userEvent.setup() 之後安裝（否則被 user-event 的替身蓋掉）。
- 「名單共有 {int} 筆資料」是新 pattern，同時查畫面列數與資料庫筆數。
- 按鈕樣式：無邊框、繼承字型顏色、pointer、hover 淡底＋虛線底線，沿用全域 :focus-visible 外框。

## 待決／未驗證
- Flash 只有成功樣式（msg-ok 綠色），失敗訊息也會是綠色勾勾圖示，文字有說「無法複製」。要不要加失敗樣式請設計決定。
- 沙箱無法開瀏覽器：手機卡片版面、hover／focus 外觀、按鈕觸控面積（目前未強制 44px）未實機看過。
- 真實瀏覽器在非 HTTPS／非安全環境 navigator.clipboard 不存在，會走失敗訊息（符合裁決）。
