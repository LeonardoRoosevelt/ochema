# 回報：2 — 設計部（UI 設計師）創意方向

| 欄位 | 值 |
|---|---|
| 發送方 | UI 設計師（設計部） |
| 接收方 | 製片人 |
| 階段 | 2b-2 — 創意方向 |
| 時間 | 2026-11-09 |

## 完成了什麼
三個方向的 `brief.md` 與 `index.html` 已完成；**四張必要截圖（每方向桌面＋手機）未產出**，原因見「待決問題 1」。

| 方向 | 一句話概念 | 路徑 |
|---|---|---|
| ledger（帳冊） | 把名單當成認真記帳的車籍簿：紙張底色、襯線標題、細線表格，重複用「蓋章」、擋下用「雙線框」。 | `design/directions/ledger/` |
| plate（車牌） | 每一筆資料是一塊實體車牌：車頭白底、車尾黃底、帶「頭／尾」字樣的凸起牌子，介面是厚實可按壓的物件。 | `design/directions/plate/` |
| signal（訊號） | 把名單當成即時監看的資料牆：頂部跳動數字與跑馬燈報告現況，搜尋像下指令，命中時掃描閃現。 | `design/directions/signal/` |

## 產出檔案
- `design/directions/{ledger,plate,signal}/brief.md`：概念、token（亮／暗）、對比實算表、字體、動效、元件、差異、刻意不做、ia.md 第 8 節 21 條逐條勾選。
- `design/directions/{ledger,plate,signal}/index.html`：單檔靜態原型，無外部資源；頁首「原型畫面」錨點可跳到 S1、查詢中、空／無結果、載入／錯誤、C1、S2×2、S3、S4a/b/c、S5×2、S6、訊息語意共 15 個畫面。可用 `?theme=dark` / `?theme=light` 直接開啟指定主題，S6 與右上按鈕可即時切換。
- 截圖（待補）：`screenshot-desktop.png`（1440）、`screenshot-mobile.png`（390），各方向資料夾內。

## 元件／字型選擇
- 元件：三方向皆手寫 CSS，未使用 shadcn／Magic UI／Aceternity（理由見各 brief）；registry URL 本次未驗證。實作時 Dialog、焦點陷阱建議用 shadcn（Radix）。
- 字型：全部系統字。介面 `PingFang TC／Noto Sans TC／Microsoft JhengHei`；ledger 標題 `Songti TC／Noto Serif TC／PMingLiU`；車牌與身分證 `ui-monospace／SF Mono／Menlo／Consolas`＋`tabular-nums`。無打包字型、無授權問題。

## 已執行的檢查
- 對比：三方向、亮暗兩主題共 15 組配對 × 6 組，加上四種語意前景色對各底色的交叉驗證，全部達 AA（文字 ≥ 4.5:1，邊框與焦點框 ≥ 3:1）。腳本計算，數值在各 brief。
- HTML：標籤平衡、無重複 id、無 `http(s)://` 外部網址。
- **未做**：瀏覽器實際渲染（版面是否破版、手機卡片是否溢出）。手機寬度用字級與欄寬估算過，但沒有看過實圖。

## 待決問題
1. **截圖與渲染驗證被沙箱擋下（需製片人處理）**：agent-browser 在本子代理沙箱內啟動 Chrome 失敗（`crashpad ... Permission denied (1100)`，exit code 21）。已照規則單獨下指令、並試過 `--profile`、`--args`，皆無效；沒有使用任何繞過沙箱的方式。需要在可啟動的環境（主 session 或使用者自跑）逐條單獨執行：
   ```
   agent-browser set viewport 1440 900
   agent-browser open file:///Users/leonardoroosevelt/Project/ochema/design/directions/ledger/index.html
   agent-browser screenshot --full /Users/leonardoroosevelt/Project/ochema/design/directions/ledger/screenshot-desktop.png
   agent-browser set viewport 390 844
   agent-browser screenshot --full /Users/leonardoroosevelt/Project/ochema/design/directions/ledger/screenshot-mobile.png
   ```
   （換 `plate`、`signal` 重複；改視窗大小後可能要 `reload`；可另加 `?theme=dark` 各拍一張暗色。）最後 `agent-browser close`。補拍時請一併檢查手機版 plate／signal 的車牌是否溢出卡片。
2. **UX 清單未涵蓋的新增元素（signal）**：頂部「共 N 筆／重複 N 組／警示 N 筆」狀態列與跑馬燈。內容皆取自既有資料，但屬 ia.md 之外的元件，需製片人確認是否接受。
3. **plate 的車尾黃牌**是設計手法非法規色，是否與使用者業務習慣衝突？（已用「頭／尾」字樣避免只靠顏色。）
4. **ledger 的蓋章旋轉 -1.5°**：是否可接受？
5. 手機卡片與桌面表格目前共用同一份 `<table>` 以 CSS 轉換；螢幕閱讀器行為需前端實測，必要時改兩套標記。
6. 原型的輸入框為靜態，查詢不會真的篩選；IME 組字行為屬實作驗證。
