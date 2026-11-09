# 回報：3 — 工程部（匯入整份替換）

## 完成內容
依序完成交接單 1–7；紅燈證據先存（`.studio/evidence/red-replace.txt`）再實作。未修改 `features/`、`schema.dbml`。

## 契約變更（docs/data-contract.md）
- §3.5 重寫：分類四類互斥 FORMAT_ERROR > IDENTICAL_IN_FILE > DUP_IN_FILE > NEW（錯誤列不參與比對；整列相同不計入檔內重複）。
- 預覽回傳新增 `willDelete`（目前筆數）、`willImport`（可匯入＋檔內重複）、`merged`、`canConfirm`；`buildPreview(rows, existingCount)`。
- 新增 `replaceAllFromImport(preview): Promise<ReplaceResult>`（單一交易 count→clear→依序 add；失敗以回傳值表達：`FORMAT_ERRORS`／`NOTHING_TO_IMPORT`／`WRITE_FAILED`，交易回滾）；`ImportResult { deleted, imported, merged }`；測試接縫 `injectImportWriteFault(afterWrites)`（一次性）。
- 移除 `ImportMode`、`commitImport`、`DUP_EXISTING`、`existingConflicts`、`source`、`skipped`／`formatErrorsNotImported`。
- 追溯表（§5.1、§5.2）、§6、模組表、附錄「匯入改為整份替換」已更新。

## 紅燈摘要（.studio/evidence/red-replace.txt）
- `bash scripts/bdd-dryrun.sh` exit 0（無缺 step、無重複綁定、無死碼 step）。
- `npx vitest run`：49 failed | 371 passed | 979 skipped（同情境前步失敗後，後步標 skipped）。
- 失敗原因：`not implemented: previewImport / buildPreview / injectImportWriteFault`（資料層 stub）、舊 ImportView 吃新預覽形狀（`row.existingConflicts is not iterable`）、元件測試找不到二次確認框、少數 @ui 斷言不成立、offline-use 的 vite build 失敗（舊 ImportView 還 import 已移除的 `commitImport`）。無語法／綁定錯誤。

## 實作
- `src/data/importer.ts`：`buildPreview`、`previewImport`、`replaceAllFromImport`、`injectImportWriteFault`。
- `src/data/types.ts`：新型別。
- `src/ui/ImportView.tsx`：四類統計＋「將刪除目前 N 筆、匯入 M 筆」、整列相同合併告知、有格式錯誤時「確認匯入」`aria-disabled` 並以 `aria-describedby` 說明；確認後開二次確認；結果「已刪除 N、已匯入 M、合併 K 筆整列相同」；寫入失敗關閉對話框並顯示「名單沒有任何變更」。常駐 live 容器、標題焦點管理沿用。
- `src/ui/ReplaceDialog.tsx`（新）：原生 `<dialog>`（沿用 Modal）、預設焦點「取消」、「先匯出目前資料」＝`exportRecords('xlsx')`，匯出後對話框仍開、名單不變；空名單也跳。
- `src/App.tsx` 傳 `download` 給 ImportView；`src/ui/styles.css` 加 `.replaceline`；`README.md` 匯入說明改為整份替換。

## 測試異動
刪除的 step（`tests/support/stepLib/*`；皆因對應功能／分類已不存在，非放寬）：
- `importApi.ts`：「可新增的是…」「可新增的是…，與既有資料重複的是…」「與既有資料重複的是…（3 種寫法）」「第 N 列歸為與既有資料重複，…」「預覽另外單獨列出整列相同的列：…與既有資料整列相同…」「預覽告知整列相同的列不論選擇略過重複或照樣匯入都不會匯入」「檔案第 N 列只是同車頭車號，不在整列相同的列表中」（改寫為歸為檔內重複版）；「我預覽並選擇「…」後確認匯入」（2 種）、「我選擇「…」後確認匯入」；舊「匯入結果顯示」解析（略過／格式錯誤未匯入）；`restore`／`tupleKey`／`MODE_BY_LABEL` 輔助。理由：略過重複／照樣匯入選項與「與既有重複」分類已被使用者裁決移除。
- `common.ts`：「名單仍是空的」「在我確認之前名單仍是空的」「名單上有駕駛姓名 {string} 的資料」「名單上駕駛姓名為 {string} 的資料有 {int} 筆」「新匯入的資料駕駛姓名依序為」。理由：新 features 不再使用（死碼，stepBinding 會判失敗）；所有保留的斷言語意不變。
- `ui.ts`：移除 `chooseImportMode`；`confirmImport` 改為按下後等二次確認框，新增 `confirmReplace`／`cancelReplace`／`exportBeforeReplace`／`replaceDialog`／`importButton`。
- `tests/ui/importView.test.tsx`：整檔改寫，移除舊選項測試（預設不選、未選停用、expectedImports、照樣匯入傳模式、整列相同兩選項皆不匯入）。
- `tests/data/importer.test.ts`：整檔改寫（commitImport 相關測試移除）。
- `tests/qa/import-export-scale.test.ts`、`records-concurrency.test.ts`：含 `commitImport`／`IMPORT_ALL`／`dupExisting` 的測試改為對應的新語意（見下）。

