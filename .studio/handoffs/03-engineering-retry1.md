# 審查判定：退回（門禁 C 第 1 次，來源：測試部）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 前端開發者、資深開發者（工程部） |
| 時間 | 2026-11-09 |

證據：`.studio/evidence/a11y-review.md`、`.studio/handoffs/04-a11y-reply.md`、`.studio/handoffs/04-api-tester-reply.md`、`tests/qa/*.test.ts`。
共同限制：不可改 `features/`、`schema.dbml`、`tests/steps/**`、`tests/support/**`、`tests/qa/**`（測試部的測試是驗收依據）。

## A. 前端開發者（src/ui/**、src/App.tsx、src/router.tsx、index.html、styles）
修 a11y-review.md 發現 1–13，以及 15 中的「form 與 dialog 重複命名」「aria-rowcount 搭配 aria-rowindex」：
- 1 總覽乾淨狀態誤用 `.clear` 樣式。
- 2 刪除後／新增第一筆存檔後／匯入選檔後焦點落點（移到合理目標，例如名單標題或結果訊息）。
- 3 切換分頁移焦點到新頁 h1、更新 `document.title`（格式「名單 — ochema」等）。
- 4 role=status 容器常駐、內容後填（比照 Flash.tsx）。
- 5 錯誤摘要不要每鍵重讀（送出時才更新 live 摘要；欄位錯誤可即時但非 assertive）。
- 6 停用狀態可辨識（`:disabled` 樣式），停用原因以可聚焦的說明文字關聯（aria-describedby）。
- 7 `scroll-padding` 避免 sticky／fixed 遮擋焦點。
- 8 結果訊息：加關閉鈕；hover／focus 時暫停自動消失；長名單時訊息可見（例如固定於可視區）。（製片人採納的 IA 小改善）
- 9–13 依報告建議。
- 補 `tests/ui/*.test.tsx`：刪除後焦點不是 body；切換分頁後焦點在 h1 且 title 改變；Notice 容器在通知出現前已存在於 DOM。
- 若資深開發者新增「匯出失敗：儲存格超過 32,767 字元」錯誤型別，UI 接住並顯示「有資料超過 Excel 儲存格上限，請改用 CSV 匯出」。

## B. 資深開發者（src/data/**）
1. 缺陷 1：.xlsx 匯出再匯入時姓名內 CRLF 被轉成 LF，違反契約 §3.6 往返還原。修正讓 `tests/qa` 中該測試變綠（例如寫出時把 `\r` 以 OOXML `_x000D_` 轉義，或其他不改變其他格式行為的方法；先確認 SheetJS 讀回會還原）。若確定無法修，回報證據，不要改測試。
2. 缺陷 2：任何欄位超過 32,767 字元時 .xlsx／.xls 匯出不可以未處理例外整個失敗；改丟具名錯誤（例如 `CellTooLongError`，含哪一筆、哪一欄），CSV 不受影響。不新增輸入長度規則。補 `tests/data` 測試。`tests/qa` 中鎖定此特性的測試若因此改變結果，回報差異（不要改 tests/qa）。
3. 查明偶發失敗：證據收集者加依賴後第一次全套跑有 1 筆失敗、重跑通過。連跑全套 5 次，記錄是否重現與哪一個測試；找到原因就修（只能改 src 或 vitest.config.ts 的隔離設定，不改受保護測試）。
4. 契約文件更新：新錯誤型別、CRLF 處理。

兩位修完後各自跑 `scripts/bdd-dryrun.sh`、`npx vitest run`（全綠，0 失敗）、`pnpm build`。各自附加回報到 `.studio/handoffs/03-engineering-ui-reply.md`／`03-engineering-data-reply.md` 末尾「C 退回 1 修正」段。
