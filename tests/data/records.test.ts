import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDbForTest, getDb, resetDbForTest } from '../../src/data/db'
import { createRecord, deleteAllRecords, listRecords, updateRecord } from '../../src/data/records'
import type { RecordFields } from '../../src/data/types'

// 讓測試能「騙過」記憶體內的整列相同檢查，逼出 IndexedDB 複合 unique 的 ConstraintError 路徑
const identicalSpy = vi.hoisted(() => ({ skipNext: 0 }))
vi.mock('../../src/data/duplicates', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../src/data/duplicates')>()
  return {
    ...orig,
    findIdenticalRow: (...args: Parameters<typeof orig.findIdenticalRow>) => {
      if (identicalSpy.skipNext > 0) {
        identicalSpy.skipNext--
        return undefined
      }
      return orig.findIdenticalRow(...args)
    },
  }
})

const f = (headPlate: string, tailPlate: string, ownerName: string, idNumber = 'A123456789'): RecordFields => ({
  headPlate, tailPlate, ownerName, idNumber,
})

const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => unhandled.push(reason)

beforeEach(async () => {
  unhandled.length = 0
  identicalSpy.skipNext = 0
  process.on('unhandledRejection', onUnhandled)
  await resetDbForTest()
})
afterEach(() => {
  process.off('unhandledRejection', onUnhandled)
})

describe('IndexedDB ConstraintError（契約 §3.4 注意 2）', () => {
  it('新增：複合 unique 擋下時轉成 IDENTICAL_ROW，資料不變，且不產生 unhandled rejection', async () => {
    const first = await createRecord(f('929-X2', '20-9A', '王小明'))
    if (!first.ok) throw new Error('第一筆應成功')

    identicalSpy.skipNext = 1 // 讓第一道檢查放行 → add 觸發 ConstraintError
    const second = await createRecord(f('929-X2', '20-9A', '王小明'))

    expect(second).toEqual({ ok: false, reason: 'IDENTICAL_ROW', existing: first.record })
    expect(await listRecords()).toEqual([first.record])
    await new Promise((r) => setTimeout(r, 20)) // 讓 microtask／macrotask 排空，unhandled 事件才會觸發
    expect(unhandled).toEqual([])
  })

  it('編輯：改成與另一筆整列相同而觸發 ConstraintError 時，同樣轉成 IDENTICAL_ROW、原資料不變', async () => {
    const a = await createRecord(f('929-X2', '20-9A', '王小明'))
    const b = await createRecord(f('KLP-7988', 'OL-02', '李美玲', 'F131104093'))
    if (!a.ok || !b.ok) throw new Error('前置資料應成功')

    identicalSpy.skipNext = 1
    const r = await updateRecord(b.record.id, f('929-X2', '20-9A', '王小明'))

    expect(r).toEqual({ ok: false, reason: 'IDENTICAL_ROW', existing: a.record })
    expect(await listRecords()).toEqual([a.record, b.record])
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(unhandled).toEqual([])
  })

  it('ConstraintError 之後資料庫仍可正常寫入（交易中止不留下壞狀態）', async () => {
    await createRecord(f('929-X2', '20-9A', '王小明'))
    identicalSpy.skipNext = 1
    await createRecord(f('929-X2', '20-9A', '王小明'))
    const ok = await createRecord(f('KLP-7988', 'OL-02', '李美玲', 'F131104093'))
    expect(ok.ok).toBe(true)
    expect((await listRecords()).map((r) => r.ownerName)).toEqual(['王小明', '李美玲'])
  })
})

describe('db 生命週期（契約 §3.4 注意 3）', () => {
  it('資料庫仍開著時 resetDbForTest 不會卡在 blocked，且重置後是全新的空資料庫', async () => {
    await createRecord(f('929-X2', '20-9A', '王小明'))
    await getDb()
    await resetDbForTest()
    expect(await listRecords()).toEqual([])
  })

  it('closeDbForTest 只關連線、不刪資料；重新開啟後資料仍在，id 不重用', async () => {
    const a = await createRecord(f('929-X2', '20-9A', '王小明'))
    if (!a.ok) throw new Error('應成功')
    await closeDbForTest()
    expect(await listRecords()).toEqual([a.record])
    await deleteAllRecords()
    const b = await createRecord(f('KLP-7988', 'OL-02', '李美玲', 'F131104093'))
    if (!b.ok) throw new Error('應成功')
    expect(b.record.id).toBeGreaterThan(a.record.id) // autoIncrement 不重用、clear 不重置
  })
})
