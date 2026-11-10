import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { buildExportBytes, CELL_MAX_CHARS, CellTooLongError, exportFileName, XLS_CELL_MAX_CHARS, XLS_MAX_ROWS, XlsRowLimitError } from '../../src/data/excelWrite'
import { readImportFile } from '../../src/data/excelRead'
import type { VehicleRecord } from '../../src/data/types'

const mk = (n: number): VehicleRecord[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    headPlate: `H-${i}`,
    tailPlate: `T-${i}`,
    ownerName: `車主${i}`,
    idNumber: 'A123456789',
  }))

describe('.xls 列數上限（契約附錄 Q-F）', () => {
  it('資料超過上限（含標題列 > 65,536）→ 丟 XlsRowLimitError，而不是讓 SheetJS 默默截斷', () => {
    const records = mk(XLS_MAX_ROWS) // 加標題列 = 65,537 列
    expect(() => buildExportBytes(records, 'xls')).toThrow(XlsRowLimitError)
    try {
      buildExportBytes(records, 'xls')
    } catch (e) {
      expect(e).toMatchObject({ rows: XLS_MAX_ROWS + 1, limit: XLS_MAX_ROWS })
      expect((e as Error).message).toContain('.xlsx')
    }
  })

  it('剛好在上限（標題列 + 65,535 筆）→ 成功，且最後一筆讀回完整（沒有被截掉）', () => {
    const records = mk(XLS_MAX_ROWS - 1)
    const read = readImportFile(buildExportBytes(records, 'xls'))
    if (!read.ok) throw new Error(`讀回失敗：${read.code}`)
    expect(read.rows).toHaveLength(records.length)
    expect(read.rows.at(-1)!.cells.ownerName).toBe(`車主${records.length - 1}`)
  }, 60_000)

  it('xlsx 與 csv 不受 .xls 上限限制', () => {
    const records = mk(XLS_MAX_ROWS)
    expect(() => buildExportBytes(records, 'csv')).not.toThrow()
    const wb = XLSX.read(buildExportBytes(records, 'xlsx'), { type: 'array' })
    expect(wb.Sheets[wb.SheetNames[0]!]!['!ref']).toBe(`A1:D${XLS_MAX_ROWS + 1}`)
  }, 60_000)
})

describe('exportFileName', () => {
  it('土方車輛-名單-YYYYMMDD-HHmm.<ext>，月日時分補零，副檔名隨格式', () => {
    const d = new Date(2026, 0, 5, 3, 7)
    expect(exportFileName(d)).toBe('土方車輛-名單-20260105-0307.xlsx')
    expect(exportFileName(d, 'xls')).toBe('土方車輛-名單-20260105-0307.xls')
    expect(exportFileName(d, 'csv')).toBe('土方車輛-名單-20260105-0307.csv')
  })
})

describe('儲存格長度上限（退回 1 缺陷 2）', () => {
  const rec = (id: number, ownerName: string): VehicleRecord => ({ id, headPlate: 'A-1', tailPlate: 'B-1', ownerName, idNumber: 'A123456789' })
  const LIMITS = [
    ['xlsx', CELL_MAX_CHARS],
    ['xls', XLS_CELL_MAX_CHARS],
  ] as const

  it.each(LIMITS)('%s：欄位超過上限（%i）→ CellTooLongError，指出哪一筆、哪一欄', (fmt, limit) => {
    const records = [rec(1, '王'), rec(7, 'x'.repeat(limit + 1))]
    try {
      buildExportBytes(records, fmt)
      throw new Error('應該丟錯')
    } catch (e) {
      expect(e).toBeInstanceOf(CellTooLongError)
      expect(e).toMatchObject({ recordId: 7, field: 'ownerName', length: limit + 1, limit, format: fmt })
      expect((e as Error).message).toContain('CSV')
    }
  })

  it.each(LIMITS)('%s：剛好等於上限 → 成功且讀回完整（不靜默截斷）', (fmt, limit) => {
    const v = 'x'.repeat(limit)
    const read = readImportFile(buildExportBytes([rec(1, v)], fmt))
    expect(read.ok && read.rows[0].cells.ownerName).toBe(v)
  })

  it('車牌超長同樣指出欄位；CSV 不受影響、往返不變', () => {
    const long = 'A'.repeat(CELL_MAX_CHARS + 1)
    const r: VehicleRecord = { id: 3, headPlate: long, tailPlate: 'B-1', ownerName: '王', idNumber: 'A123456789' }
    expect(() => buildExportBytes([r], 'xlsx')).toThrow(expect.objectContaining({ recordId: 3, field: 'headPlate' }))
    const read = readImportFile(buildExportBytes([r], 'csv'))
    expect(read.ok && read.rows[0].cells.headPlate).toBe(long)
  })
})
