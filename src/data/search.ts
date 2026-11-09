import type { VehicleRecord } from './types'

/** keyword 先 trim；空字串回傳全部；任一欄位「包含」即符合，不分大小寫。保持原順序。 */
export function filterRecords(records: readonly VehicleRecord[], keyword: string): VehicleRecord[] {
  const k = keyword.trim().toLowerCase()
  if (k === '') return [...records]
  return records.filter((r) =>
    [r.headPlate, r.tailPlate, r.ownerName, r.idNumber].some((v) => v.toLowerCase().includes(k)),
  )
}
