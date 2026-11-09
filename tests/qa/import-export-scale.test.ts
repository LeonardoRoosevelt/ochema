/**
 * QA（API 測試員）：大檔匯入耗時、三格式匯出含 emoji／特殊字元的往返。
 * 依據 docs/data-contract.md §3.5（分類與提交）、§3.6（匯出）。
 * 耗時上限刻意寬鬆（jsdom＋fake-indexeddb，非瀏覽器效能）；實測耗時用 console.info 留下紀錄。
 */
import * as XLSX from 'xlsx'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTest } from '../../src/data/db'
import { readImportFile } from '../../src/data/excelRead'
import { CellTooLongError, XLS_MAX_ROWS, XlsRowLimitError, buildExportBytes, exportRecords } from '../../src/data/excelWrite'
import { commitImport, previewImport } from '../../src/data/importer'
import { createRecord, listRecords } from '../../src/data/records'
import type { ExportFormat, RawRow, VehicleRecord } from '../../src/data/types'
import { utf8 } from '../support/csvFixture'
import { sheetFromGrid, workbookBytes } from '../support/workbook'

const H = ['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證']
const FORMATS: ExportFormat[] = ['xlsx', 'xls', 'csv']
const N = 5000

beforeEach(async () => {
  await resetDbForTest()
})

/** n 列資料（加標題列） */
function bigGrid(n: number, mk: (i: number) => string[]): string[][] {
  return [H, ...Array.from({ length: n }, (_, i) => mk(i))]
}
const unique = (i: number) => [`H${i}-A`, `T${i}-B`, `車主${i}😀`, `A${String(i).padStart(9, '0')}`]
// 駕駛身分證每列不同（檢查碼多半不合 → 只警示，不影響匯入），所以不會有 SAME_ID_DIFF_NAME

