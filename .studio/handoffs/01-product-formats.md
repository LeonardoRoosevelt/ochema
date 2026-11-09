# 交接單：1 — 產品部（範圍變更：.xls／CSV）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 產品經理（產品部） |
| 階段 | 1 — 情境增補（需重新經門禁 A） |
| 時間 | 2026-11-09 |

## 背景
使用者在門禁 B 時新增需求，裁決見 `.studio/decisions/B-gate.md`（先讀）。現有已核可情境在 `features/`（110 個），其他裁決在 `.studio/decisions/A-pre-1.md`、`A-gate.md`。

## 交付要求
只「增補」，不改變既有情境意義（必要時只把「Excel」字樣泛化，例如情境裡的檔案描述）：
1. excel-import：
   - 舊式 .xls 能預覽並匯入（至少一個正常路徑；數字型儲存格讀顯示文字在 .xls 也成立）。
   - UTF-8 CSV（有 BOM、無 BOM）能預覽並匯入；值原樣為字串（前導 0 保留，例如 "007"）；逗號、引號包住的欄位、欄位內含逗號的姓名。
   - 非 UTF-8 CSV（Big5）→ 不接受，告知無法讀取並提示以 CSV UTF-8 另存。
   - CSV 也依標題名稱對應欄位、缺標題整份不接受、只有標題列、空檔、前後空白去除，與 .xlsx 規則一致（可用 Scenario Outline 以「檔案格式」為維度，避免重複寫太多情境）。
   - 「隨機二進位資料」仍然無法讀取。
2. excel-export：
   - 可選 .xlsx、.xls、CSV 三種格式匯出全部資料；標題與欄位順序一致；值以字串保留。
   - 每種格式匯出後再匯入能完整還原（Outline）。
   - CSV 匯出為 UTF-8（含 BOM）；空名單匯出只有標題列的範本（三種格式皆然）。
3. 每個新情境標 `@table:` 與 `@ui`／`@api`；不出現 `@wip`；步驟描述行為不描述 UI 實作。

**驗收標準**：
- [ ] 上述每點對應到具體情境名稱。
- [ ] 既有 110 情境的意義不變（回報列出你改動了哪些既有情境的文字及理由）。
- [ ] `$TMPDIR/gate-venv/bin/python ~/.claude/skills/agency-studio/scripts/gate.py check A --project ~/Project/ochema` 解析通過（鎖定檢查會因改動而報失敗，這是預期，請在回報註明）。

## 回報
寫到 `.studio/handoffs/01-product-formats-reply.md`：新增／修改情境清單、各 feature 情境數、待決問題。
