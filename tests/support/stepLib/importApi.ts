import { expect } from 'vitest'
import { injectImportWriteFault, previewImport, replaceAllFromImport } from '../../../src/data/importer'
import { createRecord, listRecords } from '../../../src/data/records'
import type { DuplicateKind, ImportPreview, PreviewRow, RowCategory } from '../../../src/data/types'
import { expectOk, fields, type World } from '../world'
import { emptyXls, emptyXlsx, big5Csv, corruptedXlsx, nulCsv, randomBinary, truncatedXls, type FileKind, type FileSpec } from '../workbook'
import { utf8 } from '../csvFixture'
import { expectCount } from './common'
import { currentFile, importViaUi } from './importFlow'
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

const KIND_BY_LABEL: Record<string, DuplicateKind> = {
  同車頭車號: 'SAME_HEAD',
  同車斗車號: 'SAME_TAIL',
  同駕駛身分證不同姓名: 'SAME_ID_DIFF_NAME',
}
/** 「同車頭車號、同車斗車號」→ ['SAME_HEAD','SAME_TAIL']（順序固定，契約 §3.5 kinds） */
const kindsOf = (label: string): DuplicateKind[] =>
  label.split('、').map((s) => {
    const k = KIND_BY_LABEL[s.trim()]
    if (!k) throw new Error(`未知的重複種類：${s}`)
    return k
  })

