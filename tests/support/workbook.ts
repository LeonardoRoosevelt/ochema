/**
 * 測試 fixture：造 .xlsx／.xls／CSV／Big5／二進位／截斷檔，並讀回匯出檔做驗證。
 * 契約開頭的「測試例外」：此處可直接 import xlsx；src/ 不得引用本檔。
 */
import * as XLSX from 'xlsx'
import { BOM, csvParse, csvSerialize, encodeBig5, isValidUtf8, utf8 } from './csvFixture'

export type FileKind = 'xlsx' | 'xls' | 'csv' | 'csv-bom'

/** 一份「標題列＋資料列」檔案的描述；實際位元組在需要時才建（步驟可逐步補列）。 */
export interface FileSpec {
  kind: FileKind
  headers: string[]
  /** rows[0] 對應檔案第 2 列（標題列固定是第 1 列）；cells 與 headers 對齊 */
  rows: string[][]
  /** xlsx／xls 專用：某格改存為「數字＋數字格式」（顯示文字由格式決定） */
  numeric?: { rowIndex: number; colIndex: number; value: number; display: string }
}

/** 顯示文字 → 數字格式：與值相同用 General；否則補零格式（"007" → "000"）。 */
export function numberFormatFor(value: number, display: string): string {
  return display === String(value) ? 'General' : '0'.repeat(display.length)
}

export function sheetFromGrid(grid: string[][], numeric?: FileSpec['numeric']): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(grid)
  // 一律強制為文字儲存格，避免 aoa_to_sheet 把 "007" 之類自動轉數字
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue
    const cell = ws[addr] as XLSX.CellObject
    ws[addr] = { t: 's', v: String(cell.v ?? '') }
  }
  if (numeric) {
    const addr = XLSX.utils.encode_cell({ r: numeric.rowIndex + 1, c: numeric.colIndex })
    ws[addr] = { t: 'n', v: numeric.value, z: numberFormatFor(numeric.value, numeric.display) }
  }
  return ws
}

export function workbookBytes(ws: XLSX.WorkSheet, bookType: 'xlsx' | 'biff8', sheetName = 'Sheet1'): Uint8Array {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer)
}

export function buildFileBytes(spec: FileSpec): Uint8Array {
  const grid = [spec.headers, ...spec.rows]
  if (spec.kind === 'csv' || spec.kind === 'csv-bom') return utf8(csvSerialize(grid), spec.kind === 'csv-bom')
  return workbookBytes(sheetFromGrid(grid, spec.numeric), spec.kind === 'xlsx' ? 'xlsx' : 'biff8')
}

export function fileNameFor(kind: FileKind): string {
  return kind === 'xlsx' ? 'names.xlsx' : kind === 'xls' ? 'names.xls' : 'names.csv'
}

export function mimeFor(kind: FileKind): string {
  return kind === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : kind === 'xls'
      ? 'application/vnd.ms-excel'
      : 'text/csv'
}

// ── 不可讀取／空白的檔案 ─────────────────────────────────

/** 完全空白的 .xlsx（aoa_to_sheet([])；契約 §4.1 項 5：讀回 !ref 為 undefined） */
export const emptyXlsx = () => workbookBytes(XLSX.utils.aoa_to_sheet([]), 'xlsx')
/** 有效但沒有任何儲存格內容的 .xls（T5：SheetJS 讀回 !ref 為 'A1'，並非 undefined） */
export const emptyXls = () => workbookBytes(XLSX.utils.aoa_to_sheet([]), 'biff8')

/**
 * 確定性的「隨機二進位資料」：固定種子的 LCG，並強制第 3 個位元組為 0x00，
 * 確保一定含 NUL（契約 §3.5.1：不可用未固定種子的隨機數，否則偶發落入合法 UTF-8）。
 */
export function randomBinary(): Uint8Array {
  const out = new Uint8Array(256)
  let seed = 0x1234abcd
  for (let i = 0; i < out.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    out[i] = seed >>> 24
  }
  out[3] = 0x00
  return out
}

/** 'PK\x03\x04' 開頭但內容是雜訊的「損毀 .xlsx」（T6 實測 SheetJS 會丟錯） */
export const corruptedXlsx = () => Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

/**
 * D0 CF 11 E0 開頭、但內容被截斷的 .xls：取一份有效 .xls 的前 1024 位元組。
 * T5 實測：只截掉結尾數十位元組時 SheetJS 仍讀得出內容（不丟錯）；落在檔頭磁區之後的截斷才會丟錯，
 * 所以 fixture 取 1024。完整的截斷偵測（任意位置）見回報「待決問題」。
 */
export function truncatedXls(): Uint8Array {
  const full = workbookBytes(
    sheetFromGrid([
      ['車頭', '車尾', '姓名', '身分證'],
      ['929-X2', '20-9A', '王小明', 'A123456789'],
    ]),
    'biff8',
  )
  return full.slice(0, 1024)
}

export const nulCsv = () => Uint8Array.from([...new TextEncoder().encode('車頭,車尾\r\n929-X2,20-9A'), 0x00, 0x00])

/** Big5 編碼的 CSV；並驗證位元組確實不是合法 UTF-8（否則 fixture 本身失效，直接丟錯）。 */
export function big5Csv(rows: string[][]): Uint8Array {
  const bytes = encodeBig5(csvSerialize(rows))
  if (isValidUtf8(bytes)) throw new Error('Big5 fixture 恰好也是合法 UTF-8，無法代表「非 UTF-8」')
  return bytes
}

// ── 匯出檔讀回 ──────────────────────────────────────────

export interface ExportedSheet {
  /** 第 1 列 */
  headers: string[]
  /** 第 2 列起 */
  rows: string[][]
  /** xlsx／xls：每格的 SheetJS 型別（'s' 為文字）；CSV 為 undefined */
  cellTypes?: string[][]
  /** 實際欄數（含標題列），用來斷言「沒有額外欄位」 */
  columnCount: number
}

export function readExportedSheet(bytes: Uint8Array, format: 'xlsx' | 'xls' | 'csv'): ExportedSheet {
  if (format === 'csv') {
    const body = bytes[0] === BOM[0] && bytes[1] === BOM[1] && bytes[2] === BOM[2] ? bytes.slice(3) : bytes
    const grid = csvParse(new TextDecoder('utf-8', { fatal: true }).decode(body))
    return {
      headers: grid[0] ?? [],
      rows: grid.slice(1),
      columnCount: Math.max(0, ...grid.map((r) => r.length)),
    }
  }
  const wb = XLSX.read(bytes, { type: 'array' })
  const name = wb.SheetNames[0]
  if (!name) throw new Error('匯出檔沒有任何工作表')
  const ws = wb.Sheets[name]!
  const ref = ws['!ref']
  if (!ref) return { headers: [], rows: [], cellTypes: [], columnCount: 0 }
  const range = XLSX.utils.decode_range(ref)
  const values: string[][] = []
  const types: string[][] = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const vr: string[] = []
    const tr: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
      vr.push(cell ? (cell.w ?? String(cell.v)) : '')
      tr.push(cell ? cell.t : '')
    }
    values.push(vr)
    types.push(tr)
  }
  return {
    headers: values[0] ?? [],
    rows: values.slice(1),
    cellTypes: types.slice(1),
    columnCount: range.e.c - range.s.c + 1,
  }
}
