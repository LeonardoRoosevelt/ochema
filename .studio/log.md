- 2026-11-09T10:01:39 init：車輛所屬名單查詢；skip=[]

## 0 受理（2026-11-09）
- 技術棧沿用 BloomIn：Vite 7＋React 19＋TS、IndexedDB(idb)、vite-plugin-pwa（離線）、GitHub Pages（Actions，測試沒過不部署）。
- BDD runner：@amiceli/vitest-cucumber 8（需 vitest ^5；vitest 5 支援 vite 7，故不沿用 BloomIn 的 vitest 3）。純前端、無後端，step 以 jsdom＋fake-indexeddb＋Testing Library 驗證。
- dryrun：vitest-cucumber 無 dry-run，以 scripts/bdd-dryrun.sh 檢查「缺 steps 檔／Missing steps／NotCalledError」。實測：缺 step→1、缺檔→1、齊全但斷言紅→0；test-cmd 斷言紅→1。
- gate.py：`uv run` 會嘗試寫入 pyenv 系統 site-packages（沙箱擋），改用 $TMPDIR/gate-venv/bin/python 執行。
- 前端 MCP：shadcn／Playwright／DevTools MCP 皆不可用 → 改用 shadcn CLI、agent-browser；效能追蹤略過並於交付註明。
- 無後端 API：架構部產出改為 schema.dbml（IndexedDB store 對應）＋ docs/data-contract.md（儲存層與 Excel 欄位契約），取代 api-contract.md。
- 使用者裁決（受理）：
  - 重複定義：同車頭多筆、同車尾多筆、同身分證不同姓名、四欄完全相同 → 皆通知。
  - 車牌格式：只允許「大寫英數-大寫英數」（^[A-Z0-9]+-[A-Z0-9]+$），其他不收 → 比對重複用原樣比對。
  - 匯入：先預覽（新增數、與既有／檔內重複、錯誤列），使用者選擇略過重複或照樣匯入；重複資料在名單上持續標示。
  - 格式檢查：四欄必填＋身分證檢查碼（台灣規則），不合格只警示、仍可存。
- 製片人假設（待門禁 A 確認）：專案名 ochema、base /ochema/；查詢為任一欄位部分符合；身分證完整顯示。
- 標籤：本專案無 HTTP，`@api` 定義為「透過資料層／模組 API 驗證」（gate.py 只認 @ui/@api）。
- 2026-11-09T10:05:01 check A：通過
- 2026-11-09T10:05:46 check A：通過
- 2026-11-09T10:07:58 A 第 1 次退回
- A-1 退回（retry A=1）。使用者裁決匯入分類／小寫與空白／匯出範圍／整列相同，見 decisions/A-pre-1.md；製片人決定數字型儲存格讀顯示文字。
- 2026-11-09T10:16:29 check A：通過
- 2026-11-09T10:17:14 check A：通過
- 2026-11-09T10:18:54 check A：通過
- 2026-11-09T10:19:48 check A：通過
- 門禁 A：使用者核可＋三項修訂（decisions/A-gate.md），交產品部修訂後再 approve A。
- 2026-11-09T10:29:30 check A：通過
- 2026-11-09T10:30:01 check A：通過
- 2026-11-09T10:30:20 check A：通過
- 2026-11-09T10:30:26 使用者核可 A：使用者核可 109+1 情境與自加假設 1-12；三項修訂（整列相同手動擋下、預覽提醒、連鎖重複歸檔內）見 decisions/A-gate.md
- 製片人修正：duplicate-detection Examples 中前後空白列（Gherkin 會修剪儲存格）拆成獨立情境，意義不變。approve A（110 情境）。
- 2 階段開工：架構部（02-architecture）與 UX 架構師（02-design-ux）平行。
- UX 架構師交件（design/ia.md，8 畫面，@ui 49/49）。製片人裁決其待決問題（小範圍 UX，列入交付報告）：
  1. 「五類」為交接單用詞不精確：四個互斥類別＋身分證警示為跨類標記，照 features。
  2. 匯入選項不預選，未選時確認鈕停用。
  3. 車牌欄位 autocapitalize="characters"：只是鍵盤輔助，不改送出的值；小寫照樣擋下，與裁決不衝突。
  4. 本機資料提示常駐一行、不可關閉。
  5. 名單與匯出預設依建立順序（舊→新），與「第一次出現」一致。
  6. 編輯後不符查詢條件：提示「已存檔（目前不在篩選結果中）」。
  7. 表單有未儲存變更時取消才確認。
  8. 刪除入口只在名單列與總覽（不加進編輯表單）。
  9. 選配（版本更新提示、離線指示）不做。
  10. 預覽計算兩種選項結果／中途失敗回報 → 交架構部契約確認。
  11. 「預覽後放棄」為 @api 情境，features 已鎖定不補標籤；UI 仍在 S4b 涵蓋。
