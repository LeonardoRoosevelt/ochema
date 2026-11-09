import { beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTest } from '../../src/data/db'
import { buildPreview, commitImport, previewImport } from '../../src/data/importer'
import { createRecord, listRecords } from '../../src/data/records'
import type { RawRow, RecordFields, VehicleRecord } from '../../src/data/types'

const f = (headPlate: string, tailPlate: string, ownerName: string, idNumber = 'A123456789'): RecordFields => ({
  headPlate, tailPlate, ownerName, idNumber,
})
const raw = (fileRow: number, fields: RecordFields): RawRow => ({ fileRow, cells: fields })
const rec = (id: number, fields: RecordFields): VehicleRecord => ({ id, ...fields })

describe('buildPreview：格式錯誤列不參與比對（契約 §3.5 分類演算法第 1 點）', () => {
  it('格式錯誤的列不當「較前面的列」：後面同車頭的有效列仍是 NEW', () => {
    const p = buildPreview(
      [raw(2, f('929-X2', 'bad-tail', '王小明')), raw(3, f('929-X2', '20-9A', '李美玲', 'F131104093'))],
      [],
    )
    expect(p.rows.map((r) => r.category)).toEqual(['FORMAT_ERROR', 'NEW'])
    expect(p.rows[1]!.kinds).toEqual([])
    expect(p.counts).toEqual({ total: 2, new: 1, dupExisting: 0, dupInFile: 0, formatError: 1 })
  })

  it('格式錯誤列與後面的列四欄相同，也不算整列相同（不會被兩種選項都排除）', () => {
    const bad = f('929-X2', '20-9a', '王小明')
    const p = buildPreview([raw(2, bad), raw(3, bad)], [])
    expect(p.rows.map((r) => r.category)).toEqual(['FORMAT_ERROR', 'FORMAT_ERROR'])
    expect(p.identicalRows).toEqual([])
  })

  it('格式錯誤列不計算身分證警示與重複種類，error 取第一個不合的欄位', () => {
    const p = buildPreview([raw(2, f('929X2', 'bad', '王小明', 'xx'))], [rec(1, f('929X2', 'bad', 'A', 'xx'))])
    const row = p.rows[0]!
    expect(row.category).toBe('FORMAT_ERROR')
    expect(row.error).toEqual({ field: 'headPlate', code: 'PLATE_NO_HYPHEN' })
    expect(row.idWarning).toBeUndefined()
    expect(row.kinds).toEqual([])
  })
})

describe('buildPreview：kinds 固定順序 IDENTICAL_ROW, SAME_HEAD, SAME_TAIL, SAME_ID_DIFF_NAME', () => {
  it('與不同的既有資料分別撞車頭、車尾、身分證時，順序不受既有資料順序影響', () => {
    const existing = [
      rec(1, f('X-1', 'T-1', '甲', 'F131104093')), // 撞身分證（異名）
      rec(2, f('H-1', 'X-2', '乙', 'A800000014')), // 撞車尾
      rec(3, f('H-9', 'T-9', '丙', 'B900000017')),
    ]
    const p = buildPreview([raw(2, f('H-9', 'X-2', '丁', 'F131104093'))], existing)
    expect(p.rows[0]!.category).toBe('DUP_EXISTING')
    expect(p.rows[0]!.kinds).toEqual(['SAME_HEAD', 'SAME_TAIL', 'SAME_ID_DIFF_NAME'])
  })

  it('整列相同時含 IDENTICAL_ROW、SAME_HEAD、SAME_TAIL（順序固定），且 identicalTo 指向既有', () => {
    const same = f('929-X2', '20-9A', '王小明')
    const p = buildPreview([raw(2, same)], [rec(7, same)])
    expect(p.rows[0]!.kinds).toEqual(['IDENTICAL_ROW', 'SAME_HEAD', 'SAME_TAIL'])
    expect(p.rows[0]!.identicalTo).toEqual({ source: 'EXISTING', recordId: 7 })
    expect(p.identicalRows).toEqual([2])
  })

  it('檔內整列相同：DUP_IN_FILE，identicalTo 指向檔內較前面的列', () => {
    const same = f('929-X2', '20-9A', '王小明')
    const p = buildPreview([raw(2, same), raw(5, same)], [])
    expect(p.rows.map((r) => r.category)).toEqual(['NEW', 'DUP_IN_FILE'])
    expect(p.rows[1]!.kinds).toEqual(['IDENTICAL_ROW', 'SAME_HEAD', 'SAME_TAIL'])
    expect(p.rows[1]!.identicalTo).toEqual({ source: 'FILE', fileRow: 2 })
  })
})

describe('commitImport', () => {
  beforeEach(async () => {
    await resetDbForTest()
  })

  const csv = (...lines: string[]) => new TextEncoder().encode(['車頭,車尾,姓名,身分證', ...lines].join('\r\n') + '\r\n')

  it('預覽後名單已變：提交時以目前名單重算，新出現的整列相同不會被匯入', async () => {
    const p = await previewImport(csv('929-X2,20-9A,王小明,A123456789', 'KLP-7988,OL-02,李美玲,F131104093'))
    if (!p.ok) throw new Error('預覽失敗')
    expect(p.preview.counts.new).toBe(2)
    await createRecord(f('929-X2', '20-9A', '王小明')) // 預覽之後才有人新增了同一列
    const result = await commitImport(p.preview, 'IMPORT_ALL')
    expect(result).toEqual({ imported: 1, skipped: 1, formatErrorsNotImported: 0 })
    expect((await listRecords()).map((r) => r.ownerName)).toEqual(['王小明', '李美玲'])
  })

  it('imported + skipped + formatErrorsNotImported = total，且新增列的 id 順序＝檔案列序', async () => {
    const p = await previewImport(
      csv('A-1,B-1,甲,A123456789', 'bad,B-2,乙,A123456789', 'A-3,B-3,丙,F131104093', 'A-1,B-1,甲,A123456789'),
    )
    if (!p.ok) throw new Error('預覽失敗')
    const r = await commitImport(p.preview, 'SKIP_DUPLICATES')
    expect(r).toEqual({ imported: 2, skipped: 1, formatErrorsNotImported: 1 })
    expect(r.imported + r.skipped + r.formatErrorsNotImported).toBe(p.preview.counts.total)
    const all = await listRecords()
    expect(all.map((x) => x.ownerName)).toEqual(['甲', '丙'])
    expect(all[0]!.id).toBeLessThan(all[1]!.id)
  })
})
