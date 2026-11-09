import * as XLSX from 'xlsx'
import { serializeCsv } from './csv'
import { listRecords } from './records'
import { COLUMN_TITLES, EXPORT_FORMATS, FIELD_ORDER } from './types'
import type { ExportFormat, ExportResult, FieldKey, VehicleRecord } from './types'

/** .xls（BIFF8）工作表列數上限（含標題列）。 */
export const XLS_MAX_ROWS = 65_536

/** .xls 資料超過列數上限時丟出（契約附錄 Q-F）；UI 據此告知改用 .xlsx。 */
export class XlsRowLimitError extends Error {
  constructor(
    readonly rows: number,
    readonly limit: number = XLS_MAX_ROWS,
  ) {
    super(`.xls 最多 ${limit} 列（含標題列），目前需要 ${rows} 列，請改用 .xlsx`)
    this.name = 'XlsRowLimitError'
  }
}

/** .xlsx 單一儲存格文字長度上限（UTF-16 code unit）；超過時 SheetJS 會丟一般 Error。 */
export const CELL_MAX_CHARS = 32_767
/** .xls：SheetJS 的 BIFF8 寫端把每格 slice(0, 255)，超過會靜默截斷資料，故以 255 為上限。 */
export const XLS_CELL_MAX_CHARS = 255

/** .xlsx／.xls 匯出時有欄位超過該格式的儲存格上限（xlsx 32,767、xls 255）；CSV 不受影響。UI 據此告知改用 CSV。 */
export class CellTooLongError extends Error {
  constructor(
    readonly recordId: number,
    readonly field: FieldKey,
    readonly length: number,
    readonly limit: number,
    readonly format: 'xlsx' | 'xls',
  ) {
    super(`第 ${recordId} 筆的「${COLUMN_TITLES[field]}」有 ${length} 字元，超過 .${format} 儲存格上限 ${limit}，請改用 CSV 匯出`)
    this.name = 'CellTooLongError'
  }
}

const BOM = [0xef, 0xbb, 0xbf]

/** 全部資料，欄序＝FIELD_ORDER，列序＝id 升冪。空名單只有標題列。 */
export function buildExportBytes(records: readonly VehicleRecord[], format: ExportFormat): Uint8Array {
  const sorted = [...records].sort((a, b) => a.id - b.id)
  const aoa: string[][] = [
    FIELD_ORDER.map((k) => COLUMN_TITLES[k]),
    ...sorted.map((r) => FIELD_ORDER.map((k) => r[k])),
  ]
  if (format === 'csv') {
    const body = new TextEncoder().encode(serializeCsv(aoa))
    const out = new Uint8Array(BOM.length + body.length)
    out.set(BOM)
    out.set(body, BOM.length)
    return out
  }
  if (format === 'xls' && aoa.length > XLS_MAX_ROWS) throw new XlsRowLimitError(aoa.length)
  const cellLimit = format === 'xls' ? XLS_CELL_MAX_CHARS : CELL_MAX_CHARS
  for (const r of sorted)
    for (const k of FIELD_ORDER) if (r[k].length > cellLimit) throw new CellTooLongError(r.id, k, r[k].length, cellLimit, format)

  // 每格明確為文字型別 {t:'s'}：前導 0 與全形字元原樣保留（不經 aoa_to_sheet 的型別推斷）
  const ws: XLSX.WorkSheet = {}
  aoa.forEach((row, r) =>
    row.forEach((v, c) => {
      ws[XLSX.utils.encode_cell({ r, c })] = { t: 's', v }
    }),
  )
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: FIELD_ORDER.length - 1 } })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '名單')
  const out = XLSX.write(wb, { type: 'array', bookType: format === 'xls' ? 'biff8' : 'xlsx' }) as ArrayBuffer
  return new Uint8Array(out)
}

export async function exportRecords(format: ExportFormat = 'xlsx'): Promise<ExportResult> {
  const records = await listRecords()
  return {
    bytes: buildExportBytes(records, format),
    count: records.length,
    fileName: exportFileName(new Date(), format),
    mimeType: EXPORT_FORMATS[format].mime,
    format,
  }
}

/** 'ochema-名單-YYYYMMDD-HHmm.<ext>'（本地時間） */
export function exportFileName(now: Date, format: ExportFormat = 'xlsx'): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`
  return `ochema-名單-${stamp}.${EXPORT_FORMATS[format].ext}`
}
