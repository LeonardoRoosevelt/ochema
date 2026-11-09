import { beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTest } from '../../src/data/db'
import { buildPreview, injectImportWriteFault, previewImport, replaceAllFromImport } from '../../src/data/importer'
import { createRecord, listRecords } from '../../src/data/records'
import type { RawRow, RecordFields } from '../../src/data/types'

const f = (headPlate: string, tailPlate: string, ownerName: string, idNumber = 'A123456789'): RecordFields => ({
  headPlate, tailPlate, ownerName, idNumber,
})
const raw = (fileRow: number, fields: RecordFields): RawRow => ({ fileRow, cells: fields })
const csv = (...lines: string[]) => new TextEncoder().encode(['車頭車號,車斗車號,駕駛姓名,駕駛身分證', ...lines].join('\r\n') + '\r\n')

describe('buildPreview：分類優先序 FORMAT_ERROR > IDENTICAL_IN_FILE > DUP_IN_FILE > NEW（契約 §3.5）', () => {
  it('格式錯誤的列不當「較前面的列」：後面同車頭車號的有效列仍是 NEW', () => {
    const p = buildPreview(
      [raw(2, f('929-X2', 'bad-tail', '王小明')), raw(3, f('929-X2', '20-9A', '李美玲', 'F131104093'))],
      0,
    )
    expect(p.rows.map((r) => r.category)).toEqual(['FORMAT_ERROR', 'NEW'])
    expect(p.rows[1]!.kinds).toEqual([])
    expect(p.counts).toEqual({ total: 2, new: 1, dupInFile: 0, identicalInFile: 0, formatError: 1 })
  })

  it('格式錯誤列與後面的列四欄相同，兩列都是格式錯誤，不會被當成整列相同合併', () => {
    const bad = f('929-X2', '20-9a', '王小明')
    const p = buildPreview([raw(2, bad), raw(3, bad)], 0)
    expect(p.rows.map((r) => r.category)).toEqual(['FORMAT_ERROR', 'FORMAT_ERROR'])
    expect(p.identicalRows).toEqual([])
    expect(p.merged).toBe(0)
  })

  it('格式錯誤列不計算駕駛身分證警示與重複種類，error 取第一個不合的欄位', () => {
    const p = buildPreview([raw(2, f('929X2', 'bad', '王小明', 'xx'))], 0)
    const row = p.rows[0]!
    expect(row.category).toBe('FORMAT_ERROR')
    expect(row.error).toEqual({ field: 'headPlate', code: 'PLATE_NO_HYPHEN' })
    expect(row.idWarning).toBeUndefined()
    expect(row.kinds).toEqual([])
  })

  it('整列相同優先於檔內重複，且不計入檔內重複；identicalTo 指向最早出現者', () => {
    const same = f('929-X2', '20-9A', '王小明')
    const p = buildPreview([raw(2, same), raw(5, same), raw(9, same)], 0)
    expect(p.rows.map((r) => r.category)).toEqual(['NEW', 'IDENTICAL_IN_FILE', 'IDENTICAL_IN_FILE'])
    expect(p.rows[1]!.identicalTo).toEqual({ fileRow: 2 })
    expect(p.rows[2]!.identicalTo).toEqual({ fileRow: 2 })
    expect(p.rows[1]!.kinds).toEqual([])
    expect(p.counts).toEqual({ total: 3, new: 1, dupInFile: 0, identicalInFile: 2, formatError: 0 })
    expect(p.identicalRows).toEqual([5, 9])
    expect(p.merged).toBe(2)
    expect(p.willImport).toBe(1)
  })

  it('連鎖：第 3 列是檔內重複（同車頭車號）、第 4 列與第 3 列整列相同 → 第 4 列歸整列相同並合併', () => {
    const p = buildPreview(
      [raw(2, f('929-X2', '20-9A', '王小明')), raw(3, f('929-X2', '30-1B', '李美玲', 'F131104093')), raw(4, f('929-X2', '30-1B', '李美玲', 'F131104093'))],
      0,
    )
    expect(p.rows.map((r) => r.category)).toEqual(['NEW', 'DUP_IN_FILE', 'IDENTICAL_IN_FILE'])
    expect(p.rows[2]!.identicalTo).toEqual({ fileRow: 3 })
    expect(p.counts.new + p.counts.dupInFile + p.counts.identicalInFile + p.counts.formatError).toBe(p.counts.total)
  })

  it('kinds 固定順序 SAME_HEAD, SAME_TAIL, SAME_ID_DIFF_NAME，不受檔內較前面列的順序影響', () => {
    const p = buildPreview(
      [
        raw(2, f('X-1', 'T-1', '甲', 'F131104093')), // 撞駕駛身分證（異名）
        raw(3, f('H-1', 'X-2', '乙', 'A800000014')), // 撞車斗車號
        raw(4, f('H-9', 'T-9', '丙', 'B900000017')),
        raw(5, f('H-9', 'X-2', '丁', 'F131104093')),
      ],
      0,
    )
    expect(p.rows[3]!.category).toBe('DUP_IN_FILE')
    expect(p.rows[3]!.kinds).toEqual(['SAME_HEAD', 'SAME_TAIL', 'SAME_ID_DIFF_NAME'])
  })

  it('同一人多車（同身分證同姓名）不算重複', () => {
    const p = buildPreview([raw(2, f('A-1', 'B-1', '王')), raw(3, f('A-2', 'B-2', '王'))], 0)
    expect(p.rows.map((r) => r.category)).toEqual(['NEW', 'NEW'])
  })
})

