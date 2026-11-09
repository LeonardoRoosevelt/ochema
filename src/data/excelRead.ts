import * as XLSX from 'xlsx'
import { CsvError, parseCsv } from './csv'
import { detectFormat } from './fileFormat'
import { COLUMN_TITLES, FIELD_ORDER } from './types'
import type { FieldKey, GridRowsResult, RawRow, ReadResult } from './types'

type Grid = Array<{ fileRow: number; cells: string[] }>

const UNREADABLE = { ok: false, code: 'UNREADABLE' } as const

/** 跨 realm（jsdom／Node）安全：不用 instanceof。 */
function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  return ArrayBuffer.isView(input)
    ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    : new Uint8Array(input)
}

/** SheetJS 邊界：第一張工作表 → 字串格。列號為絕對列號，一律從第 1 列起（標題列固定第 1 列）。 */
function sheetToGrid(bytes: Uint8Array): Grid | null {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(bytes, { type: 'array' })
  } catch {
    return null
  }
  const firstName = wb.SheetNames[0]
  const ws = firstName === undefined ? undefined : wb.Sheets[firstName]
  if (!ws) return null
  // 只走訪實際存在的儲存格鍵，不依 !ref 宣告範圍逐格走訪（宣告範圍很大、內容很少時會凍結主執行緒）
  const found: Array<{ r: number; c: number; text: string }> = []
  let maxC = -1
  for (const key of Object.keys(ws)) {
    if (key.startsWith('!')) continue
    const cell = ws[key] as XLSX.CellObject | undefined
    if (!cell) continue
    const { r, c } = XLSX.utils.decode_cell(key)
    // 顯示文字 cell.w；沒有才退回 v。不用 raw：數字格 7＋格式 000 要得到 "007"
    found.push({ r, c, text: cell.w !== undefined ? cell.w : cell.v == null ? '' : String(cell.v) })
    if (c > maxC) maxC = c
  }
  const byRow = new Map<number, string[]>()
  for (const { r, c, text } of found) {
    let cells = byRow.get(r)
    if (!cells) byRow.set(r, (cells = Array.from({ length: maxC + 1 }, () => '')))
    cells[c] = text
  }
  return [...byRow.entries()].sort((x, y) => x[0] - y[0]).map(([r, cells]) => ({ fileRow: r + 1, cells }))
}

/** 總入口：detectFormat → 依格式取得字串格 → gridToRawRows。 */
export function readImportFile(input: ArrayBuffer | Uint8Array): ReadResult {
  const bytes = toUint8Array(input)
  const detected = detectFormat(bytes)
  if (!detected.ok) return detected

  let grid: Grid | null
  if (detected.format === 'csv') {
    try {
      // TextDecoder 預設會去掉開頭 BOM；格式判定階段已確認是合法 UTF-8
      const records = parseCsv(new TextDecoder('utf-8').decode(bytes))
      grid = records.map((cells, i) => ({ fileRow: i + 1, cells }))
    } catch (e) {
      if (e instanceof CsvError) return { ...UNREADABLE }
      throw e
    }
  } else {
    grid = sheetToGrid(bytes)
  }
  if (!grid) return { ...UNREADABLE }

  const result = gridToRawRows(grid)
  return result.ok ? { ...result, format: detected.format } : result
}

/** 三格式共用的「格→原始列」規則。標題列固定為第 1 列（契約附錄 Q-E）。 */
export function gridToRawRows(
  grid: ReadonlyArray<{ fileRow: number; cells: readonly string[] }>,
): GridRowsResult {
  if (!grid.some((g) => g.cells.some((c) => c.trim() !== ''))) return { ok: false, code: 'EMPTY_FILE' }

  const headerCells = grid.find((g) => g.fileRow === 1)?.cells ?? []
  const titles = headerCells.map((c) => c.trim())
  const index = {} as Record<FieldKey, number>
  const missing: string[] = []
  for (const key of FIELD_ORDER) {
    index[key] = titles.indexOf(COLUMN_TITLES[key]) // 重複標題取最左邊
    if (index[key] < 0) missing.push(COLUMN_TITLES[key])
  }
  if (missing.length > 0) return { ok: false, code: 'MISSING_HEADERS', missing }

  const rows: RawRow[] = []
  for (const g of grid) {
    if (g.fileRow <= 1) continue
    const cells = {} as Record<FieldKey, string>
    for (const key of FIELD_ORDER) cells[key] = g.cells[index[key]] ?? '' // 短列補空、長列忽略
    if (FIELD_ORDER.every((k) => cells[k].trim() === '')) continue // 四欄皆空：略過（列號照算）
    rows.push({ fileRow: g.fileRow, cells })
  }
  return { ok: true, rows }
}
