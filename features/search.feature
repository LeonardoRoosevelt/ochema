Feature: 查詢名單
  為了 快速找到某台車或某個人的資料
  身為 裝置擁有者
  我想要 輸入關鍵字，就列出任一欄位部分符合的資料

  Background:
    Given 名單上有以下資料：
      | 車頭車號     | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 929-X2   | 20-9A | 王小明 | A123456789 |
      | KLP-7988 | OL-02 | 李美玲 | F131104093 |
      | 5566-AB  | 20-9B | 王大華 | A800000014 |

  @ui @table:vehicle_records
  Scenario Outline: 以任一欄位的部分文字查詢
    When 我查詢 "<關鍵字>"
    Then 結果列出車頭車號為 <結果車頭車號> 的資料

    Examples:
      | 關鍵字     | 結果車頭車號                |
      | 7988       | "KLP-7988"              |
      | 20-9       | "929-X2"、"5566-AB"     |
      | 王         | "929-X2"、"5566-AB"     |
      | F131       | "KLP-7988"              |
      | OL-02      | "KLP-7988"              |

  @ui @table:vehicle_records
  Scenario: 查詢不分大小寫
    When 我查詢 "klp"
    Then 結果列出車頭車號為 "KLP-7988" 的資料

  @ui @table:vehicle_records
  Scenario: 查無符合時顯示沒有結果
    When 我查詢 "ZZZ"
    Then 結果是空的
    And 畫面顯示查無符合的資料

  @ui @table:vehicle_records
  Scenario: 清除關鍵字後回到完整名單
    Given 我查詢了 "王"
    When 我清除關鍵字
    Then 名單列出全部 3 筆資料

  @ui @table:vehicle_records
  Scenario: 關鍵字前後的空白會被忽略
    When 我查詢 " 7988 "
    Then 結果列出車頭車號為 "KLP-7988" 的資料

  @ui @table:vehicle_records
  Scenario: 駕駛身分證在查詢結果中完整顯示
    When 我查詢 "李美玲"
    Then 結果中的駕駛身分證完整顯示為 "F131104093"

  @ui @table:vehicle_records
  Scenario: 在查詢結果中編輯後，查詢條件保持
    Given 我查詢了 "王"
    When 我把車頭車號 "929-X2" 那筆的駕駛姓名改成 "王小美" 並儲存
    Then 結果仍依 "王" 篩選
    And 結果列出車頭車號為 "929-X2"、"5566-AB" 的資料
