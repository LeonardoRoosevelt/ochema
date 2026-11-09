import { getDb, STORE_RECORDS } from './db'
import { detectDuplicates, findIdenticalRow, noticesForSave } from './duplicates'
import { checkIdNumber, validateRecordInput } from './validation'
import type { Overview, RecordFields, SaveResult, VehicleRecord } from './types'

const noop = () => {}
const isConstraintError = (e: unknown) => (e as { name?: string } | null)?.name === 'ConstraintError'

/**
 * 新增與編輯共用：單一 readwrite 交易，交易內只 await IDB 請求（契約 §3.4 注意 1）。
 * id 有值＝編輯（put），否則新增（add）。
 */
async function save(input: RecordFields, id?: number): Promise<SaveResult> {
  const v = validateRecordInput(input)
  if (v.firstError) return { ok: false, reason: 'INVALID', errors: v.errors }
  const fields = v.fields

  const db = await getDb()
  const tx = db.transaction(STORE_RECORDS, 'readwrite')
  const done = tx.done
  done.catch(noop) // 中止時 tx.done 會 reject；統一在下面處理，避免成為 unhandled rejection
  const store = tx.objectStore(STORE_RECORDS)
  const existing: VehicleRecord[] = await store.getAll()

  const previous = id === undefined ? undefined : existing.find((r) => r.id === id)
  if (id !== undefined && !previous) {
    await done
    return { ok: false, reason: 'NOT_FOUND' }
  }
  const identical = findIdenticalRow(fields, existing, id)
  if (identical) {
    await done
    return { ok: false, reason: 'IDENTICAL_ROW', existing: identical }
  }

  let record: VehicleRecord
  try {
    if (id === undefined) {
      const newId = (await store.add(fields)) as number
      record = { id: newId, ...fields }
    } else {
      await store.put({ id, ...fields })
      record = { id, ...fields }
    }
    await done
  } catch (e) {
    if (!isConstraintError(e)) throw e
    // 競態：複合 unique 擋下了整列相同
    const latest = await listRecords()
    const dup = findIdenticalRow(fields, latest, id)
    if (!dup) throw e
    return { ok: false, reason: 'IDENTICAL_ROW', existing: dup }
  }

  const result: SaveResult = { ok: true, record, notices: noticesForSave(fields, existing, previous) }
  if (v.idWarning) result.idWarning = v.idWarning
  return result
}

/** 驗證順序：INVALID → IDENTICAL_ROW → 寫入。單一 readwrite 交易。 */
export function createRecord(input: RecordFields): Promise<SaveResult> {
  return save(input)
}

/** 只改 input 內的欄位值；id 與位置不變。與「自己」相同值不算整列相同。 */
export function updateRecord(id: number, input: RecordFields): Promise<SaveResult> {
  return save(input, id)
}

export async function deleteRecord(id: number): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_RECORDS, id)
}

export async function deleteAllRecords(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE_RECORDS)
}

/** id 升冪 */
export async function listRecords(): Promise<VehicleRecord[]> {
  const db = await getDb()
  return db.getAll(STORE_RECORDS)
}

export function buildOverview(records: readonly VehicleRecord[]): Overview {
  const byId = new Map(records.map((r) => [r.id, r]))
  const duplicateGroups = detectDuplicates(records).groups.map((g) => ({
    ...g,
    records: g.recordIds.map((id) => byId.get(id)!),
  }))
  const idWarnings: Overview['idWarnings'] = []
  for (const record of [...records].sort((a, b) => a.id - b.id)) {
    const c = checkIdNumber(record.idNumber)
    if (c.status === 'warn') idWarnings.push({ record, code: c.code })
  }
  return { duplicateGroups, idWarnings, isClean: duplicateGroups.length === 0 && idWarnings.length === 0 }
}