describe('buildPreview：將刪除／將匯入／合併／可否確認', () => {
  it('willDelete＝傳入的目前筆數；willImport＝可匯入＋檔內重複；整列相同不計入', () => {
    const p = buildPreview(
      [raw(2, f('A-1', 'B-1', '甲')), raw(3, f('A-1', 'B-2', '乙', 'F131104093')), raw(4, f('A-1', 'B-1', '甲'))],
      7,
    )
    expect(p.willDelete).toBe(7)
    expect(p.willImport).toBe(2)
    expect(p.merged).toBe(1)
    expect(p.canConfirm).toBe(true)
  })

  it('只要有一列格式錯誤就不可確認；沒有資料列也不可確認', () => {
    expect(buildPreview([raw(2, f('A-1', 'B-1', '甲')), raw(3, f('bad', 'B-1', '乙'))], 1).canConfirm).toBe(false)
    const empty = buildPreview([], 3)
    expect(empty.counts.total).toBe(0)
    expect(empty.canConfirm).toBe(false)
  })

  it('駕駛身分證不合格只警示，類別不變、仍可確認', () => {
    const p = buildPreview([raw(2, f('A-1', 'B-1', '甲', 'A123456780'))], 0)
    expect(p.rows[0]!.category).toBe('NEW')
    expect(p.rows[0]!.idWarning).toBeDefined()
    expect(p.canConfirm).toBe(true)
  })
})

describe('replaceAllFromImport', () => {
  beforeEach(async () => {
    await resetDbForTest()
    injectImportWriteFault(undefined)
  })

  const must = async (bytes: Uint8Array) => {
    const p = await previewImport(bytes)
    if (!p.ok) throw new Error('預覽應成功')
    return p.preview
  }

  it('清掉既有資料，依檔案順序寫入；id 順序＝檔案列序；回報已刪除／已匯入／合併', async () => {
    await createRecord(f('OLD-1', 'OLD-2', '舊甲'))
    await createRecord(f('OLD-3', 'OLD-4', '舊乙', 'F131104093'))
    const p = await must(csv('A-1,B-1,甲,A123456789', 'A-3,B-3,丙,F131104093', 'A-1,B-1,甲,A123456789', 'A-4,B-4,丁,B900000017'))
    expect(p.willDelete).toBe(2)
    const r = await replaceAllFromImport(p)
    expect(r).toEqual({ ok: true, result: { deleted: 2, imported: 3, merged: 1 } })
    const all = await listRecords()
    expect(all.map((x) => x.ownerName)).toEqual(['甲', '丙', '丁'])
    expect(all.every((x, i) => i === 0 || x.id > all[i - 1]!.id)).toBe(true)
  })

  it('deleted 以交易內實際筆數為準（預覽之後名單又變了）', async () => {
    const p = await must(csv('A-1,B-1,甲,A123456789'))
    await createRecord(f('NEW-1', 'NEW-2', '預覽後才有'))
    const r = await replaceAllFromImport(p)
    expect(r).toEqual({ ok: true, result: { deleted: 1, imported: 1, merged: 0 } })
    expect((await listRecords()).map((x) => x.ownerName)).toEqual(['甲'])
  })

  it('檔內重複（非整列相同）照樣寫入', async () => {
    const p = await must(csv('A-1,B-1,甲,A123456789', 'A-1,B-2,乙,F131104093'))
    expect(await replaceAllFromImport(p)).toMatchObject({ ok: true, result: { imported: 2 } })
    expect(await listRecords()).toHaveLength(2)
  })

  it('有格式錯誤列：拒絕（FORMAT_ERRORS），名單原封不動', async () => {
    await createRecord(f('OLD-1', 'OLD-2', '舊甲'))
    const before = await listRecords()
    const p = await must(csv('A-1,B-1,甲,A123456789', 'bad,B-2,乙,A123456789'))
    expect(await replaceAllFromImport(p)).toEqual({ ok: false, reason: 'FORMAT_ERRORS' })
    expect(await listRecords()).toEqual(before)
  })

  it('沒有資料列：拒絕（NOTHING_TO_IMPORT），不會把名單清空', async () => {
    await createRecord(f('OLD-1', 'OLD-2', '舊甲'))
    const before = await listRecords()
    const p = await must(csv())
    expect(await replaceAllFromImport(p)).toEqual({ ok: false, reason: 'NOTHING_TO_IMPORT' })
    expect(await listRecords()).toEqual(before)
  })

  it('單一交易：寫入第 1 筆之後失敗 → WRITE_FAILED，clear 也一併回滾', async () => {
    await createRecord(f('OLD-1', 'OLD-2', '舊甲'))
    await createRecord(f('OLD-3', 'OLD-4', '舊乙', 'F131104093'))
    const before = await listRecords()
    const p = await must(csv('A-1,B-1,甲,A123456789', 'A-3,B-3,丙,F131104093', 'A-4,B-4,丁,B900000017'))
    injectImportWriteFault(1)
    expect(await replaceAllFromImport(p)).toEqual({ ok: false, reason: 'WRITE_FAILED' })
    expect(await listRecords(), '名單（含 id）應與失敗前完全相同').toEqual(before)
  })

  it('注入的失敗是一次性的：下一次替換正常成功', async () => {
    const p = await must(csv('A-1,B-1,甲,A123456789'))
    injectImportWriteFault(1)
    expect(await replaceAllFromImport(p)).toMatchObject({ ok: false, reason: 'WRITE_FAILED' })
    expect(await replaceAllFromImport(p)).toMatchObject({ ok: true })
    expect(await listRecords()).toHaveLength(1)
  })

  it('空名單匯入：deleted 為 0', async () => {
    const p = await must(csv('A-1,B-1,甲,A123456789'))
    expect(await replaceAllFromImport(p)).toEqual({ ok: true, result: { deleted: 0, imported: 1, merged: 0 } })
  })
})
