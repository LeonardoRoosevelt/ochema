Feature: 名單管理
  為了 隨時維持車輛所屬名單的正確
  身為 裝置擁有者
  我想要 新增、編輯、刪除名單上的每一筆資料

  @ui @table:vehicle_records
  Scenario: 新增一筆合格的資料
    Given 名單是空的
    When 我新增一筆資料：車頭 "929-X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456789"
    Then 名單上有 1 筆資料
    And 這筆資料的車頭是 "929-X2"、車尾是 "20-9A"、姓名是 "王小明"、身分證是 "A123456789"

  @ui @table:vehicle_records
  Scenario Outline: 必填欄位留空時不能存檔
    Given 名單是空的
    When 我新增一筆資料，但把「<欄位>」留空，其餘欄位填入合格內容
    Then 資料不會存檔
    And 畫面告知「<欄位>」為必填
    And 名單上有 0 筆資料

    Examples:
      | 欄位   |
      | 車頭   |
      | 車尾   |
      | 姓名   |
      | 身分證 |

  @ui @table:vehicle_records
  Scenario: 只含空白的欄位視為留空
    Given 名單是空的
    When 我新增一筆資料，姓名只輸入空白字元，其餘欄位填入合格內容
    Then 資料不會存檔
    And 畫面告知「姓名」為必填

  @ui @table:vehicle_records
  Scenario: 小寫車牌擋下並說明原因，不自動轉成大寫
    Given 名單是空的
    When 我新增一筆資料：車頭 "klp-7988"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456789"
    Then 資料不會存檔
    And 畫面指出車頭的格式不合，並說明只接受大寫英文或數字、以單一連字號相連
    And 名單上有 0 筆資料

  @ui @table:vehicle_records
  Scenario: 車牌中間含空白仍算格式錯誤並擋下
    Given 名單是空的
    When 我新增一筆資料：車頭 "929 -X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456789"
    Then 資料不會存檔
    And 畫面指出車頭的格式不合，並說明只接受大寫英文或數字、以單一連字號相連

  @ui @table:vehicle_records
  Scenario: 前後空白自動去除後存檔
    Given 名單是空的
    When 我新增一筆資料：車頭 " 929-X2 "、車尾 "20-9A "、姓名 " 王小明"、身分證 " A123456789 "
    Then 資料已存檔
    And 這筆資料的車頭是 "929-X2"、車尾是 "20-9A"、姓名是 "王小明"、身分證是 "A123456789"

  @ui @table:vehicle_records
  Scenario: 編輯時前後空白同樣自動去除
    Given 名單上有一筆資料：車頭 "929-X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456789"
    When 我把這筆資料的車頭改成 " KLP-7988 " 並儲存
    Then 這筆資料的車頭是 "KLP-7988"

  @ui @table:vehicle_records
  Scenario: 身分證不合格只警示，仍可存檔
    Given 名單是空的
    When 我新增一筆資料：車頭 "929-X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456788"
    Then 資料已存檔
    And 畫面提示這筆資料的身分證檢查碼不符
    And 名單上有 1 筆資料

  @ui @table:vehicle_records
  Scenario: 編輯既有資料並儲存
    Given 名單上有一筆資料：車頭 "929-X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456789"
    When 我把這筆資料的姓名改成 "王大明" 並儲存
    Then 這筆資料的姓名是 "王大明"
    And 名單上仍然只有 1 筆資料

  @ui @table:vehicle_records
  Scenario: 編輯時把車牌改成不合格格式會被擋下，原資料不變
    Given 名單上有一筆資料：車頭 "929-X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456789"
    When 我把這筆資料的車頭改成 "929X2" 並儲存
    Then 資料不會存檔
    And 這筆資料的車頭仍是 "929-X2"

  @ui @table:vehicle_records
  Scenario: 編輯後放棄修改
    Given 名單上有一筆資料：車頭 "929-X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456789"
    When 我開始編輯這筆資料並把姓名改成 "王大明"，然後取消
    Then 這筆資料的姓名仍是 "王小明"

  @ui @table:vehicle_records
  Scenario: 刪除資料前須確認
    Given 名單上有一筆資料：車頭 "929-X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456789"
    When 我要求刪除這筆資料並確認
    Then 名單上有 0 筆資料

  @ui @table:vehicle_records
  Scenario: 刪除時取消確認，資料保留
    Given 名單上有一筆資料：車頭 "929-X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456789"
    When 我要求刪除這筆資料但在確認時取消
    Then 名單上有 1 筆資料

  @ui @table:vehicle_records
  Scenario: 重新開啟 App 後資料仍在
    Given 名單上有一筆資料：車頭 "929-X2"、車尾 "20-9A"、姓名 "王小明"、身分證 "A123456789"
    When 我關閉並重新開啟 App
    Then 名單上有 1 筆資料
    And 這筆資料的車頭是 "929-X2"

  @ui @table:vehicle_records
  Scenario: 名單為空時顯示空狀態
    Given 名單是空的
    When 我開啟名單
    Then 畫面顯示名單目前沒有資料，並提示可以新增或匯入
