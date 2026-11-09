import { describe, expect, it } from 'vitest'
import { CsvError, parseCsv, serializeCsv } from '../../src/data/csv'
import { readImportFile } from '../../src/data/excelRead'

const utf8 = (s: string) => new TextEncoder().encode(s)

describe('parseCsv（契約 §4.2）', () => {
  it('引號欄沒有收尾（直到檔尾）→ 丟 CsvError，不吞資料（Q-B）', () => {
    expect(() => parseCsv('車頭車號,車斗車號\r\n"929-X2,20-9A\r\n')).toThrow(CsvError)
    expect(() => parseCsv('"')).toThrow(CsvError)
  })

  it('readImportFile 把引號未收尾的 CSV 判為 UNREADABLE（不是缺標題、也不是部分匯入）', () => {
    const text = '車頭車號,車斗車號,駕駛姓名,駕駛身分證\r\n929-X2,20-9A,"王小明,A123456789\r\n'
    expect(readImportFile(utf8(text))).toEqual({ ok: false, code: 'UNREADABLE' })
  })

  it('三種換行都能分記錄；檔尾換行不多出空記錄', () => {
    expect(parseCsv('a,b\r\nc,d\ne,f\rg,h\r\n')).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']])
  })

  it('中間的空行是只含空字串的記錄（列號照算）', () => {
    expect(parseCsv('a\n\nb\n')).toEqual([['a'], [''], ['b']])
  })

  it('引號欄：內部 "" 還原、可含逗號與換行（換行原樣）', () => {
    expect(parseCsv('"李""美玲","王,小明","a\r\nb"')).toEqual([['李"美玲', '王,小明', 'a\r\nb']])
  })

  it('寬鬆規則：引號欄後的雜字元附加、非引號欄中的 " 是一般字元', () => {
    expect(parseCsv('"ab"cd,x"y')).toEqual([['abcd', 'x"y']])
  })

  it('空欄與結尾逗號保留為空字串；不 trim、不轉型', () => {
    expect(parseCsv(' 007 ,,')).toEqual([[' 007 ', '', '']])
  })
})

describe('serializeCsv', () => {
  it('每筆（含最後一筆）都以 CRLF 結尾；一般值不加引號', () => {
    expect(serializeCsv([['車頭車號', '車斗車號'], ['929-X2', '20-9A']])).toBe('車頭車號,車斗車號\r\n929-X2,20-9A\r\n')
  })

  it('含逗號、引號、換行或前後空白的值以引號包住，內部引號加倍', () => {
    expect(serializeCsv([['a,b', 'c"d', 'e\nf', ' g', 'h ']])).toBe('"a,b","c""d","e\nf"," g","h "\r\n')
  })

  it('序列化後再解析能完整還原（含空字串）', () => {
    const rows = [['李"美玲', '王,小明', ' 前後空白 ', ''], ['a\r\nb', '歐陽・小明', '=1+1', '007']]
    expect(parseCsv(serializeCsv(rows))).toEqual(rows)
  })
})
