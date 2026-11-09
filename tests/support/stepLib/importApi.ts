import { expect } from 'vitest'
import { commitImport, previewImport } from '../../../src/data/importer'
import { createRecord, deleteAllRecords, listRecords } from '../../../src/data/records'
import type { ImportPreview, PreviewRow, RowCategory, RowConflictKind, VehicleRecord } from '../../../src/data/types'
import { expectOk, stripId, type World } from '../world'
import { emptyXls, emptyXlsx, big5Csv, corruptedXlsx, nulCsv, randomBinary, truncatedXls, type FileKind, type FileSpec } from '../workbook'
import { utf8 } from '../csvFixture'
import { currentFile, importViaUi, MODE_BY_LABEL } from './importFlow'
import type { Reg, TableRow } from './reg'

// ── 檔案描述 ───────────────────────────────────────────

const KIND_BY_DESC: Record<string, FileKind> = {
  Excel: 'xlsx',
  '.xls': 'xls',
  'CSV（有 BOM）': 'csv-bom',
  'CSV（無 BOM）': 'csv',
}
function kindOf(desc: string): FileKind {
  const k = KIND_BY_DESC[desc.trim()]
  if (!k) throw new Error(`未知的檔案格式描述：「${desc}」`)
  return k
}
const splitHeaders = (text: string) => text.split('、').map((s) => s.trim())

/** 把「欄名 → 值」依標題列順序排成一列 */
function rowFor(headers: string[], byTitle: Record<string, string>): string[] {
  return headers.map((h) => byTitle[h] ?? '')
}

function ensureSpec(w: World, kind: FileKind, headers: string[]): FileSpec {
  w.spec = { kind, headers, rows: [] }
  w.rawFile = undefined
  return w.spec
}

function cellsFor(fileRow: number, h: string, t: string, n: string, i: string, headers: string[]) {
  return { fileRow, row: rowFor(headers, { 車頭車號: h, 車斗車號: t, 駕駛姓名: n, 駕駛身分證: i }) }
}

// ── 預覽結果存取 ───────────────────────────────────────

function previewOf(w: World): ImportPreview {
  expect(w.preview, '尚未預覽').toBeDefined()
  expectOk(w.preview!, '預覽')
  return w.preview.preview
}
const rowAt = (p: ImportPreview, fileRow: number): PreviewRow => {
  const row = p.rows.find((x) => x.fileRow === fileRow)
  expect(row, `預覽裡沒有檔案第 ${fileRow} 列`).toBeDefined()
  return row!
}
const fileRowsOf = (p: ImportPreview, category: RowCategory) => p.rows.filter((r) => r.category === category).map((r) => r.fileRow)

const KIND_BY_LABEL: Record<string, RowConflictKind> = {
  整列相同: 'IDENTICAL_ROW',
  同車頭車號: 'SAME_HEAD',
  同車斗車號: 'SAME_TAIL',
  同駕駛身分證不同姓名: 'SAME_ID_DIFF_NAME',
}
/** 「整列相同、同車頭車號、同車斗車號」→ ['IDENTICAL_ROW','SAME_HEAD','SAME_TAIL']（順序固定，契約 §3.5 kinds） */
const kindsOf = (label: string): RowConflictKind[] =>
  label.split('、').map((s) => {
    const k = KIND_BY_LABEL[s.trim()]
    if (!k) throw new Error(`未知的重複種類：${s}`)
    return k
  })

const COUNT_FIELD = { 可新增: 'new', 與既有資料重複: 'dupExisting', 檔內重複: 'dupInFile', 格式錯誤: 'formatError' } as const

// ── 重現快照（用來模擬「兩種選項」而不互相污染）──────────────
async function restore(snapshot: VehicleRecord[]) {
  await deleteAllRecords()
  for (const rec of snapshot) {
    const res = await createRecord(stripId(rec))
    if (!res.ok) throw new Error(`還原快照失敗：${JSON.stringify(res)}`)
  }
}
const tupleKey = (x: { headPlate: string; tailPlate: string; ownerName: string; idNumber: string }) =>
  [x.headPlate, x.tailPlate, x.ownerName, x.idNumber].join('\u0000')

