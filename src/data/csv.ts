/** 引號欄沒有收尾（直到檔尾）時丟出；readImportFile 轉成 UNREADABLE。 */
export class CsvError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CsvError'
  }
}

/** RFC 4180 解析（規格見契約 §4.2）。不 trim、不轉型。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let fieldStart = true // 目前位置是否在欄位開頭（只有此時的 " 才開啟引號欄）
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i]
    if (fieldStart && c === '"') {
      i++
      let closed = false
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            field += '"'
            i += 2
            continue
          }
          i++
          closed = true
          break
        }
        field += text[i++]
      }
      if (!closed) throw new CsvError('引號欄沒有收尾')
      fieldStart = false
    } else if (c === ',') {
      row.push(field)
      field = ''
      fieldStart = true
      i++
    } else if (c === '\r' || c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      fieldStart = true
      if (c === '\r' && text[i + 1] === '\n') i++
      i++
    } else {
      field += c // 含引號欄結束後的雜字元、非引號欄中的 "（寬鬆）
      fieldStart = false
      i++
    }
  }
  // 檔尾的最後一個換行不產生額外空記錄
  if (row.length > 0 || field !== '' || !fieldStart) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

const needsQuote = (v: string) => /[",\r\n]/.test(v) || v !== v.trim()
const quote = (v: string) => (needsQuote(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** 序列化：標題列＋資料列，欄分隔 `,`，記錄分隔 `\r\n`，每筆（含最後一筆）都以 `\r\n` 結尾。不含 BOM。 */
export function serializeCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(quote).join(',') + '\r\n').join('')
}
