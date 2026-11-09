# 交接單：3 — 工程部（第二段 B：前端實作）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 前端開發者（工程部） |
| 階段 | 3b — UI 綠燈 |
| 時間 | 2026-11-09 |

## 背景
紅燈已完成（回報 `.studio/handoffs/03-engineering-red-reply.md`）。UI 規格：`design/ia.md`、選定方向 `design/directions/ledger/`（brief.md 為規範，index.html 為原型，可沿用其 CSS 與結構）。@ui step 的可及名稱與角色約定在 `tests/support/ui.ts` 檔頭。資料層 API：`docs/data-contract.md`。所有 UX 裁決：`.studio/log.md`、`docs/data-contract.md` 兩個附錄（匯入確認：無重複時不顯示選項；有重複時必選、未選前確認停用；CSV 匯出前導 0 提示；.xls 超量提示）。
資深開發者**同時**在實作 `src/data/**`，請勿修改該目錄；開發時以契約簽名為準，資料層未完成前 UI 測試可能因 not implemented 而紅，屬正常。
**限制**：不可改 `features/`、`schema.dbml`、`src/data/**`；**不可修改 `tests/steps/**`、`tests/support/**`**——確信測試有錯就寫進回報並附證據。執行期不得依賴外部網址；系統字型；遵守 `prefers-reduced-motion`；對比 AA；鍵盤可操作。

## 交付要求
1. 實作 `src/App.tsx`、`src/main.tsx`、`src/ui/**`（元件、樣式），依 ledger 方向完成 S1–S6、C1–C4（C5 不做）與微互動 L1–L3（reduced-motion 給靜態替代）。
2. PWA：registerType 'prompt'、不做更新提示 UI；manifest 名稱 ochema、theme 依 ledger token。圖示可沿用佔位，於回報列為已知限制。
3. 元件測試（如需）放 `tests/ui/*.test.tsx`：至少涵蓋 Q-D 提示、.xls 超量提示、匯入確認鈕在有重複時未選選項為停用。
4. 待資料層完成後（可輪詢 `.studio/handoffs/03-engineering-data-reply.md` 是否存在，上限 40 分鐘），跑全套 `npx vitest run` 讓所有 `@ui` 情境綠。
5. `pnpm build` 成功。

**驗收標準**：
- [ ] 所有 `@ui` 情境綠（資料層完成後）。
- [ ] 沒改受保護檔案。
- [ ] build 成功。
**沙箱**：npm/pnpm 加 `npm_config_cache=$TMPDIR/npm-cache`；不要用裸 ls；等待迴圈要有上限；沙箱內瀏覽器無法啟動，不要嘗試 agent-browser。

## 回報
寫到 `.studio/handoffs/03-engineering-ui-reply.md`：實作摘要、測試數字、待決問題。
