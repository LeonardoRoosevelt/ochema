# ochema — 車輛所屬名單查詢

單機離線 PWA。管理「車頭、車尾、姓名、身分證」名單，可查詢、檢查重複與格式、Excel 匯入匯出。
所有資料只存在裝置本機的 IndexedDB，**不會傳送到任何伺服器**。

## 開發

```bash
pnpm install
pnpm dev --host      # 手機／平板可用同區網 IP 連進來測版面
pnpm build           # 產生 dist/
pnpm test            # BDD（features/*.feature）＋單元測試
```

> `pnpm dev` 走 http，瀏覽器不允許註冊 Service Worker，因此開發模式**沒有離線能力**，這是預期行為。

- 需求：`features/*.feature`（Gherkin）；資料結構：`schema.dbml`；資料層契約：`docs/data-contract.md`。
- Excel 函式庫 SheetJS CE 0.20.3 放在 `vendor/xlsx-0.20.3.tgz`（npm 上的 `xlsx` 0.18.5 有已知 CVE，不可用）。
  SHA-256：`8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`
- 實機證據腳本（需真瀏覽器，沙箱外執行）：`bash scripts/evidence.sh`，結果在 `.studio/evidence/`。

## 部署

Service Worker 只能在 HTTPS 下註冊，所以必須把 `dist/` 靜態檔案放上一個 HTTPS 網址才能安裝成 App。
託管的只是程式碼，資料仍然 100% 留在裝置上。

本專案部署到 **GitHub Pages 專案頁**：`https://<user>.github.io/ochema/`。
推送到 `main` 後由 `.github/workflows/deploy.yml` 自動建置並發布（測試沒過就不會部署）。

首次設定：在 repo 的 Settings → Pages → Source 選 **GitHub Actions**。

### 改網址要動的地方

`vite.config.ts` 的 `base`，以及同檔 manifest 的 `start_url` / `scope` 與 workbox 的 `navigateFallback`，要一起改。

> ⚠️ **換網址等於換掉瀏覽器儲存區，資料不會跟著搬。**
> 真的要換：先在舊網址匯出備份 → 開新網址 → 匯入還原。

## 安裝到 iPhone / iPad

1. 用 **Safari** 開啟部署後的網址
2. 分享 → **加入主畫面**
3. 從主畫面圖示啟動

新版本會在所有 ochema 視窗都關閉後、下次開啟時生效（不會在操作中途重新載入）。

## ⚠️ 資料保存

資料存在該網站的瀏覽器儲存區。**刪除主畫面圖示、或清除網站資料，名單會一併消失且無法復原。**
請定期在「資料」頁匯出 Excel（建議 .xlsx）存到 iCloud Drive。

## 匯入匯出規則摘要

- 匯入支援 .xlsx、.xls、CSV（僅 UTF-8；Big5 會提示改存「CSV UTF-8」）。格式依檔案內容判斷，不看副檔名。
- 標題列固定在第 1 列，依標題名稱（車頭、車尾、姓名、身分證）對應欄位。
- 匯出可選 .xlsx（預設）、.xls、CSV；一律匯出全部資料。
- 用 Excel 直接開啟 CSV 時，前導 0 可能被吃掉；要編輯請用 .xlsx。

## 已知限制

見 `.studio/delivery.md`「已知限制」。
