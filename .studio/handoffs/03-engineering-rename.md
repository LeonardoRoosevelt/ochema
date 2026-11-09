# 交接單：3 — 工程部（欄位改名同步）

| 欄位 | 值 |
|---|---|
| 發送方 | 製片人 |
| 接收方 | 前端開發者（兼資料層，工程部） |
| 階段 | 3 — 改名同步 |
| 時間 | 2026-11-09 |

## 背景
使用者裁決 `.studio/decisions/rename-fields.md`；`features/` 已更新用詞並重新核可（142 情境，新增「使用舊欄位標題…的檔案不接受」）。商業規則不變；DBML 與內部欄位名（headPlate 等）不變。
**本次使用者授權修改 `tests/steps/**`、`tests/support/**`**，但只限把步驟文字／標題／種類名稱同步為新用詞，以及為新情境加 step；**不得放寬任何斷言**。

## 交付要求
1. `src/**`：Excel 匯入對應標題與匯出標題改為「車頭車號、車斗車號、駕駛姓名、駕駛身分證」（只接受新標題）；所有畫面文字（表頭、表單標籤與說明、錯誤訊息、匯入預覽、總覽、通知、可及名稱、aria-label）與重複種類名稱（同車頭車號、同車斗車號、同駕駛身分證不同姓名、整列相同）同步。手機卡片與表頭若因變長而擠壓，調整 CSS 讓版面不破（390 寬）。
2. `tests/steps/**`、`tests/support/**`、`tests/ui/**`、`tests/data/**`、`tests/qa/**`：同步新用詞；為新情境補 step（若既有 step 可覆蓋則不必）。新情境預期列出全部四個缺少的新標題。
3. `docs/data-contract.md`、`README.md`、`design/ia.md`（用詞）、`scripts/evidence.mjs`（選擇器、標題、fixture 標題列）同步。
4. 先執行 `scripts/bdd-dryrun.sh`（不得缺 step），再 `npx vitest run`（全綠，序列執行，勿同時 build），`pnpm build` 成功，`node --check scripts/evidence.mjs`。
5. 自查：`rg -n "車頭|車尾|姓名|身分證" src tests scripts docs README.md` 中所有使用者可見字串都已是新名稱；列出刻意保留舊詞之處（例如舊標題拒收測試）。
不可修改 `features/`、`schema.dbml`。npm 相關加 `npm_config_cache=$TMPDIR/npm-cache`；不要用裸 ls；沙箱內不能開瀏覽器。

## 回報
寫到 `.studio/handoffs/03-engineering-rename-reply.md`：改動檔案、測試數字、build、自查結果、版面調整說明。
