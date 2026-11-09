/**
 * QA（API 測試員）：records 層的 Unicode／超長資料往返、並行寫入、查詢邊界。
 * 依據 docs/data-contract.md §2（trim 後原樣 === 比對）、§3.2–3.4。
 * 標 [特性紀錄] 的測試只記錄實際行為（契約沒規定），不代表核可。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDbForTest } from '../../src/data/db'
import { detectDuplicates } from '../../src/data/duplicates'
import { previewImport, replaceAllFromImport } from '../../src/data/importer'
import { createRecord, deleteAllRecords, deleteRecord, listRecords, updateRecord } from '../../src/data/records'
import { filterRecords } from '../../src/data/search'
import type { RecordFields, SaveResult, VehicleRecord } from '../../src/data/types'
import { utf8 } from '../support/csvFixture'

const f = (headPlate: string, tailPlate: string, ownerName: string, idNumber = 'A123456789'): RecordFields => ({
  headPlate, tailPlate, ownerName, idNumber,
})

const unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => unhandled.push(reason)
const settle = () => new Promise((r) => setTimeout(r, 30)) // 讓 unhandledRejection 有機會觸發

beforeEach(async () => {
  unhandled.length = 0
  process.on('unhandledRejection', onUnhandled)
  await resetDbForTest()
})
afterEach(() => {
  process.off('unhandledRejection', onUnhandled)
})

const must = (r: SaveResult): VehicleRecord => {
  if (!r.ok) throw new Error(`預期成功，實際 ${r.reason}`)
  return r.record
}

describe('Unicode／超長資料的存取往返', () => {
  const names = [
    '王小明',
    '王小明', // 全形英數：Ａ（U+FF21）
    'José', // 預組 é
    'Jose\u0301', // 組合字 e + U+0301（與上一個視覺相同、位元組不同）
    '😀🚗',
    '👨\u200D👩\u200D👧\u200D👦', // ZWJ 家庭 emoji
    '王\u200B小\u200C明', // 零寬空格／不連字
    '王\u00A0小明', // 內部 NBSP 保留
    '=1+1', '+SUM(A1)', '@cmd', "'; DROP TABLE vehicle_records; --", '<script>alert(1)</script>',
    'a,"b"\r\nc', // 逗號、引號、換行
  ]

  it('駕駛姓名原樣存入、原樣讀回（不 trim 內部、不正規化 NFC/NFD、不轉義）', async () => {
    const saved: VehicleRecord[] = []
    for (const [i, n] of names.entries()) saved.push(must(await createRecord(f(`H${i}-1`, `T${i}-1`, n))))
    const listed = await listRecords()
    expect(listed.map((r) => r.ownerName)).toEqual(names)
    expect(listed).toEqual(saved)
  })

  it('駕駛姓名邊緣的 NBSP／全形空白／換行被 trim，內部保留', async () => {
    const r = must(await createRecord(f('A-1', 'B-2', '\u00A0\u3000\n王\u00A0小明\t ')))
    expect(r.ownerName).toBe('王\u00A0小明')
  })

  it('NFC 與 NFD 寫法的同一駕駛姓名視為不同值：不是整列相同，也不觸發 SAME_ID_DIFF_NAME 以外的合併（契約 §2：原樣 ===，不正規化）', async () => {
    must(await createRecord(f('A-1', 'B-1', 'Jos\u00E9')))
    const r = await createRecord(f('A-1', 'B-1', 'Jose\u0301'))
    expect(r.ok).toBe(true) // 整列「看起來」相同但位元組不同 → 可存
    const report = detectDuplicates(await listRecords())
    expect(report.groups.map((g) => g.kind).sort()).toEqual(['SAME_HEAD', 'SAME_ID_DIFF_NAME', 'SAME_TAIL'])
  })

  it('零寬字元讓駕駛姓名不同：不算整列相同', async () => {
    must(await createRecord(f('A-1', 'B-1', '王小明')))
    expect((await createRecord(f('A-1', 'B-1', '王\u200B小明'))).ok).toBe(true)
  })

  it('超長駕駛姓名（10 萬字元）與 emoji 重複 2 萬次可存可讀，內容不被截斷', async () => {
    const longName = '王'.repeat(100_000)
    const emoji = '😀'.repeat(20_000)
    const a = must(await createRecord(f('A-1', 'B-1', longName)))
    const b = must(await createRecord(f('A-2', 'B-2', emoji)))
    const listed = await listRecords()
    expect(listed[0].ownerName.length).toBe(100_000)
    expect(listed[1].ownerName).toBe(emoji)
    expect([listed[0].id, listed[1].id]).toEqual([a.id, b.id])
  })

  it('超長車牌（2 萬字元，契約無長度上限）可存', async () => {
    const head = 'A'.repeat(10_000) + '-' + '1'.repeat(10_000)
    expect(must(await createRecord(f(head, 'B-1', '王'))).headPlate).toBe(head)
  })

  it('SQL／HTML 注入字串只是普通字串：駕駛姓名原樣存取，查詢不受影響', async () => {
    must(await createRecord(f('A-1', 'B-1', "'; DROP TABLE vehicle_records; --")))
    must(await createRecord(f('A-2', 'B-2', '<img src=x onerror=alert(1)>')))
    expect(await listRecords()).toHaveLength(2)
    expect(filterRecords(await listRecords(), 'DROP TABLE')).toHaveLength(1)
  })

  it('以全形／NFD 寫成的車牌被擋下（不自動轉換），資料庫不留下任何東西', async () => {
    for (const head of ['Ａ-1', 'A－1', 'a-1', 'A\u0301-1', '😀-1']) {
      const r = await createRecord(f(head, 'B-1', '王'))
      expect(r.ok, head).toBe(false)
    }
    expect(await listRecords()).toEqual([])
  })
})

describe('查詢 filterRecords 邊界', () => {
  const list = (): VehicleRecord[] => [
    { id: 1, headPlate: '929-X2', tailPlate: '20-9A', ownerName: 'Ａlice', idNumber: 'A123456789' },
    { id: 2, headPlate: 'ABC-1', tailPlate: 'DEF-2', ownerName: '王小明😀', idNumber: 'F131104093' },
  ]

  it('不分大小寫；全形字母不等於半形（只做 toLowerCase，不做寬度轉換）', () => {
    expect(filterRecords(list(), 'abc-1').map((r) => r.id)).toEqual([2])
    expect(filterRecords(list(), 'a123456789').map((r) => r.id)).toEqual([1])
    expect(filterRecords(list(), 'alice').map((r) => r.id)).toEqual([]) // 駕駛姓名是全形 Ａ
    expect(filterRecords(list(), 'ａlice').map((r) => r.id)).toEqual([1]) // 全形小寫 ａ
  })

  it('正規表達式特殊字元是字面字串，不會丟錯也不會全部符合', () => {
    for (const k of ['.*', '(', '[', '\\', '^$', '+', '?', '|', '{1}']) {
      expect(() => filterRecords(list(), k), k).not.toThrow()
      expect(filterRecords(list(), k), k).toEqual([])
    }
  })

  it('emoji 與零寬字元關鍵字', () => {
    expect(filterRecords(list(), '😀').map((r) => r.id)).toEqual([2])
    expect(filterRecords(list(), '\u200B')).toEqual([]) // 零寬字元不會被 trim，也不在任何欄位
  })

  it('只有空白（含 NBSP、全形空白）的關鍵字等於空字串：回傳全部', () => {
    expect(filterRecords(list(), ' \u00A0\u3000 ')).toHaveLength(2)
  })

  it('超長關鍵字不丟錯、回傳空', () => {
    expect(filterRecords(list(), 'x'.repeat(1_000_000))).toEqual([])
  })

  it('回傳新陣列，不改動輸入', () => {
    const src = list()
    const out = filterRecords(src, '')
    expect(out).not.toBe(src)
    expect(out).toEqual(src)
  })
})

describe('並行新增（ConstraintError 不成為未處理的 rejection）', () => {
  it('同一整列同時送出 10 次：恰好 1 次成功、9 次 IDENTICAL_ROW、名單只有 1 筆、無 unhandled rejection', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => createRecord(f('929-X2', '20-9A', '王小明'))))
    await settle()
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const rejected = results.filter((r) => !r.ok)
    expect(rejected).toHaveLength(9)
    expect(rejected.every((r) => !r.ok && r.reason === 'IDENTICAL_ROW')).toBe(true)
    expect(await listRecords()).toHaveLength(1)
    expect(unhandled).toEqual([])
  })

  it('去空白後相同的整列（" 929-X2 " 與 "929-X2"）並行送出，同樣只成功 1 筆', async () => {
    const results = await Promise.all([
      createRecord(f(' 929-X2 ', '20-9A', ' 王小明 ', ' A123456789 ')),
      createRecord(f('929-X2', '20-9A', '王小明', 'A123456789')),
      createRecord(f('\u00A0929-X2\u3000', '20-9A', '王小明', 'A123456789')),
    ])
    await settle()
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(await listRecords()).toHaveLength(1)
    expect(unhandled).toEqual([])
  })

  it('IDENTICAL_ROW 回傳的 existing 就是那筆成功的紀錄', async () => {
    const results = await Promise.all([createRecord(f('A-1', 'B-1', '王')), createRecord(f('A-1', 'B-1', '王'))])
    const okRec = must(results.find((r) => r.ok)!)
    const bad = results.find((r) => !r.ok)
    expect(bad).toEqual({ ok: false, reason: 'IDENTICAL_ROW', existing: okRec })
  })

  it('50 筆不同資料並行新增：全部成功、id 不重複且單調、listRecords 依 id 升冪', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => createRecord(f(`H${i}-1`, `T${i}-1`, `N${i}`, `A${i}`))))
    const ids = results.map((r) => must(r).id)
    expect(new Set(ids).size).toBe(50)
    const listed = await listRecords()
    expect(listed.map((r) => r.id)).toEqual([...ids].sort((a, b) => a - b))
    expect(unhandled).toEqual([])
  })

  it('並行新增兩筆同車頭車號：「新造成的重複通知」只出現一次（先後由交易序決定，不會雙方都通知或都不通知）', async () => {
    const results = await Promise.all([createRecord(f('SAME-1', 'B-1', '甲', 'A1')), createRecord(f('SAME-1', 'B-2', '乙', 'A2'))])
    const kinds = results.flatMap((r) => (r.ok ? r.notices.map((n) => n.kind) : []))
    expect(kinds).toEqual(['SAME_HEAD'])
  })

  it('並行把兩筆不同資料編輯成同一整列：恰好一筆成功，另一筆 IDENTICAL_ROW，名單不出現整列相同', async () => {
    const a = must(await createRecord(f('A-1', 'B-1', '甲')))
    const b = must(await createRecord(f('A-2', 'B-2', '甲')))
    const target = f('X-9', 'Y-9', '丙')
    const [ra, rb] = await Promise.all([updateRecord(a.id, target), updateRecord(b.id, target)])
    await settle()
    expect([ra.ok, rb.ok].filter(Boolean)).toHaveLength(1)
    const bad = [ra, rb].find((r) => !r.ok)
    expect(bad && !bad.ok && bad.reason).toBe('IDENTICAL_ROW')
    const rows = (await listRecords()).map((r) => JSON.stringify([r.headPlate, r.tailPlate, r.ownerName, r.idNumber]))
    expect(new Set(rows).size).toBe(rows.length)
    expect(unhandled).toEqual([])
  })

  it('新增與匯入同一整列並行：不管誰先，最後只有 1 筆，且沒有 unhandled rejection', async () => {
    const csv = utf8('車頭車號,車斗車號,駕駛姓名,駕駛身分證\r\nA-1,B-1,王,A123456789\r\n')
    const prev = await previewImport(csv)
    if (!prev.ok) throw new Error('預覽應成功')
    await Promise.all([createRecord(f('A-1', 'B-1', '王')), replaceAllFromImport(prev.preview)])
    await settle()
    expect(await listRecords()).toHaveLength(1)
    expect(unhandled).toEqual([])
  })

  it('同一份預覽被提交兩次（使用者連按兩下「確認替換」），名單仍是檔案內容、沒有重複列', async () => {
    const csv = utf8(
      '車頭車號,車斗車號,駕駛姓名,駕駛身分證\r\nA-1,B-1,王,A123456789\r\nA-1,B-2,李,F131104093\r\nC-3,D-3,張,A123456789\r\n',
    )
    await createRecord(f('OLD-1', 'OLD-2', '舊'))
    const prev = await previewImport(csv)
    if (!prev.ok) throw new Error('預覽應成功')
    const results = await Promise.all([replaceAllFromImport(prev.preview), replaceAllFromImport(prev.preview)])
    await settle()
    expect(results.every((r) => r.ok)).toBe(true)
    const listed = await listRecords()
    expect(listed.map((r) => r.ownerName)).toEqual(['王', '李', '張']) // 兩次都是整份替換，不會變成 6 筆
    const rows = listed.map((r) => JSON.stringify([r.headPlate, r.tailPlate, r.ownerName, r.idNumber]))
    expect(new Set(rows).size).toBe(rows.length) // 不變式：名單永遠沒有整列相同
    expect(unhandled).toEqual([])
  })

  it('新增與刪除並行：不丟錯、最終狀態與循序執行的某一種順序一致', async () => {
    const a = must(await createRecord(f('A-1', 'B-1', '甲')))
    await Promise.all([deleteRecord(a.id), createRecord(f('A-2', 'B-2', '乙'))])
    const listed = await listRecords()
    expect(listed.map((r) => r.ownerName)).toEqual(['乙'])
    expect(unhandled).toEqual([])
  })
})

describe('CRUD 邊界', () => {
  it('刪除後 id 不重用；deleteAllRecords 也不重置計數（契約 §2）', async () => {
    const a = must(await createRecord(f('A-1', 'B-1', '甲')))
    await deleteRecord(a.id)
    const b = must(await createRecord(f('A-1', 'B-1', '甲')))
    expect(b.id).toBeGreaterThan(a.id)
    await deleteAllRecords()
    const c = must(await createRecord(f('A-1', 'B-1', '甲')))
    expect(c.id).toBeGreaterThan(b.id)
  })

  it('編輯成與自己相同的值不算整列相同；編輯不存在的 id → NOT_FOUND 且不新增資料', async () => {
    const a = must(await createRecord(f('A-1', 'B-1', '甲')))
    expect((await updateRecord(a.id, f('A-1', 'B-1', '甲'))).ok).toBe(true)
    expect(await updateRecord(99999, f('Z-1', 'Z-2', '乙'))).toEqual({ ok: false, reason: 'NOT_FOUND' })
    expect(await listRecords()).toEqual([a])
  })

  it('編輯成與別筆整列相同 → IDENTICAL_ROW，兩筆資料都不變', async () => {
    const a = must(await createRecord(f('A-1', 'B-1', '甲')))
    const b = must(await createRecord(f('A-2', 'B-2', '乙')))
    const r = await updateRecord(b.id, f('A-1', 'B-1', '甲'))
    expect(r).toEqual({ ok: false, reason: 'IDENTICAL_ROW', existing: a })
    expect(await listRecords()).toEqual([a, b])
  })

  it('INVALID 時 errors 逐欄回報，且不寫入', async () => {
    const r = await createRecord(f('abc', 'A--1', '', ''))
    expect(r).toEqual({
      ok: false,
      reason: 'INVALID',
      errors: { headPlate: 'PLATE_LOWERCASE', tailPlate: 'PLATE_MULTI_HYPHEN', ownerName: 'REQUIRED', idNumber: 'REQUIRED' },
    })
    expect(await listRecords()).toEqual([])
  })

  it('一人多車（同駕駛身分證同駕駛姓名）不算重複：不通知', async () => {
    must(await createRecord(f('A-1', 'B-1', '王')))
    const r = await createRecord(f('C-3', 'D-3', '王'))
    expect(r.ok && r.notices).toEqual([])
  })

  it('[特性紀錄] 刪除不存在的 id 不丟錯', async () => {
    await expect(deleteRecord(424242)).resolves.toBeUndefined()
  })
  it.todo('[未定義] 刪除不存在的 id 應靜默成功還是回報 NOT_FOUND（契約只寫 Promise<void>）')
  it.todo('[未定義] 兩個分頁／視窗同時開啟 App 並各自寫入：契約只說 db.ts 有 blocked／blocking 處理，跨分頁競態未規格化')
})