export function registerImportApi(r: Reg) {
  // ════ 準備檔案 ════
  r.step('一份{any}檔，標題列為 {any}，內容如下：', (w, desc: string, headers: string, table: TableRow[]) => {
    const hs = splitHeaders(headers)
    const spec = ensureSpec(w, kindOf(desc), hs)
    spec.rows = table.map((row) => rowFor(hs, row))
  })
  r.step('一份{any}檔，標題列為 {any}，沒有任何資料列', (w, desc: string, headers: string) => {
    ensureSpec(w, kindOf(desc), splitHeaders(headers))
  })
  // 單格需要保留前後空白的值，只能寫在引號字串裡（Examples／資料表的儲存格會被修剪）
  r.step(
    '一份{any}檔，標題列為 {any}，其中第 {int} 列的儲存格內容為：車頭車號 {string}、車斗車號 {string}、駕駛姓名 {string}、駕駛身分證 {string}',
    (w, desc: string, headers: string, fileRow: number, h, t, n, i) => {
      const hs = splitHeaders(headers)
      const spec = ensureSpec(w, kindOf(desc), hs)
      spec.rows[fileRow - 2] = cellsFor(fileRow, h, t, n, i, hs).row
    },
  )
  r.step('第 {int} 列的儲存格內容為：車頭車號 {string}、車斗車號 {string}、駕駛姓名 {string}、駕駛身分證 {string}', (w, fileRow: number, h, t, n, i) => {
    const spec = w.spec!
    spec.rows[fileRow - 2] = cellsFor(fileRow, h, t, n, i, spec.headers).row
  })
  r.step(
    '一份{any}檔，標題列為 {any}，其中第 {int} 列的「駕駛姓名」儲存格是數字 {any}，儲存格格式使它顯示為 {string}，其餘儲存格為文字：車頭車號 {string}、車斗車號 {string}、駕駛身分證 {string}',
    (w, desc: string, headers: string, fileRow: number, value: string, display: string, h, t, i) => {
      const hs = splitHeaders(headers)
      const spec = ensureSpec(w, kindOf(desc), hs)
      spec.rows[fileRow - 2] = cellsFor(fileRow, h, t, '', i, hs).row
      spec.numeric = { rowIndex: fileRow - 2, colIndex: hs.indexOf('駕駛姓名'), value: Number(value), display }
    },
  )
  r.step(
    '一份{any}檔，標題列為 {any}，其中第 {int} 列的「車頭車號」儲存格是數字 {any}，顯示為 {string}，其餘儲存格為文字：車斗車號 {string}、駕駛姓名 {string}、駕駛身分證 {string}',
    (w, desc: string, headers: string, fileRow: number, value: string, display: string, t, n, i) => {
      const hs = splitHeaders(headers)
      const spec = ensureSpec(w, kindOf(desc), hs)
      spec.rows[fileRow - 2] = cellsFor(fileRow, '', t, n, i, hs).row
      spec.numeric = { rowIndex: fileRow - 2, colIndex: hs.indexOf('車頭車號'), value: Number(value), display }
    },
  )
  r.step('一份完全空白的 Excel 檔', (w) => {
    w.spec = undefined
    w.rawFile = { bytes: emptyXlsx(), name: 'blank.xlsx' }
  })
  r.step('一份{any}檔，原始內容為：', (w, desc: string, doc: string) => {
    w.spec = undefined
    const kind = kindOf(desc)
    w.rawFile = { bytes: utf8(doc, kind === 'csv-bom'), name: 'raw.csv' }
  })
  r.step('一份副檔名是 {any}、內容為合法 UTF-8 純文字的檔案，原始內容為：', (w, _ext: string, doc: string) => {
    w.spec = undefined
    w.rawFile = { bytes: utf8(doc), name: 'minutes.txt' }
  })
  r.step(
    '一份副檔名是 {any}、但內容是 {any} 的檔案，標題列為 車頭車號、車斗車號、駕駛姓名、駕駛身分證，內容如下：',
    (w, _ext: string, actual: string, table: TableRow[]) => {
      const kind: FileKind = actual.trim() === 'UTF-8 CSV' ? 'csv' : actual.trim() === '.xlsx' ? 'xlsx' : 'xls'
      const hs = ['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證']
      const spec = ensureSpec(w, kind, hs)
      spec.rows = table.map((row) => rowFor(hs, row))
    },
  )
  // Big5：位元組不是合法 UTF-8（fixture 內會驗證，否則直接丟錯）
  r.step(
    '一份 Big5 編碼的 CSV 檔，標題列為 車頭車號、車斗車號、駕駛姓名、駕駛身分證，內容為一列資料：車頭車號 {string}、車斗車號 {string}、駕駛姓名 {string}、駕駛身分證 {string}',
    (w, h, t, n, i) => {
      w.spec = undefined
      w.rawFile = { bytes: big5Csv([['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證'], [h, t, n, i]]), name: 'big5.csv' }
    },
  )
  r.step(
    '一份 Big5 編碼的 CSV 檔，標題列為 車頭車號、車斗車號、駕駛姓名、駕駛身分證，資料列的駕駛姓名含有中文字，其位元組不是合法的 UTF-8',
    (w) => {
      w.spec = undefined
      w.rawFile = {
        bytes: big5Csv([['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證'], ['929-X2', '20-9A', '李美玲', 'A123456789']]),
        name: 'big5.csv',
      }
    },
  )
  const rawFiles: Record<string, () => { bytes: Uint8Array; name: string }> = {
    '一份內容是隨機二進位資料的檔案': () => ({ bytes: randomBinary(), name: 'random.bin' }),
    '一份副檔名是 .xlsx 但內容已損毀的檔案': () => ({ bytes: corruptedXlsx(), name: 'broken.xlsx' }),
    '一份副檔名是 .csv 但內容是隨機二進位資料的檔案': () => ({ bytes: randomBinary(), name: 'random.csv' }),
    '一份副檔名是 .xls、開頭為 D0 CF 11 E0 但內容被截斷的檔案': () => ({ bytes: truncatedXls(), name: 'cut.xls' }),
    '一份副檔名是 .csv 但內容含有 NUL 位元組的檔案': () => ({ bytes: nulCsv(), name: 'nul.csv' }),
    '一份有效但沒有任何儲存格內容的 .xls 檔': () => ({ bytes: emptyXls(), name: 'blank.xls' }),
    '一份0 位元組的 .xls 檔': () => ({ bytes: new Uint8Array(0), name: 'zero.xls' }),
    '一份0 位元組的 CSV 檔': () => ({ bytes: new Uint8Array(0), name: 'zero.csv' }),
    '一份只有 BOM、沒有任何其他內容的 CSV 檔': () => ({ bytes: utf8('', true), name: 'bom-only.csv' }),
  }
  for (const [pattern, make] of Object.entries(rawFiles)) {
    r.step(pattern, (w) => {
      w.spec = undefined
      w.rawFile = make()
    })
  }

  // ════ 預覽 ════
  for (const p of ['我預覽匯入這份檔案', '我預覽匯入這份匯出檔', '我預覽這份檔案後取消匯入']) {
    r.when(p, async (w) => {
      w.previewBefore = await listRecords()
      w.preview = await previewImport(currentFile(w).bytes)
      // 「放棄」＝不呼叫 commitImport；名單不變由後續「名單上有 N 筆資料」斷言
    })
  }

  // ════ 提交 ════
  const confirmWith = async (w: World, label: string) => {
    const mode = MODE_BY_LABEL[label]
    expect(mode, `未知的匯入選項：${label}`).toBeDefined()
    if (w.isUi) return importViaUi(w, label as '略過重複' | '照樣匯入')
    w.previewBefore = await listRecords()
    w.preview = await previewImport(currentFile(w).bytes)
    expectOk(w.preview, '預覽')
    w.importResult = await commitImport(w.preview.preview, mode!)
  }
  for (const p of ['我預覽並選擇「{any}」後確認匯入', '我預覽並選擇「{any}」後確認匯入這份匯出檔']) {
    r.when(p, async (w, label: string) => confirmWith(w, label))
  }
  r.when('我選擇「{any}」後確認匯入', async (w, label: string) => {
    const mode = MODE_BY_LABEL[label]
    expect(mode).toBeDefined()
    w.previewBefore = await listRecords()
    w.importResult = await commitImport(previewOf(w), mode!)
  })

  // ════ 預覽斷言 ════
  r.step('預覽顯示 {any}', (w, text: string) => {
    const p = previewOf(w)
    const found = [...text.matchAll(/(可新增|與既有資料重複|檔內重複|格式錯誤)\s*(\d+)\s*筆/g)]
    expect(found.length, `無法解析預覽筆數描述：${text}`).toBeGreaterThan(0)
    for (const [, label, n] of found) {
      expect(p.counts[COUNT_FIELD[label as keyof typeof COUNT_FIELD]], `預覽「${label}」筆數`).toBe(Number(n))
    }
    // 「格式錯誤的是檔案第 N 列，原因代碼為 "X"」
    const err = text.match(/格式錯誤的是檔案第\s*(\d+)\s*列，原因代碼為\s*"([^"]*)"/)
    if (err) {
      const row = rowAt(p, Number(err[1]))
      expect(row.category).toBe('FORMAT_ERROR')
      expect(row.error?.code).toBe(err[2])
    }
  })
  r.step('格式錯誤的是檔案第 {int} 列，原因代碼為 {string}', (w, fileRow: number, code: string) => {
    const p = previewOf(w)
    const row = rowAt(p, fileRow)
    expect(row.category).toBe('FORMAT_ERROR')
    expect(row.error?.code).toBe(code)
    expect(fileRowsOf(p, 'FORMAT_ERROR'), '格式錯誤的列只該有這一列').toEqual([fileRow])
  })
  r.step('可新增的是檔案第 {int} 列與第 {int} 列', (w, a: number, b: number) => {
    expect(fileRowsOf(previewOf(w), 'NEW')).toEqual([a, b])
  })
  r.step('可新增的是檔案第 {int} 列，與既有資料重複的是檔案第 {int} 列', (w, a: number, b: number) => {
    const p = previewOf(w)
    expect(fileRowsOf(p, 'NEW')).toEqual([a])
    expect(fileRowsOf(p, 'DUP_EXISTING')).toEqual([b])
  })
  r.step('與既有資料重複的是檔案第 {int} 列與第 {int} 列', (w, a: number, b: number) => {
    expect(fileRowsOf(previewOf(w), 'DUP_EXISTING')).toEqual([a, b])
  })
  r.step('與既有資料重複的是檔案第 {int} 列，重複種類為「{any}」，衝突的既有資料駕駛姓名為 {string}', (w, fileRow: number, kinds: string, name: string) => {
    const p = previewOf(w)
    expect(fileRowsOf(p, 'DUP_EXISTING')).toEqual([fileRow])
    const row = rowAt(p, fileRow)
    expect(row.kinds).toEqual(kindsOf(kinds))
    const conflicting = row.existingConflicts.flatMap((c) => c.records.map((x) => x.ownerName))
    expect(conflicting, '衝突的既有資料').toContain(name)
  })
  r.step('與既有資料重複的是檔案第 {int} 列，重複種類為「{any}」', (w, fileRow: number, kinds: string) => {
    const p = previewOf(w)
    expect(fileRowsOf(p, 'DUP_EXISTING')).toEqual([fileRow])
    expect(rowAt(p, fileRow).kinds).toEqual(kindsOf(kinds))
  })
  r.step('檔內重複的是檔案第 {int} 列，重複種類為「{any}」，與檔案第 {int} 列重複', (w, fileRow: number, kinds: string, other: number) => {
    const p = previewOf(w)
    expect(fileRowsOf(p, 'DUP_IN_FILE')).toEqual([fileRow])
    const row = rowAt(p, fileRow)
    expect(row.kinds).toEqual(kindsOf(kinds))
    expect(row.inFileConflicts.flatMap((c) => c.fileRows), '與檔內哪一列重複').toContain(other)
  })
  r.step(
    '第 {int} 列歸為與既有資料重複，第 {int} 列與第 {int} 列歸為可新增，第 {int} 列歸為檔內重複，第 {int} 列歸為格式錯誤',
    (w, dupExisting: number, new1: number, new2: number, dupInFile: number, formatError: number) => {
      const p = previewOf(w)
      expect(fileRowsOf(p, 'DUP_EXISTING')).toEqual([dupExisting])
      expect(fileRowsOf(p, 'NEW')).toEqual([new1, new2])
      expect(fileRowsOf(p, 'DUP_IN_FILE')).toEqual([dupInFile])
      expect(fileRowsOf(p, 'FORMAT_ERROR')).toEqual([formatError])
    },
  )
  r.step('預覽各類筆數相加為 {int}，等於檔案的資料列數', (w, total: number) => {
    const c = previewOf(w).counts
    expect(c.new + c.dupExisting + c.dupInFile + c.formatError).toBe(total)
    expect(c.total).toBe(total)
    expect(previewOf(w).rows).toHaveLength(total)
    // 每一列只屬於一類
    expect(new Set(previewOf(w).rows.map((x) => x.fileRow)).size).toBe(total)
  })
  r.step(
    '預覽另外單獨列出「整列相同」的列：檔案第 {int} 列（與既有資料整列相同）與第 {int} 列（與檔案第 {int} 列整列相同）',
    (w, a: number, b: number, c: number) => {
      const p = previewOf(w)
      expect(p.identicalRows).toEqual([a, b])
      expect(rowAt(p, a).identicalTo).toMatchObject({ source: 'EXISTING' })
      expect(rowAt(p, b).identicalTo).toEqual({ source: 'FILE', fileRow: c })
      expect(rowAt(p, a).kinds).toContain('IDENTICAL_ROW')
    },
  )
  // 「告知」是 UI 的事；資料層要保證的是：兩種選項真的都不會把這些列匯進去
  r.step('預覽告知整列相同的列不論選擇「略過重複」或「照樣匯入」都不會匯入', async (w) => {
    const p = previewOf(w)
    expect(p.identicalRows.length, '預覽應單獨列出整列相同的列').toBeGreaterThan(0)
    const snapshot = w.previewBefore ?? []
    for (const mode of ['SKIP_DUPLICATES', 'IMPORT_ALL'] as const) {
      await restore(snapshot)
      await commitImport(p, mode)
      const keys = (await listRecords()).map(tupleKey)
      expect(new Set(keys).size, `${mode}：名單不該出現四欄完全相同的兩筆`).toBe(keys.length)
    }
    await restore(snapshot)
  })
  r.step('檔案第 {int} 列只是同車頭車號，不在「整列相同」的列表中', (w, fileRow: number) => {
    const p = previewOf(w)
    expect(p.identicalRows).not.toContain(fileRow)
    const row = rowAt(p, fileRow)
    expect(row.kinds).toContain('SAME_HEAD')
    expect(row.kinds).not.toContain('IDENTICAL_ROW')
  })
  r.step('預覽中這筆的車頭車號是 {string}、車斗車號是 {string}', (w, h: string, t: string) => {
    const p = previewOf(w)
    expect(p.rows).toHaveLength(1)
    expect(p.rows[0]!.fields).toMatchObject({ headPlate: h, tailPlate: t })
  })
  r.step('預覽對檔案第 {int} 列顯示駕駛身分證格式警示', (w, fileRow: number) => {
    expect(rowAt(previewOf(w), fileRow).idWarning).toBeDefined()
  })
  r.step('預覽告知檔案內沒有可匯入的資料', (w) => {
    const p = previewOf(w)
    expect(p.counts.total).toBe(0)
    expect(p.rows).toHaveLength(0)
  })
  // UI 規則「沒有選項」在資料層以 counts.total === 0 表達（契約 §3.5）
  r.step('沒有可進行匯入的選項', (w) => {
    expect(previewOf(w).counts.total).toBe(0)
  })

  // ════ 檔案層級拒絕 ════
  const rejected = (code: 'EMPTY_FILE' | 'UNREADABLE') => (w: World) => {
    expect(w.preview, '尚未預覽').toBeDefined()
    expect(w.preview).toMatchObject({ ok: false, code })
  }
  r.step('預覽不接受這份檔案，並告知檔案是空的', rejected('EMPTY_FILE'))
  r.step('預覽不接受這份檔案，並告知檔案無法讀取', rejected('UNREADABLE'))
  r.step('預覽不接受這份檔案，並指出缺少欄位標題「{any}」', (w, title: string) => {
    expect(w.preview).toMatchObject({ ok: false, code: 'MISSING_HEADERS' })
    // 「A」、「B」…：多個標題時，missing 必須恰為這些（不多不少）
    const titles = title.split('」、「')
    const missing = (w.preview as { missing: string[] }).missing
    for (const t of titles) expect(missing).toContain(t)
    if (titles.length > 1) expect([...missing].sort()).toEqual([...titles].sort())
  })
  r.step('預覽提示請以「CSV UTF-8」格式另存後再匯入', (w) => {
    expect(w.preview).toMatchObject({ ok: false, code: 'UNREADABLE', hint: 'SAVE_AS_CSV_UTF8' })
  })
  r.step('預覽沒有列出任何亂碼的資料列', (w) => {
    expect(w.preview).toBeDefined()
    expect(w.preview!.ok).toBe(false)
    expect('preview' in w.preview!, '被拒絕的檔案不該帶任何預覽資料').toBe(false)
  })

  // ════ 結果 ════
  r.step('匯入結果顯示 {any}', (w, text: string) => {
    const res = w.importResult
    expect(res, '尚未確認匯入').toBeDefined()
    const num = (re: RegExp) => {
      const m = text.match(re)
      return m ? Number(m[1]) : undefined
    }
    const want = {
      imported: num(/已匯入\s*(\d+)\s*筆/),
      skipped: num(/略過\s*(\d+)\s*筆/),
      formatErrorsNotImported: num(/格式錯誤未匯入\s*(\d+)\s*筆/),
    }
    expect(Object.values(want).some((v) => v !== undefined), `無法解析匯入結果描述：${text}`).toBe(true)
    for (const [k, v] of Object.entries(want)) {
      if (v !== undefined) expect(res![k as keyof typeof want], `匯入結果的 ${k}`).toBe(v)
    }
    // 三個數字加總＝資料列數（契約 §3.5）
    expect(res!.imported + res!.skipped + res!.formatErrorsNotImported).toBe(previewOf(w).counts.total)
  })
}