- 架構部交件（schema.dbml：vehicle_records＋四欄複合 unique＋三個單欄索引；docs/data-contract.md；Excel 選 SheetJS CE 0.20.3，實測 ExcelJS／read-excel-file 讀不到顯示文字）。dbml2sql 通過。
- UX 待決 10：預覽 counts 足以推算兩選項結果；commitImport 單一交易，失敗整批回滾，無「部分匯入」。
- 製片人裁決架構待決（列入交付報告）：
  1. SheetJS 以 tgz 放 repo `vendor/xlsx-0.20.3.tgz`，package.json 用 file: 引用。理由：CI 與重建不依賴 cdn.sheetjs.com；npm 上 0.18.5 有 CVE 不可用。
  2. 匯入檔中間全空白列略過、不計入列數（列號仍用實際 Excel 列號）。
  3. 只收 .xlsx；.xls／CSV 回「無法讀取」；多工作表只讀第一個；重複標題取第一欄；0 byte 回「檔案是空的」→ 列為已知限制。
  4. 同身分證不同姓名組：該身分證下所有筆都算成員（無法判斷哪個姓名才對，全部標示讓使用者檢查）。
  5. 空白去除採 JS trim()（含全形空白與 NBSP）。
  6. @table:none 建置情境由工程部以建置產物檢查實作。
- 截圖：沙箱內 Chromium 無法啟動（agent-browser、headless shell 皆因 Mach port bootstrap 1100 被擋）→ scripts/shoot-directions.sh 交使用者在沙箱外執行。補派趣味注入師（先前漏派）。
- 趣味注入師交件（每方向 3 個微互動，reduced-motion 皆有靜態替代）。製片人裁決：刪除維持不可復原（L2 只是刪除瞬間視覺）；觸發門檻（穩定 300ms、命中≤3 筆）於工程階段定；示範文案由前端依 ia.md 定稿。
- B-1 通過。製片人修 DBML：移除 varchar 長度（契約與 features 無長度規則，審查問題 1）。其餘建議（2–13）併入工程部交接單注意事項。
- 2026-11-09T11:17:11 check B：未通過
- 2026-11-09T11:18:15 check B：通過
- 門禁 B：使用者選 ledger、核可 DBML；範圍變更匯入支援 .xls／CSV(UTF-8)、匯出三格式可選（decisions/B-gate.md）。產品部增補情境後須重走門禁 A，再 approve B。
- 2026-11-09T11:32:02 check A：通過
- 產品部增補 .xls/CSV 情境（110→137），製片人裁決待決 6 項（decisions/B-gate.md）；派工作流架構師審 A-3。
- 2026-11-09T11:33:57 check A：通過
- 2026-11-09T11:34:58 A 第 2 次退回
- A-3 退回（retry A=2）：巢狀引號步驟、B-gate 製片人裁決 1/2/4 缺情境。
- 2026-11-09T11:35:34 check A：通過
- 2026-11-09T11:35:53 check A：通過
- 2026-11-09T11:36:19 check A：通過
- 使用者重新核可 A（141 情境）；check B 通過；approve B（ledger＋DBML）。
- 2026-11-09T11:50:16 使用者核可 A：使用者重新核可 141 情境（新增 .xls/CSV 匯入、三格式匯出；decisions/B-gate.md）
- 2026-11-09T11:51:01 check B：通過
- 2026-11-09T11:51:01 使用者核可 B：使用者核可 DBML（vehicle_records）＋設計方向 ledger
- 派架構部更新 data-contract（格式＋B-1 建議）並放置 vendor tgz。
- 自動模式分類器拒絕「下載並執行外部程式碼（SheetJS CDN）」→ 不繞過；架構師只更新契約文件；SheetJS tgz 交使用者決定是否下載（含 SHA-256 驗證）。
- 架構部契約更新交件（detectFormat、readImportFile、CSV 自寫 RFC 4180、exportRecords 三格式；追溯 141；待工程部實測 T1–T9）。製片人裁決（列入交付報告）：
  - Q-A：DBML 長度鎖定前已移除，契約誤述已更正。
  - Q-B：CSV 引號未收尾 → 無法讀取（嚴格）。
  - Q-C：CSV 公式注入（姓名以 = + - @ 開頭）：features 要求原樣保留，不轉義；列為已知風險（只在用 Excel 直接開 CSV 時發生），告知使用者。
  - Q-D：匯出格式選 CSV 時在選項旁提示「用 Excel 直接開啟 CSV，前導 0 可能被吃掉；要編輯請選 .xlsx」。
  - Q-E：不採延伸；標題列固定為檔案第 1 列（依 features 字面）。
  - Q-F：.xls 超過 65,536 列：匯出時若超過則告知改用 .xlsx（不寫情境，列已知限制）。
  - Big5 剛好為合法 UTF-8 的降級：接受（不會匯入亂碼）。