新增的 step：`我預覽並確認匯入`、`我確認匯入並通過二次確認`、`我嘗試確認匯入`、`確認被拒絕，原因是檔案含有格式錯誤列`、`寫入名單的過程在第 N 筆之後發生錯誤`、`匯入失敗並告知原因`、`我手動新增一筆資料：…`、`預覽寫明 將刪除目前 N 筆、匯入 M 筆`、四類分類斷言、`不可確認匯入`（含「沒有將刪除提示」版）、`名單上仍有 N 筆資料，與預覽前／匯入前完全相同`（Given／Then 的「名單上有以下資料：」已依 `acted` 分開，審查建議 7）、UI 的二次確認框步驟（預設焦點、取消、先匯出、仍開著）、`「確認匯入」按鈕不可用`。

新增／改寫的測試（意圖）：
- `tests/data/importer.test.ts`：分類優先序（含連鎖、整列相同不計檔內重複、錯誤列不參與比對）、`willDelete`／`willImport`／`merged`／`canConfirm`；替換清舊寫新、id 序、`deleted` 以交易內為準、格式錯誤／空預覽拒絕且名單不動、寫入失敗整筆回滾（含 id 不變）、接縫一次性。
- `tests/ui/importView.test.tsx`（交接單 5）：錯誤時確認 aria-disabled（可聚焦、有說明、點了不跳框、無「將刪除」）；二次確認預設焦點取消、空名單也跳；取消後名單不變且焦點回到「確認匯入」；先匯出（xlsx、全部）後對話框仍在且不替換；匯出失敗告警；確認後結果文字；寫入失敗訊息；沒有任何 radio。
- qa：5,000 列混合檔改為「有格式錯誤整份擋下且名單不動，修正後替換成功（deleted 1、imported N−4、merged 4）」；連按兩次確認仍為檔案內容。

## 綠燈（執行環境：沙箱）
- `bash scripts/bdd-dryrun.sh`：exit 0。
- `npx vitest run` 連跑 2 次：兩次皆 21 files passed、**1399 passed | 10 todo | 0 failed**。
- `npx tsc -b` 無錯；`pnpm build` 成功（chunk >500 kB 警告為既有）。
- 變異檢查：拿掉 `store.clear()` → 16 個測試失敗；拿掉寫入失敗注入 → 3 個失敗；已還原。

## evidence 腳本改動（scripts/evidence.mjs）
- 測試檔：含格式錯誤的 `import-sample.xlsx/.xls/.csv`（可匯入 3、檔內重複 1、整列相同 1、格式錯誤 1）＋新增無錯誤的 `import-clean.xlsx`（3/1/1/0）；已用實際 `previewImport` 驗證兩組分類。
- 匯入組改為：17 選檔；18–20 含錯誤檔三格式（預覽統計、確認 aria-disabled、無「將刪除」、無 radio、點了不跳框、名單仍 3 筆）；21 乾淨檔寫明「將刪除目前 3 筆、匯入 4 筆」；21a 二次確認預設焦點＝取消（含 axe）、取消後名單仍 3 筆；21b 先匯出（.xlsx、對話框仍在、名單仍 3 筆）；22 確認替換結果（已刪除 3、已匯入 4、合併 1）；23 名單共 4 筆＝檔案 5 列−合併 1、舊資料不在、檔內重複持續標示。
- `node --check` 通過；`--dry-run --skip-build` 通過（測試檔、預覽伺服器、sw.js OK；結束後 4173 已無監聽）。**瀏覽器流程本身沙箱內無法執行，尚未實跑**，需在沙箱外 `bash scripts/evidence.sh`。

## 待決問題
1. 二次確認框按鈕名稱我定為「先匯出目前資料」「取消」「確認替換」，對話框標題「確認替換整份名單？」（features 只固定前兩者）。若設計部有指定文案請告知。
2. 「預覽沒有任何讓我選擇如何處理重複列的選項」「預覽可進行的操作只有確認匯入與取消」兩個 @api 情境在資料層只能間接驗證（`replaceAllFromImport.length === 1`、預覽物件無模式欄位）；真正的「畫面沒有選項」由元件測試與 @ui 步驟（`queryAllByRole('radio')` 為 0）負責。
3. 有格式錯誤時我不顯示「將刪除目前 N 筆…」（避免暗示會替換），僅在可確認時顯示；若希望錯誤時也顯示請裁決。
4. `RowConflictKind`（含 `IDENTICAL_ROW`）仍保留給 UI 標籤對照與手動新增；匯入的 `kinds` 只含三種重複種類。
5. 預覽後名單若又被改（極端情境），結果的「已刪除 N」以交易內實際筆數為準，可能與預覽的「將刪除」不同；已有測試鎖定，未另做提示。
6. 本機無法 `ps` 核對行程；我啟動的 `vite preview`（evidence dry-run）由腳本在結束時關閉，已以 curl 確認 4173 無回應。
