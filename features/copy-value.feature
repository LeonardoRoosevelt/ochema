Feature: 點擊複製名單欄位
  為了 把車號、姓名或身分證貼到別的地方時不必手動選取文字
  身為 裝置擁有者
  我想要 在名單上點一下某一格，就把那一格的值複製到剪貼簿

  Background:
    Given 名單上有以下資料：
      | 車頭車號     | 車斗車號  | 駕駛姓名   | 駕駛身分證     |
      | KLP-7988 | 20-9A | 王大明 | A123456789 |

  @ui @table:vehicle_records
  Scenario Outline: 點擊任一欄位只複製該欄位的值
    When 我在名單上點擊車頭車號 "KLP-7988" 那一筆的 "<欄位>"
    Then 剪貼簿內容是 "<值>"
    And 畫面告知已複製 "<值>"

    Examples:
      | 欄位    | 值          |
      | 車頭車號  | KLP-7988   |
      | 車斗車號  | 20-9A      |
      | 駕駛姓名  | 王大明        |
      | 駕駛身分證 | A123456789 |

  @ui @table:vehicle_records
  Scenario: 查詢標示命中文字時，複製的仍是完整的值
    Given 我查詢 "7988"
    When 我在名單上點擊車頭車號 "KLP-7988" 那一筆的 "車頭車號"
    Then 剪貼簿內容是 "KLP-7988"

  @ui @table:vehicle_records
  Scenario: 不用滑鼠也能複製
    When 我用鍵盤移到車頭車號 "KLP-7988" 那一筆的 "駕駛身分證" 並按 Enter
    Then 剪貼簿內容是 "A123456789"

  @ui @table:vehicle_records
  Scenario: 複製不會開啟編輯，也不會改動名單
    When 我在名單上點擊車頭車號 "KLP-7988" 那一筆的 "駕駛姓名"
    Then 沒有開啟任何表單或對話框
    And 名單共有 1 筆資料

  @ui @table:vehicle_records
  Scenario: 裝置不允許複製時告知失敗
    Given 這台裝置不允許寫入剪貼簿
    When 我在名單上點擊車頭車號 "KLP-7988" 那一筆的 "車斗車號"
    Then 畫面告知無法複製，並顯示要複製的值 "20-9A"
    And 名單共有 1 筆資料