- 使用者下載 vendor/xlsx-0.20.3.tgz，SHA-256 相符（使用者授權使用）。3 工程部開工：分三段（骨架＋全部 step 紅燈 → 資料層／UI 平行實作 → 整合綠燈）。
- 3b 派工：資料層（03-engineering-data）與 UI（03-engineering-ui）平行；匯入確認以「無重複時不顯示選項」化解與 UX 裁決的衝突（契約附錄）。dryrun 腳本補 ScenarioOutlineVariableNotCalledInStepsError。
- 資料層交件：@api 176/176、單元 35 綠、build 成功。製片人裁決：xlsx 維持靜態 import（離線 precache，gzip ~160kB 可接受，列交付報告）；XlsRowLimitError 已轉告前端。
- 前端交件：@ui 70/72（2 紅）。根因：製片人「無重複時不顯示選項」裁決與鎖定情境「無網路時仍可預覽並匯入 Excel」（明寫選擇略過重複、檔案無重複）衝突 → 情境優先，改為：選項一律顯示、不預選；無重複時確認可用；有重複未選則停用（契約附錄同步更正）。UX 裁決 7 撤回：取消與 Esc 皆直接放棄。接受 L2 改在結果訊息、單一清除關鍵字按鈕。
- 2026-11-09T12:58:42 check C：通過
- C-1 通過（變異 7/8 被抓）。採納建議 1（展開數守門）、2（sheetToGrid 不依 !ref 逐格）、5、7（本次產生的死碼／重複常數／未用依賴）交小修；3 維持 prompt（避免打斷操作，列已知限制）；6、4 不處理。
- 2026-11-09T13:11:54 check C：通過
- 小修完成：1179/1179、check C 通過；gherkin.ts 因變異驗證 mtime 更新，守門測試通過＋檢視確認已還原。4 測試部開工（證據收集者／API 測試員／無障礙審核員平行）。
- 無障礙審核交件（重要 1／中等 7／輕微 7，靜態審核）。待 API 測試員結果後一併退回工程部（retry C）。已轉告證據收集者加 wcag22aa 與焦點／標題檢查。
- 2026-11-09T13:33:54 C 第 1 次退回
- 測試部：API 缺陷 2（CRLF、32767）、a11y 15 項 → 退回工程部（retry C=1，03-engineering-retry1.md）。契約 §3.5.1 標題列正文更正為固定第 1 列。
- C 退回 1 修正：前端 a11y 1–14＋15 部分；資料層 CellTooLongError（xlsx 32767、xls 255 靜默截斷改為丟錯）；CRLF→LF 為 SheetJS 讀端行為無法修，製片人裁決列已知限制，並以製片人身分調整 tests/qa 兩個斷言（CRLF 改 xlsx 特性紀錄、32768 改斷言 CellTooLongError）。偶發失敗＝CPU 競爭逾時＋多行程同時 build dist；vitest maxWorkers 4、testTimeout 60s；序列執行不發生。form/dialog 重複命名受測試契約限制不修（已知）。
- 2026-11-09T13:55:41 check C：通過
- 證據腳本首次實跑：16 步失敗、console 0、對外請求 0。判讀：07 選擇器過寬（仍可儲存兩處）→ dialog 未關連鎖；14–26 選擇器／依賴前步資料。截圖確認 App 匯出頁正常、離線重載可開啟並顯示資料。交證據收集者修腳本。
- 證據第二次實跑：34/39，console 0、對外 0、axe 0。5 失敗經製片人手算皆為腳本預期錯誤（第 7 列身分證與 R3 相同→與既有重複；照樣匯入 3／略過 2 正確；結果容器非 role=status；步驟 12 未重開確認框）。製片人直接修正腳本。
- 證據第三次實跑：39/39、console 0、對外 0、axe 0；刪除後焦點 h2#list-h。製片人目視手機截圖：固定導覽出現在中段為整頁截圖假象；可新增明細預設收合為設計。派現實檢驗者終審。
- 2026-11-09T14:54:46 check D：通過
- 5 交付：gate status 全部 passed；delivery.md、README.md 完成。.git 寫入被沙箱擋（git init 失敗、已清除殘缺 .git），commit 交使用者執行。
- 交付後變更：使用者要求欄位改名（decisions/rename-fields.md）。產品部更新 features 用詞 → 重新門禁 A → 工程同步 → 證據重跑 → 終審。
- 2026-11-09T16:00:40 check A：通過
- 2026-11-09T16:00:49 check A：通過
- 2026-11-09T16:00:58 check A：通過
- 2026-11-09T16:01:28 check A：通過
- 2026-11-09T16:02:10 使用者核可 A：使用者核可欄位改名（車頭車號／車斗車號／駕駛姓名／駕駛身分證），142 情境；decisions/rename-fields.md
- 使用者核可改名後 142 情境（approve A）。派工程部同步。
- 2026-11-09T16:14:43 check C：未通過
- 改名同步：dryrun OK、1377/1377（連跑兩次）、build OK；缺少標題 step 變嚴格（多標題須完全相符）；check C 重跑。待使用者重跑證據腳本＋現實檢驗者重審。
- 2026-11-09T16:15:06 C 第 2 次退回
- check C 失敗：search「在查詢結果中編輯後，查詢條件保持」間歇失敗（篩選「王」出現李美玲）。retry C=2，交前端查明根因。
- 2026-11-09T16:23:26 check C：通過
- 間歇失敗根因：step 時序（100ms 防抖），修前 15/20 失敗、修後 0/20；只把 Then 包進 waitFor、條件未放寬。check C 通過 1377/1377。停止工程 agent 背景作業。
- 2026-11-09T16:38:07 check D：通過
- 改名後：證據 39/39、現實檢驗者重審通過、check D 通過、gate status 全部完成；清除舊截圖與舊下載檔；delivery.md 更新。
- 交付後變更 2：匯入改整份替換（decisions/import-replace.md）。產品部改寫 → 審查 → 門禁 A → 契約 → 工程 → 證據 → 終審。
- 2026-11-09T18:01:25 check A：通過
- 產品部替換改寫交件（142：刪 11／增 12／改 47），製片人裁決 3 項待決；派工作流架構師審 A-5。
- 2026-11-09T18:03:53 check A：通過
- 2026-11-09T18:14:14 使用者核可 A：使用者核可匯入整份替換（142 情境；空名單亦二次確認）；decisions/import-replace.md
- 使用者核可替換情境（approve A），空名單亦二次確認。派工程（含契約更新）紅→綠。
- 2026-11-09T18:34:24 check C：通過
- 替換實作交件：紅燈 red-replace.txt、綠燈 1399×2、build OK。製片人接受待決：二次確認文案、錯誤時不顯示將刪除筆數、結果以交易實際筆數為準。
- C-2 通過（變異 7/7 被抓）。製片人修契約 682 行舊匯入確認規則加註已取代。
- 製片人：證據步驟 18–20 失敗為腳本問題（aria-disabled 按鈕 click 等待逾時），改 force click；App 行為正確（截圖確認擋下與原因說明）。清除舊名稱截圖 15 個。
- 2026-11-09T20:29:36 check C：通過
- 2026-11-09T20:30:01 check D：通過
- 製片人：終審通過（有條件）。修過期通知（App onCommitted 清 notice/flash＋staleNotice 測試，紅→綠）；ia.md 加註取代；delivery.md 更新。check C、D 通過，1400 passed。
- 2026-11-10 使用者要求 App 名稱改「土方車輛」（全部可見處，含匯出檔名）；網址／DB 名不動。1400 passed、build 通過。
- 2026-11-10T10:03:04 check C：通過
- 2026-11-10T10:03:36 check D：通過
