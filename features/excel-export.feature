Feature: Excel 匯出
  為了 備份名單，或把名單交給別的工具使用
  身為 裝置擁有者
  我想要 把名單匯出成 Excel 檔，且再匯入時能完整還原

  # 資料只存在這台裝置上，匯出檔就是備份
  # 匯出一律是全部資料，不受查詢條件影響；空名單輸出只有標題列的範本檔
  # 名單上不會有四欄完全相同的兩筆（手動新增／編輯會擋下，匯入也不收），
  #   所以任何名單匯出再匯入（照樣匯入）都能完整還原，沒有例外

  @api @table:vehicle_records
  Scenario: 匯出檔的標題與欄位順序
    Given 名單上有以下資料：
      | 車頭車號     | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 929-X2   | 20-9A | 王小明 | A123456789 |
      | KLP-7988 | OL-02 | 李美玲 | F131104093 |
    When 我匯出名單
    Then 匯出檔第一列標題依序為 車頭車號、車斗車號、駕駛姓名、駕駛身分證
    And 匯出檔有 2 列資料，順序與名單一致

  @api @table:vehicle_records
  Scenario: 所有值以文字保留，前導 0 不消失
    Given 名單上有以下資料：
      | 車頭車號     | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 0012-007 | 00-01 | 007    | A123456789 |
    When 我匯出名單
    Then 匯出檔中車頭車號儲存格的值是文字 "0012-007"
    And 匯出檔中車斗車號儲存格的值是文字 "00-01"
    And 匯出檔中駕駛姓名儲存格的值是文字 "007"

  @api @table:vehicle_records
  Scenario: 重複與警示的資料也如實匯出
    Given 名單上有以下資料：
      | 車頭車號   | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 929-X2 | 20-9A | 王小明 | A123456788 |
      | 929-X2 | 30-1B | 李美玲 | F131104093 |
    When 我匯出名單
    Then 匯出檔有 2 列資料
    And 匯出檔的內容與名單完全一致，沒有額外欄位

  @api @table:vehicle_records
  Scenario: 匯出後再匯入能完整還原
    Given 名單上有以下資料：
      | 車頭車號     | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 0012-007 | 00-01 | 王小明 | A123456789 |
      | KLP-7988 | OL-02 | 李美玲 | AB12345678 |
    And 我已把名單匯出成 Excel 檔
    And 我把名單全部刪除
    When 我預覽並選擇「照樣匯入」後確認匯入這份匯出檔
    Then 名單上的資料與匯出前完全相同

  @api @table:vehicle_records
  Scenario: 含重複的名單匯出再匯入，選擇照樣匯入仍能完整還原
    Given 名單上有以下資料：
      | 車頭車號   | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 929-X2 | 20-9A | 王小明 | A123456789 |
      | 929-X2 | 30-1B | 李美玲 | F131104093 |
    And 我已把名單匯出成 Excel 檔
    And 我把名單全部刪除
    When 我預覽並選擇「照樣匯入」後確認匯入這份匯出檔
    Then 匯入結果顯示 已匯入 2 筆、略過 0 筆
    And 名單上的資料與匯出前完全相同

  @api @table:vehicle_records
  Scenario: 名單為空時匯出只有標題列的範本檔
    Given 名單是空的
    When 我匯出名單
    Then 匯出檔第一列標題依序為 車頭車號、車斗車號、駕駛姓名、駕駛身分證
    And 匯出檔沒有任何資料列

  @api @table:vehicle_records
  Scenario: 空名單匯出的範本檔可再匯入，預覽告知沒有可匯入的資料
    Given 名單是空的
    And 我已把名單匯出成 Excel 檔
    When 我預覽匯入這份匯出檔
    Then 預覽告知檔案內沒有可匯入的資料

  @api @table:vehicle_records
  Scenario: 含特殊字元的駕駛姓名原樣匯出
    Given 名單上有以下資料：
      | 車頭車號   | 車斗車號  | 駕駛姓名          | 駕駛身分證     |
      | 929-X2 | 20-9A | 歐陽・小明    | A123456789 |
    When 我匯出名單
    Then 匯出檔中駕駛姓名儲存格的值是文字 "歐陽・小明"

  @ui @table:vehicle_records
  Scenario: 在畫面上匯出並取得檔案
    Given 名單上有一筆資料：車頭車號 "929-X2"、車斗車號 "20-9A"、駕駛姓名 "王小明"、駕駛身分證 "A123456789"
    When 我要求匯出名單
    Then 我取得一個 Excel 檔案
    And 畫面告知已匯出 1 筆資料

  @ui @table:vehicle_records
  Scenario: 名單為空時在畫面上匯出，取得只有標題列的範本檔
    Given 名單是空的
    When 我要求匯出名單
    Then 我取得一個只有標題列的 Excel 檔案
    And 畫面告知已匯出 0 筆資料

  @ui @table:vehicle_records
  Scenario: 查詢結果篩選中時，匯出仍是全部資料
    Given 名單上有以下資料：
      | 車頭車號     | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 929-X2   | 20-9A | 王小明 | A123456789 |
      | KLP-7988 | OL-02 | 李美玲 | F131104093 |
    And 我查詢了 "王"，畫面只列出 1 筆
    When 我要求匯出名單
    Then 匯出的 Excel 檔有 2 列資料，包含駕駛姓名 "王小明" 與 "李美玲"
    And 畫面告知已匯出 2 筆資料

  # ===== 範圍變更（門禁 B，使用者裁決）：匯出可選 .xlsx、.xls、CSV 三種格式 =====
  # 本檔上方既有情境未指明格式者，皆為 .xlsx（意義不變）；以下新增情境以「匯出格式」為維度
  #   匯出格式的取值：.xlsx、.xls、CSV
  # 三種格式匯出的都是全部資料，標題與欄位順序一致，值皆為原字串（CSV 無型別，同樣原樣）
  # CSV 匯出為 UTF-8 並帶 BOM（Excel 開啟中文不亂碼）；空名單三種格式皆輸出只有標題列的範本

  @api @table:vehicle_records
  Scenario Outline: 各格式匯出檔的標題與欄位順序一致
    Given 名單上有以下資料：
      | 車頭車號     | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 929-X2   | 20-9A | 王小明 | A123456789 |
      | KLP-7988 | OL-02 | 李美玲 | F131104093 |
    When 我把名單匯出成 <匯出格式>
    Then 匯出檔第一列標題依序為 車頭車號、車斗車號、駕駛姓名、駕駛身分證
    And 匯出檔有 2 列資料，順序與名單一致

    Examples:
      | 匯出格式 |
      | .xlsx    |
      | .xls     |
      | CSV      |

  @api @table:vehicle_records
  Scenario Outline: 各格式匯出的值都以文字保留，前導 0 不消失
    Given 名單上有以下資料：
      | 車頭車號     | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 0012-007 | 00-01 | 007    | A123456789 |
    When 我把名單匯出成 <匯出格式>
    Then 匯出檔中車頭車號的值是文字 "0012-007"
    And 匯出檔中車斗車號的值是文字 "00-01"
    And 匯出檔中駕駛姓名的值是文字 "007"

    Examples:
      | 匯出格式 |
      | .xlsx    |
      | .xls     |
      | CSV      |

  @api @table:vehicle_records
  Scenario: CSV 匯出為帶 BOM 的 UTF-8
    Given 名單上有一筆資料：車頭車號 "929-X2"、車斗車號 "20-9A"、駕駛姓名 "王小明"、駕駛身分證 "A123456789"
    When 我把名單匯出成 CSV
    Then 匯出檔的編碼是 UTF-8，且開頭帶有 BOM
    And 匯出檔中駕駛姓名的值是文字 "王小明"

  @api @table:vehicle_records
  Scenario: CSV 匯出時，含逗號與引號的值以引號包住並原樣還原
    Given 名單上有以下資料：
      | 車頭車號     | 車斗車號  | 駕駛姓名      | 駕駛身分證     |
      | 929-X2   | 20-9A | 王,小明   | A123456789 |
      | KLP-7988 | OL-02 | 李"美玲"  | F131104093 |
    And 我已把名單匯出成 CSV
    And 我把名單全部刪除
    When 我預覽並選擇「照樣匯入」後確認匯入這份匯出檔
    Then 名單上的資料與匯出前完全相同

  @api @table:vehicle_records
  Scenario Outline: 各格式匯出後再匯入能完整還原
    Given 名單上有以下資料：
      | 車頭車號     | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 0012-007 | 00-01 | 007    | A123456789 |
      | KLP-7988 | OL-02 | 李美玲 | AB12345678 |
    And 我已把名單匯出成 <匯出格式>
    And 我把名單全部刪除
    When 我預覽並選擇「照樣匯入」後確認匯入這份匯出檔
    Then 名單上的資料與匯出前完全相同

    Examples:
      | 匯出格式 |
      | .xlsx    |
      | .xls     |
      | CSV      |

  @api @table:vehicle_records
  Scenario Outline: 各格式匯出含重複的名單再匯入，選擇照樣匯入仍能完整還原
    Given 名單上有以下資料：
      | 車頭車號   | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 929-X2 | 20-9A | 王小明 | A123456789 |
      | 929-X2 | 30-1B | 李美玲 | F131104093 |
    And 我已把名單匯出成 <匯出格式>
    And 我把名單全部刪除
    When 我預覽並選擇「照樣匯入」後確認匯入這份匯出檔
    Then 匯入結果顯示 已匯入 2 筆、略過 0 筆
    And 名單上的資料與匯出前完全相同

    Examples:
      | 匯出格式 |
      | .xlsx    |
      | .xls     |
      | CSV      |

  @api @table:vehicle_records
  Scenario Outline: 名單為空時各格式都匯出只有標題列的範本檔
    Given 名單是空的
    When 我把名單匯出成 <匯出格式>
    Then 匯出檔第一列標題依序為 車頭車號、車斗車號、駕駛姓名、駕駛身分證
    And 匯出檔沒有任何資料列

    Examples:
      | 匯出格式 |
      | .xlsx    |
      | .xls     |
      | CSV      |

  @api @table:vehicle_records
  Scenario Outline: 各格式空名單匯出的範本檔可再匯入，預覽告知沒有可匯入的資料
    Given 名單是空的
    And 我已把名單匯出成 <匯出格式>
    When 我預覽匯入這份匯出檔
    Then 預覽告知檔案內沒有可匯入的資料

    Examples:
      | 匯出格式 |
      | .xlsx    |
      | .xls     |
      | CSV      |

  @api @table:vehicle_records
  Scenario Outline: 各格式匯出含特殊字元的駕駛姓名都原樣保留
    Given 名單上有以下資料：
      | 車頭車號   | 車斗車號  | 駕駛姓名          | 駕駛身分證     |
      | 929-X2 | 20-9A | 歐陽・小明    | A123456789 |
    When 我把名單匯出成 <匯出格式>
    Then 匯出檔中駕駛姓名的值是文字 "歐陽・小明"

    Examples:
      | 匯出格式 |
      | .xlsx    |
      | .xls     |
      | CSV      |

  @ui @table:vehicle_records
  Scenario: 沒有另外選擇格式直接匯出，預設取得 .xlsx 檔案
    Given 名單上有一筆資料：車頭車號 "929-X2"、車斗車號 "20-9A"、駕駛姓名 "王小明"、駕駛身分證 "A123456789"
    When 我沒有另外選擇匯出格式，直接要求匯出名單
    Then 我取得一個 .xlsx 格式的檔案
    And 畫面告知已匯出 1 筆資料

  @ui @table:vehicle_records
  Scenario Outline: 在畫面上選擇格式匯出並取得對應的檔案
    Given 名單上有一筆資料：車頭車號 "929-X2"、車斗車號 "20-9A"、駕駛姓名 "王小明"、駕駛身分證 "A123456789"
    When 我選擇以 <匯出格式> 匯出名單
    Then 我取得一個 <匯出格式> 格式的檔案
    And 畫面告知已匯出 1 筆資料

    Examples:
      | 匯出格式 |
      | .xlsx    |
      | .xls     |
      | CSV      |

  @ui @table:vehicle_records
  Scenario Outline: 查詢結果篩選中時，各格式匯出仍是全部資料
    Given 名單上有以下資料：
      | 車頭車號     | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | 929-X2   | 20-9A | 王小明 | A123456789 |
      | KLP-7988 | OL-02 | 李美玲 | F131104093 |
    And 我查詢了 "王"，畫面只列出 1 筆
    When 我選擇以 <匯出格式> 匯出名單
    Then 匯出的 <匯出格式> 檔有 2 列資料，包含駕駛姓名 "王小明" 與 "李美玲"
    And 畫面告知已匯出 2 筆資料

    Examples:
      | 匯出格式 |
      | .xls     |
      | CSV      |
