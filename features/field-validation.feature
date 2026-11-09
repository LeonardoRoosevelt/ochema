Feature: 欄位格式檢查
  為了 讓名單上的車牌一致、身分證有誤時能及早發現
  身為 裝置擁有者
  我想要 車牌格式不合時被擋下，身分證不合時收到警示

  # 車牌格式不合 = 擋下（不收）；身分證不合 = 只警示（仍可存檔）
  # 所有欄位前後空白先自動去除再檢查；中間空白算格式錯誤（車牌擋下、身分證警示）
  # 小寫車牌一律擋下，不自動轉大寫
  #
  # 原因代碼（工程部可調整命名，但每個代碼須對應下列一種原因）：
  #   車牌：PLATE_LOWERCASE 含小寫英文、PLATE_FULLWIDTH 含全形字元、PLATE_NO_HYPHEN 缺連字號、
  #         PLATE_MULTI_HYPHEN 多個連字號、PLATE_EMPTY_PART 連字號前或後沒有字元、
  #         PLATE_INNER_WHITESPACE 中間含空白、PLATE_INVALID_CHAR 其他符號、REQUIRED 空值
  #   身分證：ID_CHECKSUM 檢查碼不符、ID_LENGTH 長度不是 10 碼、ID_LOWERCASE 開頭英文字母為小寫、
  #         ID_FIRST_NOT_ALPHA 第一碼不是英文字母、ID_NON_DIGIT 後 9 碼含非數字、
  #         ID_LEGACY_RESIDENCE 舊式居留證格式（兩碼英文）
  #
  # 多個原因同時成立時，原因代碼取「第一個符合者」，優先序如下（回傳單一代碼）：
  #   車牌：REQUIRED > PLATE_INNER_WHITESPACE > PLATE_FULLWIDTH > PLATE_LOWERCASE > PLATE_INVALID_CHAR
  #         > PLATE_NO_HYPHEN > PLATE_MULTI_HYPHEN > PLATE_EMPTY_PART
  #   身分證：ID_LENGTH > ID_LOWERCASE > ID_FIRST_NOT_ALPHA > ID_LEGACY_RESIDENCE > ID_NON_DIGIT > ID_CHECKSUM
  # 四欄完全相同的整列（與名單上既有資料）不屬於欄位格式檢查，由 duplicate-detection.feature 規範：手動新增／編輯一律擋下

  @api @table:vehicle_records
  Scenario Outline: 合格的車牌格式
    When 我檢查車牌 "<車牌>"
    Then 結果為合格

    Examples:
      | 車牌     |
      | 929-X2   |
      | KLP-7988 |
      | 20-9A    |
      | OL-02    |
      | A-1      |
      | 0012-007 |

  @api @table:vehicle_records
  Scenario Outline: 不合格的車牌格式一律擋下
    When 我檢查車牌 "<車牌>"
    Then 結果為不合格，原因代碼為 "<原因代碼>"

    Examples:
      | 車牌       | 原因代碼               |
      | klp-7988   | PLATE_LOWERCASE        |
      | Klp-7988   | PLATE_LOWERCASE        |
      | ＫＬＰ-7988 | PLATE_FULLWIDTH        |
      | 929－X2    | PLATE_FULLWIDTH        |
      | ９２９-X2  | PLATE_FULLWIDTH        |
      | 929X2      | PLATE_NO_HYPHEN        |
      | 929-X2-1   | PLATE_MULTI_HYPHEN     |
      | -X2        | PLATE_EMPTY_PART       |
      | 929-       | PLATE_EMPTY_PART       |
      | 929 -X2    | PLATE_INNER_WHITESPACE |
      | 9 29-X2    | PLATE_INNER_WHITESPACE |
      | 929_X2     | PLATE_INVALID_CHAR     |
      | 929.X2     | PLATE_INVALID_CHAR     |
      |            | REQUIRED               |

  @api @table:vehicle_records
  Scenario: 車牌前後空白先去除再檢查
    When 我檢查車牌 " 929-X2 "
    Then 結果為合格，去除空白後的值是 "929-X2"

  @api @table:vehicle_records
  Scenario: 身分證前後空白先去除再檢查
    When 我檢查身分證 " A123456789 "
    Then 結果為通過，沒有警示，去除空白後的值是 "A123456789"

  @api @table:vehicle_records
  Scenario Outline: 身分證檢查碼正確則不警示
    When 我檢查身分證 "<身分證>"
    Then 結果為通過，沒有警示（<說明>）

    Examples:
      | 身分證     | 說明                  |
      | A123456789 | 一般身分證            |
      | F131104093 | 一般身分證            |
      | A800000014 | 新式居留證，第二碼 8  |
      | B900000017 | 新式居留證，第二碼 9  |

  @api @table:vehicle_records
  Scenario Outline: 身分證不合格只警示，不阻擋
    When 我檢查身分證 "<身分證>"
    Then 結果為警示，原因代碼為 "<原因代碼>"
    And 這個值仍可存檔

    Examples:
      | 身分證      | 原因代碼          |
      | A123456788  | ID_CHECKSUM       |
      | A12345678   | ID_LENGTH         |
      | A1234567890 | ID_LENGTH         |
      | a123456789  | ID_LOWERCASE      |
      | 1123456789  | ID_FIRST_NOT_ALPHA |
      | A12345678X  | ID_NON_DIGIT      |
      | AB12345678  | ID_LEGACY_RESIDENCE |

  @ui @table:vehicle_records
  Scenario: 名單上標示身分證有警示的資料
    Given 名單上有一筆資料：車頭 "929-X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "AB12345678"
    When 我開啟名單
    Then 這筆資料標示身分證格式警示
    And 這筆資料的身分證仍完整顯示為 "AB12345678"

  @ui @table:vehicle_records
  Scenario: 修正身分證後警示消失
    Given 名單上有一筆資料：車頭 "929-X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456788"
    When 我把這筆資料的身分證改成 "A123456789" 並儲存
    Then 這筆資料不再標示身分證格式警示

  @api @table:vehicle_records
  Scenario: 身分證中間含空白只警示，不阻擋
    When 我檢查身分證 "A123 56789"
    Then 結果為警示，原因代碼為 "ID_NON_DIGIT"
    And 這個值仍可存檔
