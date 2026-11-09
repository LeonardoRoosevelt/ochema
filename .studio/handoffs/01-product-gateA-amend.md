# 交接單：1 — 產品部（門禁 A 修訂）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 產品經理（產品部） |
| 階段 | 1 — 門禁 A 修訂 |
| 時間 | 2026-11-09 |

## 背景
使用者已核可情境，但要求三項修訂：`.studio/decisions/A-gate.md`（先讀）。另參考 `.studio/reviews/A-2.md` 的低嚴重度問題。

## 交付要求
1. 修訂 1（整列相同手動也擋下）：找出所有與「整列相同」相關的情境並改寫，至少涵蓋：
   - duplicate-detection「四欄完全相同的整列」等情境：從「標示／通知」改為「新增或編輯時擋下並說明原因，資料不變」；總覽、名單標示中不再會出現「整列相同」這一類（因為不可能存在）。
   - 新增／編輯「存檔當下告知重複種類」的 Outline：移除整列相同那一列，改成獨立的擋下情境（新增、編輯各一）。
   - excel-export「含重複的名單匯出再匯入…完整還原」等情境：確認與新規則一致。
   - field-validation／record-management 若有相關描述同步。
2. 修訂 2：excel-import 新增情境——預覽單獨列出整列相同的列，並告知兩種選項都不會匯入。
3. 修訂 3：excel-import 新增情境——第 2 列與既有重複、第 5 列只與第 2 列重複 → 預覽中第 5 列歸「檔內重複」；選略過重複時兩列都不匯入（斷言匯入筆數）。
4. 順手修 A-2 的低問題 2–5：原因代碼多個同時成立時的優先序寫在 feature 註解；預覽中整列相同的種類寫法統一；excel-import 檔頭原因代碼清單與 field-validation 一致；明寫「檔案第 N 列」以標題列為第 1 列。
5. 不要動其他已核可情境的意義。

**驗收標準**：
- [ ] 三項修訂各對應到具體情境名稱。
- [ ] 全部 feature 中不再有「整列相同可以存入／只通知」的描述。
- [ ] `$TMPDIR/gate-venv/bin/python ~/.claude/skills/agency-studio/scripts/gate.py check A --project ~/Project/ochema` 通過。

## 回報
寫到 `.studio/handoffs/01-product-gateA-amend-reply.md`：每項修訂 → 改動的情境名稱（新增／修改／刪除），各 feature 情境數。
