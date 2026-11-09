# 交接單：2 — 設計部（UI 設計師）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | UI 設計師（設計部） |
| 階段 | 2b-2 — 創意方向 |
| 時間 | 2026-11-09 |

## 背景
**需求**：ochema——車輛所屬名單（車頭、車尾、姓名、身分證）離線 PWA。核心任務是「快速查到某台車頭／車尾屬於誰」。
**目前狀態**：UX 架構師已完成 `design/ia.md`（先完整讀；第 8 節是每個方向都必須涵蓋的 21 條清單）。製片人對 UX 待決問題的裁決在 `.studio/log.md` 最後一段。
**相關檔案**：`design/ia.md`、`features/*.feature`、`~/Project/BloomIn/`（同一使用者的另一個 App，可看其視覺做為對照，但方向不必相同）。
**限制**：
- 技術棧 React 19＋Vite；可選用 shadcn/ui（含 Tailwind）與 Magic UI／Aceternity registry 元件，但 session 內沒有 shadcn MCP，改用 `npx shadcn@latest search/view` CLI（加 `npm_config_cache=$TMPDIR/npm-cache`）。若方向不需要這些，也可以手寫 CSS——寫清楚選擇。
- 執行期不可依賴外部網址：字型自帶（列出字型檔與授權）或用系統字。繁體中文排版要好看。
- 車牌字串（929-X2、KLP-7988）是主角，要易讀、易比對（等寬或表格數字）。
- 無障礙：對比 AA、鍵盤可操作、`prefers-reduced-motion`。

## 交付要求
**產出**：`design/directions/<代號>/` 共 3 個方向（代號用英文小寫，例如 `ledger`），每個含：
- `brief.md`：一句話概念；色彩／字體／間距／動效 token；選用元件清單；與其他方向的差異；**刻意不做什麼**。
- `index.html`：可直接用瀏覽器開啟的靜態原型（單檔或同資料夾資源，不引用外部 CDN），至少呈現：S1 名單（含重複標示與身分證警示的資料列、查詢中）、S4b 匯入預覽（含整列相同提醒）、S2 表單的擋下訊息。可用分頁或錨點切換。
- `screenshot-desktop.png`（1440 寬）、`screenshot-mobile.png`（390 寬）：用 agent-browser 截圖（`agent-browser open file://...`；`agent-browser --help` 查截圖與視窗大小指令）。**完成後務必 `agent-browser close`**。
**驗收標準**：
- [ ] 3 個方向概念上真正不同（不是換色），避開「白底＋紫藍漸層＋Inter＋圓角卡片」預設感。
- [ ] 每個方向都涵蓋 ia.md 第 8 節清單（brief 內附逐條勾選）。
- [ ] 每個方向都有 brief.md、index.html、兩張 png。
**規範**：`~/.claude/skills/agency-studio/references/frontend-toolkit.md`（創意方向流程）；可使用 `frontend-design`、`ui-ux-pro-max` skill 發想。

## 回報
寫到 `.studio/handoffs/02-design-ui-reply.md`：三個方向的一句話概念、截圖路徑、元件／字型選擇、待決問題。
