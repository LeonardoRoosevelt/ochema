/**
 * QA（API 測試員）：CSV 怪異輸入。依據 docs/data-contract.md §3.5.1、§4.2。
 * 資料層，不經 UI：parseCsv / detectFormat / readImportFile / previewImport。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { CsvError, parseCsv, serializeCsv } from '../../src/data/csv'
import { resetDbForTest } from '../../src/data/db'
import { detectFormat } from '../../src/data/fileFormat'
import { readImportFile } from '../../src/data/excelRead'
import { previewImport } from '../../src/data/importer'
import type { ReadResult } from '../../src/data/types'
import { utf8 } from '../support/csvFixture'

const H = '車頭車號,車斗車號,駕駛姓名,駕駛身分證'
const rowsOf = (r: ReadResult) => {
  if (!r.ok) throw new Error(`預期可讀，實際 ${r.code}`)
  return r.rows
}
const read = (text: string, bom = false) => readImportFile(utf8(text, bom))

beforeEach(async () => {
  await resetDbForTest()
})

describe('parseCsv：換行與引號（契約 §4.2）', () => {
  it('空字串 → 無記錄；只有一個換行 → 一筆 [""]；結尾換行不產生多餘空記錄', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\n')).toEqual([['']])
    expect(parseCsv('a,b\n')).toEqual([['a', 'b']])
    expect(parseCsv('a,b')).toEqual([['a', 'b']])
    expect(parseCsv('a,b\r\n\r\n')).toEqual([['a', 'b'], ['']]) // 中間／結尾的第二個換行是一筆空行
  })

  it('三種記錄分隔（CRLF、LF、單獨 CR）與混用', () => {
    expect(parseCsv('a\r\nb\r\nc')).toEqual([['a'], ['b'], ['c']])
    expect(parseCsv('a\nb\nc')).toEqual([['a'], ['b'], ['c']])
    expect(parseCsv('a\rb\rc')).toEqual([['a'], ['b'], ['c']])
    expect(parseCsv('a\r\nb\nc\rd\r\ne')).toEqual([['a'], ['b'], ['c'], ['d'], ['e']])
  })

  it('CR 與 LF 分開出現（\\n\\r）算兩個換行', () => {
    expect(parseCsv('a\n\rb')).toEqual([['a'], [''], ['b']])
  })

  it('引號內的 CRLF／LF／CR 原樣保留；"" 還原成 "', () => {
    expect(parseCsv('"a\r\nb","c\nd","e\rf"\n')).toEqual([['a\r\nb', 'c\nd', 'e\rf']])
    expect(parseCsv('"he said ""hi""",x')).toEqual([['he said "hi"', 'x']])
    expect(parseCsv('""""')).toEqual([['"']])
    expect(parseCsv('""')).toEqual([['']])
  })

  it('尾端多餘逗號產生多一個空欄；連續逗號產生空欄', () => {
    expect(parseCsv('a,b,\n')).toEqual([['a', 'b', '']])
    expect(parseCsv('a,,b,,\n')).toEqual([['a', '', 'b', '', '']])
    expect(parseCsv(',\n')).toEqual([['', '']])
    expect(parseCsv(',')).toEqual([['', '']])
  })

  it('寬鬆規則：引號欄後的雜字元原樣附加；非引號欄中的 " 是一般字元', () => {
    expect(parseCsv('"ab"cd,e')).toEqual([['abcd', 'e']])
    expect(parseCsv('a"b,c')).toEqual([['a"b', 'c']])
    expect(parseCsv(' "a",b')).toEqual([[' "a"', 'b']]) // 引號前有空白 → 不算引號欄
  })

  it('不 trim、不轉型：前導 0、前後空白原樣', () => {
    expect(parseCsv(' 007 , x \n')).toEqual([[' 007 ', ' x ']])
  })

  it('引號欄沒有收尾 → 丟 CsvError（嚴格，契約 §4.2）', () => {
    expect(() => parseCsv('"abc')).toThrow(CsvError)
    expect(() => parseCsv('a,"b\nc,d\n')).toThrow(CsvError)
    expect(() => parseCsv('"a""')).toThrow(CsvError) // "" 之後沒有收尾
  })

  it('超長單一欄位（5 MB）與 5 萬欄的列都能在時限內解析', () => {
    const t0 = performance.now()
    expect(parseCsv('x'.repeat(5_000_000))[0][0].length).toBe(5_000_000)
    expect(parseCsv(Array(50_000).fill('a').join(','))[0]).toHaveLength(50_000)
    expect(performance.now() - t0).toBeLessThan(5000)
  })
})

describe('serializeCsv 與 parseCsv 往返', () => {
  it('含逗號、引號、三種換行、前後空白、空字串、emoji 的值往返不變', () => {
    const grid = [
      ['a,b', 'he said "hi"', 'x\ny', 'p\r\nq', 'r\rs'],
      [' lead', 'trail ', '', '😀', '=1+1'],
      ['', '', '', '', ''],
    ]
    expect(parseCsv(serializeCsv(grid))).toEqual(grid)
  })
  it('每筆（含最後一筆）以 CRLF 結尾；只含空白的值被加引號以保留', () => {
    expect(serializeCsv([['a', 'b'], ['c', ' ']])).toBe('a,b\r\nc," "\r\n')
  })
})

describe('detectFormat／readImportFile：編碼與檔案形狀', () => {
  it('只有 BOM、只有 BOM+空白、0 位元組 → EMPTY_FILE', () => {
    expect(detectFormat(new Uint8Array([]))).toEqual({ ok: false, code: 'EMPTY_FILE' })
    expect(detectFormat(Uint8Array.from([0xef, 0xbb, 0xbf]))).toEqual({ ok: false, code: 'EMPTY_FILE' })
    expect(read('', true)).toEqual({ ok: false, code: 'EMPTY_FILE' })
    expect(read(' \r\n\t\r\n  ', true)).toEqual({ ok: false, code: 'EMPTY_FILE' })
    expect(read('\u3000\u00A0 \n')).toEqual({ ok: false, code: 'EMPTY_FILE' })
    expect(read(',,,\r\n,,\r\n')).toEqual({ ok: false, code: 'EMPTY_FILE' }) // 只有逗號：沒有任何非空白儲存格
  })

  it('夾在中間的 NUL → UNREADABLE（無 hint）；非法 UTF-8 → UNREADABLE＋SAVE_AS_CSV_UTF8', () => {
    const withNul = utf8(`${H}\r\nA-1,B-1,王,A123456789\r\n`)
    const nul = Uint8Array.from([...withNul.slice(0, 20), 0, ...withNul.slice(20)])
    expect(readImportFile(nul)).toEqual({ ok: false, code: 'UNREADABLE' })
    expect(readImportFile(Uint8Array.from([0xb8, 0xdc, 0xb3, 0x74, 0x2c, 0xa8, 0xad]))).toEqual({
      ok: false,
      code: 'UNREADABLE',
      hint: 'SAVE_AS_CSV_UTF8',
    })
  })

  it('截斷在多位元組字元中間的 UTF-8 → UNREADABLE＋hint（不匯入亂碼）', () => {
    const full = utf8(`${H}\r\nA-1,B-1,王,A123456789\r\n`)
    const idx = full.indexOf(0xe7) // 「王」的第一個位元組
    const cut = full.slice(0, idx + 1)
    expect(readImportFile(cut)).toEqual({ ok: false, code: 'UNREADABLE', hint: 'SAVE_AS_CSV_UTF8' })
  })

  it('UTF-16 LE（含 BOM）的 CSV 含 NUL → UNREADABLE', () => {
    const s = `${H}\r\nA-1,B-1,王,A123456789\r\n`
    const buf = new Uint8Array(2 + s.length * 2)
    buf.set([0xff, 0xfe])
    for (let i = 0; i < s.length; i++) {
      buf[2 + i * 2] = s.charCodeAt(i) & 0xff
      buf[3 + i * 2] = s.charCodeAt(i) >> 8
    }
    expect(readImportFile(buf).ok).toBe(false)
  })

  it('未收尾的引號 → UNREADABLE', () => {
    expect(read(`${H}\r\n"A-1,B-1,王,A123456789\r\n`)).toEqual({ ok: false, code: 'UNREADABLE' })
  })

  it('純文字（合法 UTF-8 但不是表格）→ MISSING_HEADERS，四個標題全缺', () => {
    expect(read('今天開會決議：\n1. 車輛盤點\n')).toEqual({
      ok: false,
      code: 'MISSING_HEADERS',
      missing: ['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證'],
    })
  })

  it('缺一個標題 → MISSING_HEADERS 只列缺的；標題大小寫／全形逗號不當分隔', () => {
    expect(read('車頭車號,車斗車號,駕駛姓名\r\nA-1,B-1,王\r\n')).toEqual({ ok: false, code: 'MISSING_HEADERS', missing: ['駕駛身分證'] })
    expect(read('車頭車號，車斗車號，駕駛姓名，駕駛身分證\r\n')).toMatchObject({ ok: false, code: 'MISSING_HEADERS' }) // 全形逗號不是分隔
  })

  it('以 Uint8Array 視圖（byteOffset ≠ 0、底層 buffer 較大）與 ArrayBuffer 傳入，結果一致', () => {
    const body = utf8(`${H}\r\nA-1,B-1,王,A123456789\r\n`)
    const big = new Uint8Array(body.length + 100)
    big.fill(0x7a) // 'z'：若誤讀到視圖外會污染結果
    big.set(body, 50)
    const view = big.subarray(50, 50 + body.length)
    const viaView = rowsOf(readImportFile(view))
    const viaBuf = rowsOf(readImportFile(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer))
    expect(viaView).toEqual(viaBuf)
    expect(viaView).toHaveLength(1)
  })

  it('[特性紀錄] 內容為 "PK\\x03\\x04" 開頭但副檔名是 .csv 的檔案：副檔名完全不看 → 當 xlsx 讀、損毀 → UNREADABLE', () => {
    expect(readImportFile(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 9, 9, 9]))).toEqual({ ok: false, code: 'UNREADABLE' })
  })
})

describe('readImportFile：CSV 列規則（gridToRawRows）', () => {
  const A = 'A-1,B-1,王,A123456789'

  it('三種換行風格（純 CRLF、純 LF、混用、單獨 CR）讀出同樣的列與同樣的 fileRow', () => {
    const lines = [H, A, 'C-3,D-3,李,F131104093', 'E-5,F-5,張,A800000014']
    const variants = [lines.join('\r\n') + '\r\n', lines.join('\n') + '\n', lines.join('\r'), `${lines[0]}\r\n${lines[1]}\n${lines[2]}\r${lines[3]}\r\n`]
    const results = variants.map((v) => rowsOf(read(v)))
    for (const r of results) expect(r).toEqual(results[0])
    expect(results[0].map((r) => r.fileRow)).toEqual([2, 3, 4])
  })

  it('檔尾沒有換行、有一個換行、有兩個換行：資料列數都一樣（空行被略過但仍佔列號）', () => {
    for (const tail of ['', '\r\n', '\r\n\r\n', '\n\n\n']) expect(rowsOf(read(`${H}\r\n${A}${tail}`))).toHaveLength(1)
  })

  it('引號內換行的駕駛姓名：一筆記錄、換行原樣保留、fileRow 以記錄序號計（不是文字行號）', () => {
    const rows = rowsOf(read(`${H}\r\nA-1,B-1,"王\r\n小明",A123456789\r\nC-3,D-3,李,F131104093\r\n`))
    expect(rows.map((r) => r.cells.ownerName)).toEqual(['王\r\n小明', '李'])
    expect(rows.map((r) => r.fileRow)).toEqual([2, 3])
  })

  it('引號內含逗號與 ""；欄位值前後有引號外空白原樣交給後續 trim', () => {
    const rows = rowsOf(read(`${H}\r\nA-1,B-1,"王,""小""明",A123456789\r\n`))
    expect(rows[0].cells.ownerName).toBe('王,"小"明')
  })

  it('標題與資料列尾端多餘逗號：多出的空欄被忽略，不影響四欄', () => {
    const rows = rowsOf(read(`${H},\r\n${A},\r\nC-3,D-3,李,F131104093,,,\r\n`))
    expect(rows.map((r) => r.cells)).toEqual([
      { headPlate: 'A-1', tailPlate: 'B-1', ownerName: '王', idNumber: 'A123456789' },
      { headPlate: 'C-3', tailPlate: 'D-3', ownerName: '李', idNumber: 'F131104093' },
    ])
  })

  it('空白列與「只有逗號」的列被略過，但列號照算', () => {
    const rows = rowsOf(read(`${H}\r\n\r\n,,,\r\n   ,\u00A0,\u3000,\r\n${A}\r\n`))
    expect(rows.map((r) => r.fileRow)).toEqual([5])
  })

  it('標題列固定為第 1 列（附錄 Q-E 勝出）：第 1 列是空白、標題在後面 → MISSING_HEADERS（四個全缺）', () => {
    expect(read(`\r\n\r\n${H}\r\n${A}\r\n`)).toEqual({
      ok: false,
      code: 'MISSING_HEADERS',
      missing: ['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證'],
    })
  })
  // 註：契約 §3.5.1 規則 1 正文仍寫「第一個非空白列」，與附錄 Q-E 矛盾（文件過期，實作依附錄）。已列入回報。

  it('比標題短的列：缺的格視為空字串；比標題長：多的忽略', () => {
    const rows = rowsOf(read(`${H}\r\nA-1,B-1\r\nC-3,D-3,李,F131104093,多,更多\r\n`))
    expect(rows[0].cells).toEqual({ headPlate: 'A-1', tailPlate: 'B-1', ownerName: '', idNumber: '' })
    expect(rows[1].cells.idNumber).toBe('F131104093')
  })

  it('標題順序不拘、有多餘欄、重複標題取最左；標題前後空白（含 NBSP、全形空白）被 trim', () => {
    const rows = rowsOf(read(' 駕駛身分證 ,備註,\u00A0駕駛姓名\u3000,車斗車號,車頭車號,車頭車號\r\nA123456789,x,王,B-1,A-1,IGNORED\r\n'))
    expect(rows[0].cells).toEqual({ headPlate: 'A-1', tailPlate: 'B-1', ownerName: '王', idNumber: 'A123456789' })
  })

  it('BOM 開頭 + CRLF 與無 BOM 結果相同（BOM 不污染第一個標題）', () => {
    expect(read(`${H}\r\n${A}\r\n`, true)).toEqual(read(`${H}\r\n${A}\r\n`, false))
  })

  it('前導 0 與公式字元原樣保留（不轉型、不轉義）', () => {
    const rows = rowsOf(read(`${H}\r\n0012-007,=1+1,@王,A123456789\r\n`))
    expect(rows[0].cells).toMatchObject({ headPlate: '0012-007', tailPlate: '=1+1', ownerName: '@王' })
  })

  it('只有標題列：ok 且 rows 為空；previewImport 回報 total=0', async () => {
    expect(rowsOf(read(`${H}\r\n`))).toEqual([])
    const p = await previewImport(utf8(`${H}`))
    expect(p.ok && p.preview.counts.total).toBe(0)
  })

  it('分號、Tab 分隔不會被偵測（契約：只認逗號）→ 缺標題', () => {
    expect(read('車頭車號;車斗車號;駕駛姓名;駕駛身分證\r\n')).toMatchObject({ ok: false, code: 'MISSING_HEADERS' })
    expect(read('車頭車號\t車斗車號\t駕駛姓名\t駕駛身分證\r\n')).toMatchObject({ ok: false, code: 'MISSING_HEADERS' })
  })

  it('格式錯誤的列照常讀出，錯誤留給預覽分類：短列→REQUIRED、全形車牌→PLATE_FULLWIDTH', async () => {
    const p = await previewImport(utf8(`${H}\r\nA-1,B-1\r\nＡ-1,B-2,王,A123456789\r\n`))
    if (!p.ok) throw new Error('預覽應成功')
    expect(p.preview.rows.map((r) => [r.category, r.error?.field, r.error?.code])).toEqual([
      ['FORMAT_ERROR', 'ownerName', 'REQUIRED'],
      ['FORMAT_ERROR', 'headPlate', 'PLATE_FULLWIDTH'],
    ])
  })

  it.todo('[未定義] CSV 單一欄位或整檔的大小上限（例如 50 MB 檔案）：契約沒有檔案大小限制，也沒有 UI 以外的防護')
  it.todo('[未定義] 標題儲存格含 NFD 組合字或全形空白在字中間：契約只規定 trim 後完全相等')
})
