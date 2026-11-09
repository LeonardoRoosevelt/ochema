Feature: 離線使用與本機資料
  為了 在沒有網路的地方也能查名單，且資料不外流
  身為 裝置擁有者
  我想要 App 安裝後完全離線可用，資料只留在這台裝置

  # jsdom 不是真瀏覽器：離線能力以「建置產物」檢查預先快取清單；
  # 「不傳任何伺服器」以攔截網路 API 驗證；真實斷網安裝屬手動驗收。
  # 「裝置沒有網路連線」的定義：navigator.onLine 為 false，且所有 fetch、XMLHttpRequest、sendBeacon 一律失敗。

  @api @table:none
  Scenario: 建置產物預先快取 App 外殼與所有執行時資源
    Given 已完成正式建置
    When 我檢查建置產物的預先快取清單
    Then 清單包含入口頁面
    And 清單包含建置產物中所有的 JS 與 CSS 檔
    And 清單包含 App 圖示

  @api @table:none
  Scenario: 執行時所需資源不依賴外部網址
    Given 已完成正式建置
    When 我檢查建置產物中引用的資源網址
    Then 沒有任何資源指向外部網域（例如 CDN 或外部字型）

  @api @table:none
  Scenario: 建置產物具備可安裝的 Web App 資訊
    Given 已完成正式建置
    When 我檢查 Web App manifest
    Then manifest 有名稱、獨立視窗顯示模式與至少一個圖示
    And 建置產物包含 service worker 並會在啟動時註冊

  @api @table:none
  Scenario: 新版本更新期間不中斷目前操作，也不遺失資料
    Given 已完成正式建置
    When 我檢查 service worker 的更新設定
    Then 新版本取得後不會自動重新載入正在使用的頁面
    And 更新機制不會清除或重建本機資料庫

  @ui @table:vehicle_records
  Scenario: 無網路時仍可查詢
    Given 名單上有一筆資料：車頭車號 "929-X2"、車斗車號 "20-9A"、駕駛姓名 "王小明"、駕駛身分證 "A123456789"
    And 裝置沒有網路連線
    When 我查詢 "929"
    Then 結果列出車頭車號為 "929-X2" 的資料

  @ui @table:vehicle_records
  Scenario: 無網路時仍可新增
    Given 名單是空的
    And 裝置沒有網路連線
    When 我新增一筆資料：車頭車號 "KLP-7988"、車斗車號 "OL-02"、駕駛姓名 "李美玲"、駕駛身分證 "F131104093"
    Then 資料已存檔
    And 名單上有 1 筆資料

  @ui @table:vehicle_records
  Scenario: 無網路時仍可匯出
    Given 名單上有一筆資料：車頭車號 "929-X2"、車斗車號 "20-9A"、駕駛姓名 "王小明"、駕駛身分證 "A123456789"
    And 裝置沒有網路連線
    When 我要求匯出名單
    Then 我取得一個 Excel 檔案
    And 匯出的 Excel 檔有 1 列資料

  @ui @table:vehicle_records
  Scenario: 無網路時仍可預覽並匯入 Excel
    Given 名單是空的
    And 裝置沒有網路連線
    And 一份 Excel 檔，標題列為 車頭車號、車斗車號、駕駛姓名、駕駛身分證，內容如下：
      | 車頭車號   | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 929-X2 | 20-9A | 王小明 | A123456789 |
    When 我預覽並選擇「略過重複」後確認匯入
    Then 名單上有 1 筆資料

  @ui @table:vehicle_records
  Scenario: 所有操作都不對外發出網路請求
    Given 名單是空的
    When 我新增、編輯、查詢、匯入、匯出並刪除資料
    Then 整個過程沒有任何對外的網路請求

  @ui @table:none
  Scenario: 畫面說明資料只存在這台裝置並提醒備份
    When 我開啟 App
    Then 畫面說明資料只存在這台裝置上
    And 畫面提醒定期匯出 Excel 作為備份
