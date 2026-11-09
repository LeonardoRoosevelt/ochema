import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { gridToRawRows, readImportFile } from '../../src/data/excelRead'

const utf8 = (s: string) => new TextEncoder().encode(s)
const row = (fileRow: number, ...cells: string[]) => ({ fileRow, cells })
const H = ['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證']

describe('標題列固定為第 1 列（契約附錄 Q-E）', () => {
  it('第 1 列空白、標題在第 2 列 → MISSING_HEADERS（缺四個），不往下找標題', () => {
    const r = gridToRawRows([row(1, '', '', '', ''), row(2, ...H), row(3, '929-X2', '20-9A', '王小明', 'A123456789')])
    expect(r).toEqual({ ok: false, code: 'MISSING_HEADERS', missing: ['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證'] })
  })

  it('舊標題（車頭、車尾、姓名、身分證）視為缺少標題：四個新標題全列為缺少', () => {
    const r = gridToRawRows([row(1, '車頭', '車尾', '姓名', '身分證'), row(2, '929-X2', '20-9A', '王小明', 'A123456789')])
    expect(r).toEqual({ ok: false, code: 'MISSING_HEADERS', missing: ['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證'] })
  })

  it('整張表沒有任何非空白儲存格 → EMPTY_FILE（優先於缺標題）', () => {
    expect(gridToRawRows([row(1, '', ' ', ''), row(2, '  ')])).toEqual({ ok: false, code: 'EMPTY_FILE' })
    expect(gridToRawRows([])).toEqual({ ok: false, code: 'EMPTY_FILE' })
  })

  it('CSV：開頭空行後才是標題 → MISSING_HEADERS；只有空白字元 → EMPTY_FILE', () => {
    const csv = `\r\n${H.join(',')}\r\n929-X2,20-9A,王小明,A123456789\r\n`
    expect(readImportFile(utf8(csv))).toMatchObject({ ok: false, code: 'MISSING_HEADERS' })
    expect(readImportFile(utf8('  \r\n \r\n'))).toEqual({ ok: false, code: 'EMPTY_FILE' })
  })

  it('xlsx：工作表內容從第 3 列才開始（!ref 不從 A1 起）→ 第 1 列視為空白 → MISSING_HEADERS，列號為絕對列號', () => {
    const ws: XLSX.WorkSheet = {}
    H.forEach((t, c) => (ws[XLSX.utils.encode_cell({ r: 2, c })] = { t: 's', v: t }))
    ws['!ref'] = 'A3:D3'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 's')
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
    expect(readImportFile(bytes)).toMatchObject({ ok: false, code: 'MISSING_HEADERS' })
  })
})

describe('gridToRawRows 其餘規則', () => {
  it('標題先 trim、順序不拘、多餘欄忽略、重複標題取最左', () => {
    const r = gridToRawRows([
      row(1, '備註', ' 駕駛身分證 ', '駕駛姓名', '車斗車號', '車頭車號', '車頭車號'),
      row(2, 'x', 'A123456789', '王小明', '20-9A', '929-X2', 'KLP-7988'),
    ])
    expect(r).toEqual({
      ok: true,
      rows: [{ fileRow: 2, cells: { headPlate: '929-X2', tailPlate: '20-9A', ownerName: '王小明', idNumber: 'A123456789' } }],
    })
  })

  it('四欄皆空的列略過但列號照算；只含空白的單一欄位不略過；cells 不 trim', () => {
    const r = gridToRawRows([
      row(1, ...H),
      row(2, '', '', '', ''),
      row(3, '929-X2', '20-9A', '   ', 'A123456789'),
    ])
    expect(r).toEqual({
      ok: true,
      rows: [{ fileRow: 3, cells: { headPlate: '929-X2', tailPlate: '20-9A', ownerName: '   ', idNumber: 'A123456789' } }],
    })
  })

  it('短列補空字串、長列多出的忽略；多餘欄有內容不影響「整列空白」判斷', () => {
    const r = gridToRawRows([row(1, ...H), row(2, '929-X2'), row(3, '', '', '', '', '只有備註')])
    expect(r).toEqual({
      ok: true,
      rows: [{ fileRow: 2, cells: { headPlate: '929-X2', tailPlate: '', ownerName: '', idNumber: '' } }],
    })
  })

  it('缺標題時 missing 依 FIELD_ORDER 列出中文名', () => {
    expect(gridToRawRows([row(1, '車斗車號', '車頭車號')])).toEqual({
      ok: false,
      code: 'MISSING_HEADERS',
      missing: ['駕駛姓名', '駕駛身分證'],
    })
  })
})

describe('大範圍 !ref 的效能', () => {
  it('宣告 A1:D1000000 但只有 2 列資料 → 500ms 內讀完且結果正確', () => {
    const ws = XLSX.utils.aoa_to_sheet([H, ['929-X2', '20-9A', '王小明', 'A123456789']])
    ws['!ref'] = 'A1:D1000000'
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'S')
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const t0 = performance.now()
    const r = readImportFile(bytes)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(r).toMatchObject({
      ok: true,
      rows: [{ fileRow: 2, cells: { headPlate: '929-X2', tailPlate: '20-9A', ownerName: '王小明', idNumber: 'A123456789' } }],
    })
  })
})