/** 預覽統計用語 → counts 欄位（四類，沒有別的） */
const COUNT_FIELD = { 可匯入: 'new', 檔內重複: 'dupInFile', 整列相同: 'identicalInFile', 格式錯誤: 'formatError' } as const

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
      // 「放棄」＝不呼叫 replaceAllFromImport；名單不變由後續「名單上有 N 筆資料」斷言
    })
  }

  // ════ 確認（含二次確認；@api 層二次確認＝直接呼叫 replaceAllFromImport）════
  /** 預覽並確認：@ui 走畫面（含二次確認框），@api 呼叫資料層 */
  const previewAndConfirm = async (w: World) => {
    if (w.isUi) return importViaUi(w)
    w.previewBefore = await listRecords()
    w.preview = await previewImport(currentFile(w).bytes)
    expectOk(w.preview, '預覽')
    w.replaceResult = await replaceAllFromImport(w.preview.preview)
    // 不在這裡斷言成功：寫入失敗的情境要接著檢查 WRITE_FAILED；成功與否由後續的 Then 步驟驗證
    if (w.replaceResult.ok) w.importResult = w.replaceResult.result
  }
  for (const p of ['我預覽並確認匯入', '我預覽並確認匯入這份匯出檔']) r.when(p, previewAndConfirm)

  r.when('我確認匯入並通過二次確認', async (w) => {
    w.previewBefore = await listRecords()
    w.replaceResult = await replaceAllFromImport(previewOf(w))
    expectOk(w.replaceResult, '替換')
    w.importResult = w.replaceResult.result
  })
  // 預期被拒絕的嘗試：不斷言成功
  r.when('我嘗試確認匯入', async (w) => {
    w.previewBefore = await listRecords()
    w.replaceResult = await replaceAllFromImport(previewOf(w))
  })
  r.step('確認被拒絕，原因是檔案含有格式錯誤列', (w) => {
    expect(w.replaceResult, '尚未嘗試確認').toBeDefined()
    expect(w.replaceResult).toEqual({ ok: false, reason: 'FORMAT_ERRORS' })
  })
  r.step('寫入名單的過程在第 {int} 筆之後發生錯誤', (_w, n: number) => {
    injectImportWriteFault(n)
  })
  r.step('匯入失敗並告知原因', (w) => {
    expect(w.replaceResult, '尚未確認匯入').toBeDefined()
    expect(w.replaceResult).toEqual({ ok: false, reason: 'WRITE_FAILED' })
  })
  r.step('我手動新增一筆資料：車頭車號 {string}、車斗車號 {string}、駕駛姓名 {string}、駕駛身分證 {string}', async (w, h, t, n, i) => {
    await w.freshDb()
    const res = await createRecord(fields(h, t, n, i))
    expect(res.ok, '手動新增').toBe(true)
  })

  // ════ 預覽斷言 ════
  r.step('預覽顯示 {any}', (w, text: string) => {
    const p = previewOf(w)
    const found = [...text.matchAll(/(可匯入|檔內重複|整列相同|格式錯誤)\s*(\d+)\s*筆/g)]
    expect(found.length, `無法解析預覽筆數描述：${text}`).toBeGreaterThan(0)
    for (const [, label, n] of found) {
      expect(p.counts[COUNT_FIELD[label as keyof typeof COUNT_FIELD]], `預覽「${label}」筆數`).toBe(Number(n))
    }
    // 「格式錯誤的是檔案第 N 列，原因代碼為 "X"」；「原因代碼為 "X"」（只有一個錯誤列時省略列號）
    const err = text.match(/格式錯誤的是檔案第\s*(\d+)\s*列，原因代碼為\s*"([^"]*)"/)
    if (err) {
      const row = rowAt(p, Number(err[1]))
      expect(row.category).toBe('FORMAT_ERROR')
      expect(row.error?.code).toBe(err[2])
    } else {
      const bare = text.match(/原因代碼為\s*"([^"]*)"/)
      if (bare) {
        const errors = p.rows.filter((x) => x.category === 'FORMAT_ERROR')
        expect(errors, '只該有一個格式錯誤列').toHaveLength(1)
        expect(errors[0]!.error?.code).toBe(bare[1])
      }
    }
  })
  r.step('預覽寫明 將刪除目前 {int} 筆、匯入 {int} 筆', (w, del: number, imp: number) => {
    const p = previewOf(w)
    expect(p.willDelete, '將刪除目前幾筆').toBe(del)
    expect(p.willImport, '將匯入幾筆').toBe(imp)
  })
  r.step('格式錯誤的是檔案第 {int} 列，原因代碼為 {string}', (w, fileRow: number, code: string) => {
    const p = previewOf(w)
    const row = rowAt(p, fileRow)
    expect(row.category).toBe('FORMAT_ERROR')
    expect(row.error?.code).toBe(code)
    expect(fileRowsOf(p, 'FORMAT_ERROR'), '格式錯誤的列只該有這一列').toEqual([fileRow])
  })
  r.step('可匯入的是檔案第 {int} 列與第 {int} 列', (w, a: number, b: number) => {
    expect(fileRowsOf(previewOf(w), 'NEW')).toEqual([a, b])
  })
  r.step('檔內重複的是檔案第 {int} 列，重複種類為「{any}」，與檔案第 {int} 列重複', (w, fileRow: number, kinds: string, other: number) => {
    const p = previewOf(w)
    expect(fileRowsOf(p, 'DUP_IN_FILE')).toEqual([fileRow])
    const row = rowAt(p, fileRow)
    expect(row.kinds).toEqual(kindsOf(kinds))
    expect(row.inFileConflicts.flatMap((c) => c.fileRows), '與檔內哪一列重複').toContain(other)
  })
  // 檔內重複的列「會匯入」：歸 DUP_IN_FILE 且計入 willImport，不在合併清單
  r.step('預覽表示檔案第 {int} 列仍會匯入並於名單標示', (w, fileRow: number) => {
    const p = previewOf(w)
    const row = rowAt(p, fileRow)
    expect(row.category).toBe('DUP_IN_FILE')
    expect(p.identicalRows).not.toContain(fileRow)
    expect(p.willImport, '將匯入 = 可匯入 + 檔內重複').toBe(p.counts.new + p.counts.dupInFile)
  })
  r.step(
    '第 {int} 列、第 {int} 列與第 {int} 列歸為可匯入，第 {int} 列歸為檔內重複，第 {int} 列歸為格式錯誤，第 {int} 列歸為整列相同',
    (w, new1: number, new2: number, new3: number, dupInFile: number, formatError: number, identical: number) => {
      const p = previewOf(w)
      expect(fileRowsOf(p, 'NEW')).toEqual([new1, new2, new3])
      expect(fileRowsOf(p, 'DUP_IN_FILE')).toEqual([dupInFile])
      expect(fileRowsOf(p, 'FORMAT_ERROR')).toEqual([formatError])
      expect(fileRowsOf(p, 'IDENTICAL_IN_FILE')).toEqual([identical])
    },
  )
  r.step('預覽各類筆數相加為 {int}，等於檔案的資料列數', (w, total: number) => {
    const c = previewOf(w).counts
    expect(c.new + c.dupInFile + c.identicalInFile + c.formatError).toBe(total)
    expect(c.total).toBe(total)
    expect(previewOf(w).rows).toHaveLength(total)
    // 每一列只屬於一類
    expect(new Set(previewOf(w).rows.map((x) => x.fileRow)).size).toBe(total)
  })
  r.step('預覽只有 可匯入、檔內重複、整列相同、格式錯誤 四個分類', (w) => {
    const p = previewOf(w)
    expect(Object.keys(p.counts).filter((k) => k !== 'total').sort()).toEqual(Object.values(COUNT_FIELD).sort())
    const allowed: RowCategory[] = ['NEW', 'DUP_IN_FILE', 'IDENTICAL_IN_FILE', 'FORMAT_ERROR']
    for (const row of p.rows) expect(allowed, `檔案第 ${row.fileRow} 列的分類`).toContain(row.category)
  })
  r.step('預覽告知整份檔案不會匯入，且不可確認匯入', async (w) => {
    const p = previewOf(w)
    expect(p.counts.formatError).toBeGreaterThan(0)
    expect(p.canConfirm).toBe(false)
    // 真的拒絕：嘗試確認也不會替換
    expect(await replaceAllFromImport(p)).toEqual({ ok: false, reason: 'FORMAT_ERRORS' })
    expect(await listRecords(), '被擋下的預覽不該動到名單').toEqual(w.previewBefore)
  })
  r.step('預覽單獨列出「整列相同」的列：檔案第 {int} 列，與檔案第 {int} 列整列相同', (w, a: number, c: number) => {
    const p = previewOf(w)
    expect(p.identicalRows).toEqual([a])
    expect(rowAt(p, a).category).toBe('IDENTICAL_IN_FILE')
    expect(rowAt(p, a).identicalTo).toEqual({ fileRow: c })
  })
  r.step('預覽告知整列相同的列將合併為一筆，只保留檔案第 {int} 列', (w, keep: number) => {
    const p = previewOf(w)
    expect(p.merged, '合併筆數').toBe(p.identicalRows.length)
    expect(rowAt(p, keep).category, '保留的是第一次出現者').not.toBe('IDENTICAL_IN_FILE')
    for (const n of p.identicalRows) expect(rowAt(p, n).identicalTo).toEqual({ fileRow: keep })
    expect(p.willImport, '合併的列不計入將匯入').toBe(p.counts.total - p.counts.formatError - p.merged)
  })
  r.step('檔案第 {int} 列只是同車頭車號，歸為檔內重複，不在「整列相同」的列表中', (w, fileRow: number) => {
    const p = previewOf(w)
    expect(p.identicalRows).not.toContain(fileRow)
    const row = rowAt(p, fileRow)
    expect(row.category).toBe('DUP_IN_FILE')
    expect(row.kinds).toContain('SAME_HEAD')
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
  // 「不可確認」在資料層以 canConfirm 與 replaceAllFromImport 的拒絕表達（契約 §3.5）
  r.step('不可確認匯入', async (w) => {
    const p = previewOf(w)
    expect(p.canConfirm).toBe(false)
    expect(await replaceAllFromImport(p)).toMatchObject({ ok: false })
  })
  r.step('不可確認匯入，沒有「將刪除」的提示', async (w) => {
    const p = previewOf(w)
    expect(p.counts.total).toBe(0)
    expect(p.canConfirm).toBe(false)
    expect(await replaceAllFromImport(p)).toEqual({ ok: false, reason: 'NOTHING_TO_IMPORT' })
    expect(await listRecords(), '空預覽不該清掉名單').toEqual(w.previewBefore)
  })
  // 資料層沒有「處理重複」的參數：replaceAllFromImport 只吃預覽；畫面上沒有選項由元件測試驗證（tests/ui/importView.test.tsx）
  r.step('預覽可進行的操作只有「確認匯入」與「取消」', (w) => {
    expect(replaceAllFromImport.length, '整份替換只接受預覽，沒有任何模式參數').toBe(1)
    expect(previewOf(w).canConfirm).toBe(true)
  })
  r.step('預覽沒有任何讓我選擇如何處理重複列的選項', (w) => {
    const p = previewOf(w)
    expect(p.counts.dupInFile + p.counts.identicalInFile, '情境應含重複列，否則本斷言沒有意義').toBeGreaterThan(0)
    expect(Object.keys(p).sort()).toEqual(['canConfirm', 'counts', 'identicalRows', 'merged', 'rows', 'willDelete', 'willImport'])
  })

  // ════ 名單不變／內容 ════
  const sameAsBefore = async (w: World, n: number) => {
    expect(w.previewBefore, '情境沒有記錄操作前的名單').toBeDefined()
    const now = await listRecords()
    expect(now, `名單筆數`).toHaveLength(n)
    expect(now, '名單內容（含 id）應與操作前完全相同').toEqual(w.previewBefore)
  }
  for (const p of ['名單上仍有 {int} 筆資料，與預覽前完全相同', '名單上仍有 {int} 筆資料，與匯入前完全相同']) {
    r.step(p, async (w, n: number) => sameAsBefore(w, n))
  }
  r.step('名單上仍有 {int} 筆資料，駕駛姓名為 {string}', async (_w, n: number, name: string) => {
    const now = await listRecords()
    expect(now).toHaveLength(n)
    expect(now.map((x) => x.ownerName)).toEqual([name])
  })
  r.step('名單上有 {int} 筆資料，駕駛姓名為 {string}', async (w, n: number, name: string) => {
    await expectCount(w, n)
    expect((await listRecords()).map((x) => x.ownerName)).toEqual([name])
  })
  r.step('名單上有 {int} 筆資料，且沒有駕駛姓名 {string} 的資料', async (w, n: number, name: string) => {
    await expectCount(w, n)
    expect((await listRecords()).filter((x) => x.ownerName === name)).toHaveLength(0)
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
      deleted: num(/已刪除\s*(\d+)\s*筆/),
      imported: num(/已匯入\s*(\d+)\s*筆/),
      merged: num(/合併\s*(\d+)\s*筆/),
    }
    expect(want.deleted !== undefined && want.imported !== undefined, `無法解析匯入結果描述：${text}`).toBe(true)
    // 描述沒有「合併」時，代表沒有整列相同被合併
    expect(res, '匯入結果').toEqual({ deleted: want.deleted, imported: want.imported, merged: want.merged ?? 0 })
  })
}
