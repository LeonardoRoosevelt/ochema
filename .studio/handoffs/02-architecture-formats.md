# 交接單：2 — 架構部（資料契約更新）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 後端架構師（架構部） |
| 階段 | 2a — 契約增修 |
| 時間 | 2026-11-09 |

## 背景
門禁 A（141 情境）與 B（schema.dbml、ledger 方向）已核可並鎖定。使用者新增 .xls／CSV 匯入與三格式匯出：`.studio/decisions/B-gate.md`（含製片人裁決）。代碼審查員門禁 B 意見：`.studio/reviews/B-1.md`。
**限制**：不可改 `features/`、`schema.dbml`（已鎖定）。

## 交付要求
1. 更新 `docs/data-contract.md`：
   - 讀檔：判定順序（長度 0／只有 BOM → EMPTY_FILE；PK → xlsx；D0CF11E0 → xls；合法 UTF-8 且無 NUL → CSV；其他 → UNREADABLE＋非 UTF-8 時的提示碼）；CSV 用 SheetJS 或自寫 RFC 4180 解析的取捨（必須保持字串原樣、不轉數字）；少欄／多欄規則；fileRow 定義。
   - 匯出：`exportRecords(format: 'xlsx'|'xls'|'csv')` 簽名、檔名與 MIME、CSV UTF-8＋BOM、各格式以文字儲存格保留前導 0。
   - 追溯表補上新增的 31 個情境。
   - 吸收 B-1 建議 2–10：測試 helper 可直接用 xlsx 造 fixture／讀回驗證；kinds 固定順序；標題 trim；全空白列定義；IndexedDB 交易注意事項；SAME_ID_DIFF_NAME 邊界記錄；SheetJS 前後空白字串寫出再讀回需驗證（xml:space）。
2. 把 SheetJS CE 0.20.3 tgz 放到 `vendor/xlsx-0.20.3.tgz`（來源 https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz），驗證 SHA-256＝`8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`，並把雜湊記進 data-contract。
3. 用暫存目錄實測：SheetJS 讀 .xls（數字型儲存格顯示文字）、CSV（"007" 保持字串）、寫出三種格式前導 0 與前後空白的往返。實測腳本與輸出存到 `.studio/evidence/sheetjs-probe/`（不要在專案 node_modules 安裝）。

**驗收標準**：
- [ ] 新增 31 個情境都在追溯表。
- [ ] tgz 雜湊相符。
- [ ] 實測證據存檔，結論寫進契約（含任何 SheetJS 做不到、需自寫的部分）。

## 回報
寫到 `.studio/handoffs/02-architecture-formats-reply.md`：變更摘要、實測結論、待決問題。
