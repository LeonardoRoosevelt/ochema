import { getDb, STORE_RECORDS } from './db'
import { findConflicts, findIdenticalRow } from './duplicates'
import { readImportFile } from './excelRead'
import { listRecords } from './records'
import { validateRecordInput } from './validation'
import type {
  DuplicateKind,
  ImportMode,
  ImportPreview,
  ImportResult,
  PreviewResult,
  PreviewRow,
  RawRow,
  RowCategory,
  RowConflictKind,
  VehicleRecord,
} from './types'

const noop = () => {}
const KIND_ORDER: readonly DuplicateKind[] = ['SAME_HEAD', 'SAME_TAIL', 'SAME_ID_DIFF_NAME']

/** IDENTICAL_ROW 在前，其餘依固定順序 */
function kindsOf(identical: boolean, found: readonly DuplicateKind[]): RowConflictKind[] {
  return [...(identical ? (['IDENTICAL_ROW'] as const) : []), ...KIND_ORDER.filter((k) => found.includes(k))]
}

/** 預覽分類（純函式）。分類演算法見契約 §3.5。 */
export function buildPreview(rows: readonly RawRow[], existing: readonly VehicleRecord[]): ImportPreview {
  const out: PreviewRow[] = []
  // 檔內「較前面的非格式錯誤列」；借用 VehicleRecord 形狀，id＝fileRow，以重用同一套比對函式
  const earlier: VehicleRecord[] = []
  const counts = { total: 0, new: 0, dupExisting: 0, dupInFile: 0, formatError: 0 }
  const identicalRows: number[] = []

  for (const raw of rows) {
    const v = validateRecordInput(raw.cells)
    counts.total++
    if (v.firstError) {
      // 格式錯誤列不參與任何比對：不當既有、也不當「較前面的列」
      counts.formatError++
      out.push({
        fileRow: raw.fileRow,
        fields: v.fields,
        category: 'FORMAT_ERROR',
        error: v.firstError,
        kinds: [],
        existingConflicts: [],
        inFileConflicts: [],
      })
      continue
    }
    const fields = v.fields
    const identicalExisting = findIdenticalRow(fields, existing)
    const existingConflicts = findConflicts(fields, existing)
    const identicalFile = findIdenticalRow(fields, earlier)
    const fileConflicts = findConflicts(fields, earlier)

    let category: RowCategory
    let kinds: RowConflictKind[]
    if (identicalExisting || existingConflicts.length > 0) {
      category = 'DUP_EXISTING'
      kinds = kindsOf(!!identicalExisting, existingConflicts.map((c) => c.kind))
      counts.dupExisting++
    } else if (identicalFile || fileConflicts.length > 0) {
      category = 'DUP_IN_FILE'
      kinds = kindsOf(!!identicalFile, fileConflicts.map((c) => c.kind))
      counts.dupInFile++
    } else {
      category = 'NEW'
      kinds = []
      counts.new++
    }

    const row: PreviewRow = {
      fileRow: raw.fileRow,
      fields,
      category,
      kinds,
      existingConflicts,
      inFileConflicts: fileConflicts.map((c) => ({ kind: c.kind, value: c.value, fileRows: c.records.map((r) => r.id) })),
    }
    if (v.idWarning) row.idWarning = v.idWarning
    if (identicalExisting) row.identicalTo = { source: 'EXISTING', recordId: identicalExisting.id }
    else if (identicalFile) row.identicalTo = { source: 'FILE', fileRow: identicalFile.id }
    if (row.identicalTo) identicalRows.push(raw.fileRow)
    out.push(row)
    earlier.push({ id: raw.fileRow, ...fields })
  }
  return { rows: out, counts, identicalRows, source: [...rows] }
}

/** readImportFile + listRecords + buildPreview；不寫入。 */
export async function previewImport(bytes: ArrayBuffer | Uint8Array): Promise<PreviewResult> {
  const read = readImportFile(bytes)
  if (!read.ok) return read
  return { ok: true, preview: buildPreview(read.rows, await listRecords()) }
}

/** 單一交易：讀目前名單→對 preview.source 重算分類→依檔案順序 add。放棄匯入＝不呼叫此函式。 */
export async function commitImport(preview: ImportPreview, mode: ImportMode): Promise<ImportResult> {
  const db = await getDb()
  const tx = db.transaction(STORE_RECORDS, 'readwrite')
  const done = tx.done
  done.catch(noop)
  const store = tx.objectStore(STORE_RECORDS)
  const existing: VehicleRecord[] = await store.getAll()

  // 預覽後名單可能已變，以目前名單重算
  const fresh = buildPreview(preview.source, existing)
  const adds: Promise<unknown>[] = []
  let formatErrorsNotImported = 0
  for (const row of fresh.rows) {
    if (row.category === 'FORMAT_ERROR') formatErrorsNotImported++
    else if (row.identicalTo) continue // 兩種選項都不匯入整列相同
    else if (row.category === 'NEW' || mode === 'IMPORT_ALL') adds.push(store.add(row.fields))
  }
  await Promise.all(adds) // 依序發出請求，id 順序＝檔案列序
  await done
  return {
    imported: adds.length,
    skipped: fresh.counts.total - adds.length - formatErrorsNotImported,
    formatErrorsNotImported,
  }
}
