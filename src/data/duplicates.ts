import type {
  DuplicateConflict,
  DuplicateGroup,
  DuplicateKind,
  DuplicateReport,
  RecordFields,
  VehicleRecord,
} from './types'

const byId = (a: VehicleRecord, b: VehicleRecord) => a.id - b.id
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

function groupBy(records: readonly VehicleRecord[], key: (r: VehicleRecord) => string) {
  const m = new Map<string, VehicleRecord[]>()
  for (const r of records) {
    const list = m.get(key(r))
    if (list) list.push(r)
    else m.set(key(r), [r])
  }
  return m
}

/** 名單總檢查。資料不與自己比對。 */
export function detectDuplicates(records: readonly VehicleRecord[]): DuplicateReport {
  const sorted = [...records].sort(byId)
  const groups: DuplicateGroup[] = []
  const push = (kind: DuplicateKind, value: string, recs: VehicleRecord[]) =>
    groups.push({ kind, value, recordIds: recs.map((r) => r.id) })

  for (const [value, recs] of [...groupBy(sorted, (r) => r.headPlate)].sort((a, b) => cmp(a[0], b[0])))
    if (recs.length >= 2) push('SAME_HEAD', value, recs)
  for (const [value, recs] of [...groupBy(sorted, (r) => r.tailPlate)].sort((a, b) => cmp(a[0], b[0])))
    if (recs.length >= 2) push('SAME_TAIL', value, recs)
  for (const [value, recs] of [...groupBy(sorted, (r) => r.idNumber)].sort((a, b) => cmp(a[0], b[0])))
    if (new Set(recs.map((r) => r.ownerName)).size >= 2) push('SAME_ID_DIFF_NAME', value, recs)

  const byRecordId = new Map<number, DuplicateKind[]>()
  for (const g of groups)
    for (const id of g.recordIds) {
      const kinds = byRecordId.get(id)
      if (kinds) kinds.push(g.kind)
      else byRecordId.set(id, [g.kind])
    }
  return { groups, byRecordId }
}

/** 候選資料（已 trim）與名單比對；excludeId 供編輯時排除自己。不含整列相同。 */
export function findConflicts(
  candidate: RecordFields,
  existing: readonly VehicleRecord[],
  excludeId?: number,
): DuplicateConflict[] {
  const others = existing.filter((r) => r.id !== excludeId).sort(byId)
  const out: DuplicateConflict[] = []
  const heads = others.filter((r) => r.headPlate === candidate.headPlate)
  if (heads.length) out.push({ kind: 'SAME_HEAD', value: candidate.headPlate, records: heads })
  const tails = others.filter((r) => r.tailPlate === candidate.tailPlate)
  if (tails.length) out.push({ kind: 'SAME_TAIL', value: candidate.tailPlate, records: tails })
  const ids = others.filter((r) => r.idNumber === candidate.idNumber && r.ownerName !== candidate.ownerName)
  if (ids.length) out.push({ kind: 'SAME_ID_DIFF_NAME', value: candidate.idNumber, records: ids })
  return out
}

/** 四欄完全相同的既有資料（至多 1 筆，因為名單不會有整列相同） */
export function findIdenticalRow(
  candidate: RecordFields,
  existing: readonly VehicleRecord[],
  excludeId?: number,
): VehicleRecord | undefined {
  return existing.find(
    (r) =>
      r.id !== excludeId &&
      r.headPlate === candidate.headPlate &&
      r.tailPlate === candidate.tailPlate &&
      r.ownerName === candidate.ownerName &&
      r.idNumber === candidate.idNumber,
  )
}

/**
 * 存檔通知：只回報「這次存檔新造成」的種類。
 * 新增：findConflicts 全部。編輯：該種類的「比對鍵」有變動才通知。
 */
export function noticesForSave(
  next: RecordFields,
  existing: readonly VehicleRecord[],
  previous?: VehicleRecord,
): DuplicateConflict[] {
  const conflicts = findConflicts(next, existing, previous?.id)
  if (!previous) return conflicts
  const keyChanged: Record<DuplicateKind, boolean> = {
    SAME_HEAD: next.headPlate !== previous.headPlate,
    SAME_TAIL: next.tailPlate !== previous.tailPlate,
    SAME_ID_DIFF_NAME: next.idNumber !== previous.idNumber || next.ownerName !== previous.ownerName,
  }
  return conflicts.filter((c) => keyChanged[c.kind])
}

