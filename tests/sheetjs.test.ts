/**
 * SheetJS 實測（契約 §4.1 T1–T9）。這些是「對外部套件行為的特性測試」，不屬於 features，
 * 但資料層的設計（cell.w、BIFF8 往返、格式判定）都建立在它們之上，所以先用測試固定下來。
 * 結果摘要寫在 .studio/handoffs/03-engineering-red-reply.md。
 */
import * as XLSX from 'xlsx'
import { describe, expect, test } from 'vitest'
import { corruptedXlsx, emptyXls, emptyXlsx, numberFormatFor, sheetFromGrid, truncatedXls, workbookBytes } from './support/workbook'

const readFirst = (bytes: Uint8Array) => {
  const wb = XLSX.read(bytes, { type: 'array' })
  return { wb, ws: wb.Sheets[wb.SheetNames[0]!]! }
}
const numberSheet = (value: number, fmt: string) => {
  const ws = XLSX.utils.aoa_to_sheet([['姓名'], ['x']])
  ws['A2'] = { t: 'n', v: value, z: fmt }
  return ws
}

describe.each([
  ['xlsx', 'xlsx'],
  ['xls', 'biff8'],
] as const)('SheetJS %s', (name, bookType) => {
  test(`T1 數字儲存格的顯示文字（${name}）：7＋格式 000 → "007"；General → "7"`, () => {
    expect(readFirst(workbookBytes(numberSheet(7, '000'), bookType)).ws['A2'].w).toBe('007')
    expect(readFirst(workbookBytes(numberSheet(7, 'General'), bookType)).ws['A2'].w).toBe('7')
    expect(numberFormatFor(7, '007')).toBe('000')
  })

  test(`T2 中文與特殊字元原樣（${name}）`, () => {
    const values = ['李"美玲"', '王,小明', '歐陽・小明', 'ＫＬＰ']
    const { ws } = readFirst(workbookBytes(sheetFromGrid([values]), bookType))
    expect(['A1', 'B1', 'C1', 'D1'].map((a) => ws[a].w)).toEqual(values)
  })

  test(`T3 文字儲存格往返：前導 0、型別為 s（${name}）`, () => {
    const { ws } = readFirst(workbookBytes(sheetFromGrid([['0012-007', '00-01', '007']]), bookType))
    expect(['A1', 'B1', 'C1'].map((a) => [ws[a].t, ws[a].v])).toEqual([
      ['s', '0012-007'],
      ['s', '00-01'],
      ['s', '007'],
    ])
  })

  test(`T3 空名單只有標題列（${name}）`, () => {
    const { ws } = readFirst(workbookBytes(sheetFromGrid([['車頭', '車尾', '姓名', '身分證']]), bookType))
    expect(XLSX.utils.decode_range(ws['!ref']!).e.r).toBe(0)
  })

  test(`T4 前後空白往返（${name}）：" 929-X2 " 與 "   " 保留`, () => {
    const { ws } = readFirst(workbookBytes(sheetFromGrid([[' 929-X2 ', '   ']]), bookType))
    expect([ws['A1'].v, ws['B1'].v]).toEqual([' 929-X2 ', '   '])
  })

  test(`T7 XLSX.write(type:'array') 回傳 ArrayBuffer，可 new Uint8Array（${name}）`, () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheetFromGrid([['a']]), 'S')
    const out = XLSX.write(wb, { type: 'array', bookType })
    expect(out).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(out as ArrayBuffer).byteLength).toBeGreaterThan(0)
  })

  test(`T9 文字格的 w 等於字串原樣（${name}）：前導 0、全形字`, () => {
    const { ws } = readFirst(workbookBytes(sheetFromGrid([['007', 'ＫＬＰ-７９８８']]), bookType))
    expect([ws['A1'].w, ws['B1'].w]).toEqual(['007', 'ＫＬＰ-７９８８'])
  })
})

describe('SheetJS 其他', () => {
  test('SSF 隨套件匯出且可用（T1 備案）', () => {
    expect(XLSX.SSF.format('000', 7)).toBe('007')
  })

  test('T5 截斷的 .xls（D0 CF 11 E0 開頭、前 1024 位元組）會丟錯', () => {
    const bytes = truncatedXls()
    expect([...bytes.slice(0, 4)]).toEqual([0xd0, 0xcf, 0x11, 0xe0])
    expect(() => XLSX.read(bytes, { type: 'array' })).toThrow()
  })

  test('T5 有效但無儲存格的 .xls 讀得回來，沒有任何非空儲存格（!ref 為 A1，不是 undefined）', () => {
    const { ws } = readFirst(emptyXls())
    const cells = Object.keys(ws).filter((k) => !k.startsWith('!'))
    expect(cells).toEqual([])
    expect(ws['!ref']).toBe('A1')
  })

  test('T5 完全空白的 .xlsx 讀回 !ref 為 undefined', () => {
    expect(readFirst(emptyXlsx()).ws['!ref']).toBeUndefined()
  })

  test('T6 PK 開頭但不是 xlsx（雜訊、截斷的真實檔）會丟錯', () => {
    expect(() => XLSX.read(corruptedXlsx(), { type: 'array' })).toThrow()
    const real = workbookBytes(sheetFromGrid([['a']]), 'xlsx')
    expect(() => XLSX.read(real.slice(0, real.length - 30), { type: 'array' })).toThrow()
  })

  test('T8 動態 import("xlsx") 在 vitest（jsdom）下可用', async () => {
    const mod = await import('xlsx')
    expect(typeof mod.read).toBe('function')
    expect(typeof mod.write).toBe('function')
  })

  test('跨 realm：jsdom 下 Uint8Array 輸入可被 XLSX.read 讀取', () => {
    const bytes = workbookBytes(sheetFromGrid([['車頭'], ['929-X2']]), 'xlsx')
    expect(readFirst(new Uint8Array(bytes.buffer.slice(0))).ws['A2'].v).toBe('929-X2')
  })
})
