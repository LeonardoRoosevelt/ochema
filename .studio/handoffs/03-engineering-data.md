# 交接單：3 — 工程部（第二段 A：資料層實作）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 資深開發者（工程部） |
| 階段 | 3b — 資料層綠燈 |
| 時間 | 2026-11-09 |

## 背景
紅燈已完成（`.studio/evidence/red.txt`；回報 `.studio/handoffs/03-engineering-red-reply.md`）。契約 `docs/data-contract.md`（含兩個「附錄：製片人裁決」，最新者優先）。前端開發者**同時**在實作 UI（`src/App.tsx`、`src/main.tsx`、`src/ui/**`、樣式），請勿修改那些檔案。
**限制**：不可改 `features/`、`schema.dbml`；**不可修改 `tests/steps/**`、`tests/support/**`** 來讓測試通過——若確信測試本身有錯，不要改，寫進回報「待決問題」並附證據。

## 交付要求
1. 實作 `src/data/**` 全部模組，讓所有 `@api` 情境與建置情境綠燈（`@ui` 情境由前端負責，可能仍紅）。
2. 新增單元測試 `tests/data/*.test.ts`，補契約有、features 未涵蓋的規則（附錄所列：格式錯誤列不參與比對、CSV 引號未收尾 → UNREADABLE、Q-E 邊界、.xls 匯出超過 65,536 列告知、kinds 固定順序、IndexedDB ConstraintError 不成為 unhandled rejection）。這些測試必須能在規則被破壞時失敗。
3. 遵守契約 §7.1 的 IndexedDB 注意事項（交易內不夾非 idb await；tx.done reject 要接；測試重置先 close 再 delete）。
4. 若需調整契約（簽名、型別），直接更新 `docs/data-contract.md` 並在回報列出差異。

**驗收標準**：
- [ ] `npx vitest run` 中所有 `@api` 與建置情境綠；`tests/data/*.test.ts` 綠。
- [ ] `pnpm build` 成功。
- [ ] 沒改 tests/steps、tests/support、features、schema.dbml。
**沙箱**：npm/pnpm 加 `npm_config_cache=$TMPDIR/npm-cache`；不要用裸 ls；等待迴圈要有上限。

## 回報
寫到 `.studio/handoffs/03-engineering-data-reply.md`：實作摘要、測試數字（@api 綠／總數、單元測試數）、契約變更、待決問題。