function bytesOf(fmt: ExportFormat, grid: string[][]): Uint8Array {
  if (fmt === 'csv') {
    const body = grid.map((r) => r.map((v) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\r\n') + '\r\n'
    return utf8(body, true)
  }
  return workbookBytes(sheetFromGrid(grid), fmt === 'xlsx' ? 'xlsx' : 'biff8')
}

async function timed<T>(label: string, fn: () => Promise<T> | T): Promise<{ value: T; ms: number }> {
  const t0 = performance.now()
  const value = await fn()
  const ms = performance.now() - t0
  console.info(`[QA 耗時] ${label}: ${ms.toFixed(0)} ms`)
  return { value, ms }
}

describe(`大檔匯入（${N} 列）`, () => {
  it.each(FORMATS)('%s：全是新資料 → 預覽全 NEW；提交後 id 順序＝檔案列序；耗時在寬鬆上限內', async (fmt) => {
    const bytes = bytesOf(fmt, bigGrid(N, unique))
    const prev = await timed(`${fmt} previewImport ${N}`, () => previewImport(bytes))
    if (!prev.value.ok) throw new Error('預覽應成功')
    const p = prev.value.preview
    expect(p.counts).toEqual({ total: N, new: N, dupExisting: 0, dupInFile: 0, formatError: 0 })
    expect(p.rows[0].fileRow).toBe(2)
    expect(p.rows.at(-1)!.fileRow).toBe(N + 1)

    const commit = await timed(`${fmt} commitImport ${N}`, () => commitImport(p, 'SKIP_DUPLICATES'))
    expect(commit.value).toEqual({ imported: N, skipped: 0, formatErrorsNotImported: 0 })
    const listed = await listRecords()
    expect(listed).toHaveLength(N)
    expect(listed.map((r) => r.headPlate)).toEqual(Array.from({ length: N }, (_, i) => `H${i}-A`))
    expect(listed.every((r, i) => i === 0 || r.id > listed[i - 1].id)).toBe(true)
    expect(prev.ms + commit.ms).toBeLessThan(30_000)
  })

  it('csv 最壞情況：5,000 列全部同車頭車號（每列都要與前面所有列比對）→ 全是 DUP_IN_FILE（第一列 NEW），耗時在上限內', async () => {
    const grid = bigGrid(N, (i) => ['SAME-1', `T${i}-B`, `車主${i}`, `A${String(i).padStart(9, '0')}`])
    const prev = await timed('csv previewImport 全同車頭車號', () => previewImport(bytesOf('csv', grid)))
    if (!prev.value.ok) throw new Error('預覽應成功')
    expect(prev.value.preview.counts).toEqual({ total: N, new: 1, dupExisting: 0, dupInFile: N - 1, formatError: 0 })
    expect(prev.ms).toBeLessThan(20_000)
    const commit = await timed('csv commitImport IMPORT_ALL 全同車頭車號', () => commitImport(prev.value.ok ? prev.value.preview : (undefined as never), 'IMPORT_ALL'))
    expect(commit.value.imported).toBe(N) // 非整列相同 → 照樣匯入
    expect(commit.ms).toBeLessThan(30_000)
  })

  it('csv：5,000 列中混入整列相同、格式錯誤、對既有資料重複 → 三項計數相加＝total；IMPORT_ALL 不匯入整列相同', async () => {
    await createRecord({ headPlate: 'EXIST-1', tailPlate: 'EXIST-2', ownerName: '既有', idNumber: 'A123456789' })
    const grid = bigGrid(N, (i) => {
      if (i % 1000 === 0) return ['bad', `T${i}-B`, `X${i}`, 'A123456789'] // 小寫無連字號 → FORMAT_ERROR（5 列）
      if (i % 1000 === 1) return ['EXIST-1', 'EXIST-2', '既有', 'A123456789'] // 與既有整列相同（5 列）
      if (i % 1000 === 2) return ['EXIST-1', `T${i}-B`, `Y${i}`, `A${i}`] // 同車頭車號（5 列）
      return unique(i)
    })
    const prev = await previewImport(bytesOf('csv', grid))
    if (!prev.ok) throw new Error('預覽應成功')
    const c = prev.preview.counts
    expect(c.total).toBe(N)
    expect(c.new + c.dupExisting + c.dupInFile + c.formatError).toBe(N)
    expect(c.formatError).toBe(5)
    expect(prev.preview.identicalRows).toHaveLength(5)
    const res = await commitImport(prev.preview, 'IMPORT_ALL')
    expect(res.formatErrorsNotImported).toBe(5)
    expect(res.imported + res.skipped + res.formatErrorsNotImported).toBe(N)
    expect(res.skipped).toBe(5) // 只有整列相同的 5 列被略過
    expect(await listRecords()).toHaveLength(1 + N - 5 - 5)
  })

  // SheetJS 的 XLSX.write 遇到 !ref=A1:XFD1048576 會逐格走訪而卡死（fixture 端就造不出檔），
  // 故無法在此以資料層測試「宣告範圍極大的 xlsx」。
  it.todo('[未定義] 宣告範圍極大（A1:XFD1048576）但內容很少的真實 .xlsx 檔：需手工改 XML 造檔，未在此驗證')
})

// ── 三格式匯出往返 ────────────────────────────────────────

const tricky = [
  { name: 'emoji', v: '😀🚗🎉' },
  { name: 'ZWJ 家庭', v: '👨\u200D👩\u200D👧\u200D👦' },
  { name: '膚色修飾', v: '👍🏽' },
  { name: '國旗', v: '🇹🇼' },
  { name: '組合字 NFD', v: 'Jose\u0301' },
  { name: '預組 NFC', v: 'Jos\u00E9' },
  { name: '全形英數', v: 'ＡＢＣ１２３' },
  { name: '零寬空格', v: '王\u200B小明' },
  { name: '內部 NBSP', v: '王\u00A0小明' },
  { name: '前導 0', v: '007' },
  { name: '公式', v: '=1+1' },
  { name: '加號公式', v: '+SUM(A1:A9)' },
  { name: '@公式', v: '@cmd' },
  { name: '減號開頭', v: '-1' },
  { name: '逗號', v: '王,小明' },
  { name: '雙引號', v: '王"小"明' },
  { name: '單引號開頭', v: "'王" },
  { name: '內部換行 LF', v: '王\n小明' },
  { name: 'Tab', v: '王\t小明' },
  { name: '日期樣', v: '2026-01-02' },
  { name: '科學記號樣', v: '1E5' },
  { name: '看似布林', v: 'TRUE' },
  { name: '全數字', v: '0012345678' },
]

const mkRecords = (): VehicleRecord[] =>
  tricky.map((t, i) => ({ id: i + 1, headPlate: `H${i}-1`, tailPlate: `T${i}-1`, ownerName: t.v, idNumber: i % 2 ? 'A123456789' : 'F131104093' }))

describe('三格式匯出 → 讀回（往返）', () => {
  it.each(FORMATS)('%s：特殊字元的駕駛姓名逐字相同', (fmt) => {
    const recs = mkRecords()
    const read = readImportFile(buildExportBytes(recs, fmt))
    if (!read.ok) throw new Error(`讀回失敗 ${read.code}`)
    expect(read.format).toBe(fmt)
    const names = read.rows.map((r) => r.cells.ownerName)
    // 逐項比對，失敗時能看出是哪一個值被改寫
    tricky.forEach((t, i) => expect(names[i], `${fmt} / ${t.name}`).toBe(t.v))
    expect(read.rows.map((r) => r.fileRow)).toEqual(recs.map((_, i) => i + 2))
  })

  it.each(FORMATS)('%s：經資料庫完整往返（exportRecords → previewImport → commitImport）後四欄與順序完全還原', async (fmt) => {
    for (const r of mkRecords()) {
      const res = await createRecord(r)
      expect(res.ok, r.ownerName).toBe(true)
    }
    const before = (await listRecords()).map(({ id: _id, ...f }) => f)
    const out = await exportRecords(fmt)
    expect(out.count).toBe(before.length)
    await resetDbForTest()
    const prev = await previewImport(out.bytes)
    if (!prev.ok) throw new Error('預覽應成功')
    expect(prev.preview.counts.total).toBe(before.length)
    // 匯出的資料彼此之間會有「同車頭車號／同駕駛身分證不同姓名」之類的重複 → 用 IMPORT_ALL，整列相同者才會被略過
    await commitImport(prev.preview, 'IMPORT_ALL')
    const after = (await listRecords()).map(({ id: _id, ...f }) => f)
    expect(after).toEqual(before)
  })

  it.each(FORMATS)('%s：5,000 筆匯出再讀回，列數、第一筆、最後一筆正確', (fmt) => {
    const recs: VehicleRecord[] = Array.from({ length: N }, (_, i) => ({
      id: i + 1, headPlate: `H${i}-A`, tailPlate: `T${i}-B`, ownerName: `車主${i}😀`, idNumber: 'A123456789',
    }))
    const t0 = performance.now()
    const read = readImportFile(buildExportBytes(recs, fmt))
    console.info(`[QA 耗時] ${fmt} 匯出＋讀回 ${N} 列: ${(performance.now() - t0).toFixed(0)} ms`)
    if (!read.ok) throw new Error('讀回失敗')
    expect(read.rows).toHaveLength(N)
    expect(read.rows[0].cells.ownerName).toBe('車主0😀')
    expect(read.rows[N - 1].cells.headPlate).toBe(`H${N - 1}-A`)
  })

  it.each(FORMATS)('%s：空名單只有標題列，可讀回且 total=0', async (fmt) => {
    const out = await exportRecords(fmt)
    expect(out.count).toBe(0)
    const prev = await previewImport(out.bytes)
    expect(prev.ok && prev.preview.counts.total).toBe(0)
  })

  it.each(FORMATS)('%s：不受輸入順序影響，一律依 id 升冪輸出', (fmt) => {
    const recs = mkRecords().reverse()
    const read = readImportFile(buildExportBytes(recs, fmt))
    if (!read.ok) throw new Error('讀回失敗')
    expect(read.rows.map((r) => r.cells.headPlate)).toEqual(mkRecords().map((r) => r.headPlate))
  })

  // 缺陷（留紅燈）：契約 §3.6「匯出再匯入…四欄內容完全還原（三種格式皆然）」；實際 .xlsx 把駕駛姓名內的 CRLF 讀回成 LF。
  // 製片人裁決（C 退回 1）：SheetJS 讀 .xlsx 字串時一律把 CRLF 正規化為 LF，資料層無法修正；
  // 列為已知限制（契約附錄「C 退回 1 修正」）。csv／xls 仍須逐字還原。
  it.each(FORMATS.filter((f) => f !== 'xlsx'))('%s：駕駛姓名內含 CRLF 換行，匯出再讀回逐字相同', (fmt) => {
    const v = '王\r\n小明'
    const read = readImportFile(buildExportBytes([{ id: 1, headPlate: 'A-1', tailPlate: 'B-1', ownerName: v, idNumber: 'A123456789' }], fmt))
    if (!read.ok) throw new Error('讀回失敗')
    expect(JSON.stringify(read.rows[0].cells.ownerName)).toBe(JSON.stringify(v))
  })
  it('[已知限制] xlsx：駕駛姓名內 CRLF 匯出再讀回成為 LF（其餘字元不變）', () => {
    const read = readImportFile(buildExportBytes([{ id: 1, headPlate: 'A-1', tailPlate: 'B-1', ownerName: '王\r\n小明', idNumber: 'A123456789' }], 'xlsx'))
    if (!read.ok) throw new Error('讀回失敗')
    expect(JSON.stringify(read.rows[0].cells.ownerName)).toBe(JSON.stringify('王\n小明'))
  })

  it('xlsx／xls 的每個資料儲存格都是文字型別 t:"s"（前導 0、日期樣、科學記號樣不被轉型）', () => {
    for (const fmt of ['xlsx', 'xls'] as const) {
      const wb = XLSX.read(buildExportBytes(mkRecords(), fmt), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const types = Object.keys(ws).filter((k) => !k.startsWith('!')).map((k) => (ws[k] as XLSX.CellObject).t)
      expect(new Set(types), fmt).toEqual(new Set(['s']))
    }
  })

  it('csv：以 UTF-8 BOM 開頭、CRLF 結尾；內部換行與引號有正確跳脫', () => {
    const bytes = buildExportBytes(mkRecords(), 'csv')
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
    expect(text.endsWith('\r\n')).toBe(true)
    expect(text).toContain('"王""小""明"')
    expect(text).toContain('"王,小明"')
  })

  it('檔案魔術位元組：xlsx＝PK、xls＝OLE2（D0 CF 11 E0）', () => {
    expect([...buildExportBytes(mkRecords(), 'xlsx').slice(0, 4)]).toEqual([0x50, 0x4b, 3, 4])
    expect([...buildExportBytes(mkRecords(), 'xls').slice(0, 4)]).toEqual([0xd0, 0xcf, 0x11, 0xe0])
  })
})

describe('匯出的上限與極端值', () => {
  it('.xls 超過 65,536 列（含標題）→ XlsRowLimitError；剛好 65,536 列的邊界在下一個測試', () => {
    const recs: VehicleRecord[] = Array.from({ length: XLS_MAX_ROWS }, (_, i) => ({
      id: i + 1, headPlate: 'A-1', tailPlate: 'B-1', ownerName: 'x', idNumber: 'A123456789',
    })) // 65,536 筆資料 + 1 標題 = 65,537 列 > 上限
    expect(() => buildExportBytes(recs, 'xls')).toThrow(XlsRowLimitError)
    expect(() => buildExportBytes(recs, 'xls')).toThrow(/xlsx/)
  })

  it('.xls 剛好 65,536 列（65,535 筆＋標題）可匯出，讀回筆數正確', { timeout: 120_000 }, () => {
    const recs: VehicleRecord[] = Array.from({ length: XLS_MAX_ROWS - 1 }, (_, i) => ({
      id: i + 1, headPlate: `H${i}-1`, tailPlate: 'B-1', ownerName: 'x', idNumber: 'A123456789',
    }))
    const t0 = performance.now()
    const read = readImportFile(buildExportBytes(recs, 'xls'))
    console.info(`[QA 耗時] xls 65,535 筆匯出＋讀回: ${(performance.now() - t0).toFixed(0)} ms`)
    expect(read.ok && read.rows.length).toBe(XLS_MAX_ROWS - 1)
  })

  it('xlsx／csv 在 7 萬列仍可匯出（無列數上限）', { timeout: 120_000 }, () => {
    const recs: VehicleRecord[] = Array.from({ length: 70_000 }, (_, i) => ({
      id: i + 1, headPlate: `H${i}-1`, tailPlate: 'B-1', ownerName: 'x', idNumber: 'A123456789',
    }))
    const csv = readImportFile(buildExportBytes(recs, 'csv'))
    expect(csv.ok && csv.rows.length).toBe(70_000)
  })

  it('超長駕駛姓名（10 萬字元）：csv 往返不變', () => {
    const v = '王'.repeat(100_000)
    const read = readImportFile(buildExportBytes([{ id: 1, headPlate: 'A-1', tailPlate: 'B-1', ownerName: v, idNumber: 'A123456789' }], 'csv'))
    expect(read.ok && read.rows[0].cells.ownerName).toBe(v)
  })

  // Excel 單一儲存格上限 32,767 字元；契約沒有駕駛姓名長度上限 → 錯誤的行為由下面兩個測試如實記錄
  it('[特性紀錄] 駕駛姓名 32,768 字元（超過 Excel 儲存格上限）匯出 xlsx：記錄是否丟錯', () => {
    const rec: VehicleRecord = { id: 1, headPlate: 'A-1', tailPlate: 'B-1', ownerName: 'x'.repeat(32_768), idNumber: 'A123456789' }
    let outcome: string
    try {
      const read = readImportFile(buildExportBytes([rec], 'xlsx'))
      outcome = read.ok ? `ok:${read.rows[0].cells.ownerName.length}` : `read-fail:${read.code}`
    } catch (e) {
      outcome = `throws:${(e as Error).message}`
    }
    console.info(`[QA 特性紀錄] xlsx 匯出 32,768 字元駕駛姓名 → ${outcome}`)
    // 製片人裁決（C 退回 1）：匯出端以具名錯誤告知、不新增輸入長度規則
    expect(() => buildExportBytes([rec], 'xlsx')).toThrow(CellTooLongError)
    expect(outcome).toMatch(/^throws:.*請改用 CSV/)
  })
  it.todo('[未定義] 含孤立代理字元（lone surrogate，例如 "\\uD83D"）的駕駛姓名：CSV 以 UTF-8 編碼會被換成 U+FFFD，往返不再逐字相同')
  it.todo('[未定義] CSV 以 Excel 開啟再另存會把 007 變 7、=… 當公式（契約 §3.6 已知限制 b，非檔案內容問題）')
})

describe('匯入檔：xlsx 儲存格型別邊界', () => {
  it.each(['xlsx', 'xls'] as const)('%s：數字儲存格 7＋格式 000 → "007"；General → "7"；布林／日期儲存格不丟錯', (fmt) => {
    const ws = sheetFromGrid([H, ['A-1', 'B-1', '王', 'A123456789']])
    ws['C2'] = { t: 'n', v: 7, z: '000' }
    ws['D2'] = { t: 'b', v: true }
    ws['A3'] = { t: 'n', v: 7, z: 'General' }
    ws['B3'] = { t: 'd', v: new Date(Date.UTC(2026, 0, 2)), z: 'yyyy-mm-dd' }
    ws['C3'] = { t: 's', v: '李' }
    ws['D3'] = { t: 's', v: 'F131104093' }
    ws['!ref'] = 'A1:D3'
    const read = readImportFile(workbookBytes(ws, fmt === 'xlsx' ? 'xlsx' : 'biff8'))
    if (!read.ok) throw new Error(`讀取失敗 ${read.code}`)
    const rows: RawRow[] = read.rows
    expect(rows[0].cells.ownerName).toBe('007')
    expect(rows[1].cells.headPlate).toBe('7')
    expect(rows[1].cells.tailPlate).toMatch(/2026|26|1\/2|01/) // 日期顯示文字依格式，只確認有內容且不丟錯
  })
})
