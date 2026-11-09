import { getDb, STORE_RECORDS } from './db'
import { findConflicts, findIdenticalRow } from './duplicates'
import { readImportFile } from './excelRead'
import { listRecords } from './records'
import { validateRecordInput } from './validation'
import type {
  DuplicateKind,
  ImportPreview,
  PreviewResult,
  PreviewRow,
  RawRow,
  ReplaceResult,
  VehicleRecord,
} from './types'

const noop = () => {}
const KIND_ORDER: readonly DuplicateKind[] = ['SAME_HEAD', 'SAME_TAIL', 'SAME_ID_DIFF_NAME']

/**
 * 預覽分類（純函式）。分類演算法見契約 §3.5：FORMAT_ERROR > IDENTICAL_IN_FILE > DUP_IN_FILE > NEW。
 * 匯入是整份替換，不與既有資料比對；existingCount 只用來告知「將刪除目前 N 筆」。
 */
export function buildPreview(rows: readonly RawRow[], existingCount: number): ImportPreview {
  const out: PreviewRow[] = []
  // 檔內「較前面且會被保留的非格式錯誤列」；借用 VehicleRecord 形狀，id＝fileRow，以重用同一套比對函式。
  // 整列相同被合併的列不放進來（匯入後它不存在，衝突應指向保留下來的那一列）。
  const earlier: VehicleRecord[] = []
  const counts = { total: 0, new: 0, dupInFile: 0, identicalInFile: 0, formatError: 0 }
  const identicalRows: number[] = []

  for (const raw of rows) {
    const v = validateRecordInput(raw.cells)
    counts.total++
    if (v.firstError) {
      // 格式錯誤列不參與任何比對：不當「較前面的列」
      counts.formatError++
      out.push({ fileRow: raw.fileRow, fields: v.fields, category: 'FORMAT_ERROR', error: v.firstError, kinds: [], inFileConflicts: [] })
      continue
    }
    const fields = v.fields
    const identical = findIdenticalRow(fields, earlier)
    if (identical) {
      counts.identicalInFile++
      identicalRows.push(raw.fileRow)
      const row: PreviewRow = {
        fileRow: raw.fileRow,
        fields,
        category: 'IDENTICAL_IN_FILE',
        kinds: [],
        inFileConflicts: [],
        identicalTo: { fileRow: identical.id },
      }
      if (v.idWarning) row.idWarning = v.idWarning
      out.push(row)
      continue
    }

    const conflicts = findConflicts(fields, earlier)
    const row: PreviewRow = {
      fileRow: raw.fileRow,
      fields,
      category: conflicts.length > 0 ? 'DUP_IN_FILE' : 'NEW',
      kinds: KIND_ORDER.filter((k) => conflicts.some((c) => c.kind === k)),
      inFileConflicts: conflicts.map((c) => ({ kind: c.kind, value: c.value, fileRows: c.records.map((r) => r.id) })),
    }
    if (conflicts.length > 0) counts.dupInFile++
    else counts.new++
    if (v.idWarning) row.idWarning = v.idWarning
    out.push(row)
    earlier.push({ id: raw.fileRow, ...fields })
  }

  return {
    rows: out,
    counts,
    identicalRows,
    willDelete: existingCount,
    willImport: counts.new + counts.dupInFile,
    merged: counts.identicalInFile,
    canConfirm: counts.formatError === 0 && counts.total > 0,
  }
}

/** readImportFile + 目前筆數 + buildPreview；不寫入。 */
export async function previewImport(bytes: ArrayBuffer | Uint8Array): Promise<PreviewResult> {
  const read = readImportFile(bytes)
  if (!read.ok) return read
  return { ok: true, preview: buildPreview(read.rows, (await listRecords()).length) }
}

// ── 測試接縫 ──────────────────────────────────────────
let faultAfterWrites: number | undefined

/** 僅測試使用：讓下一次 replaceAllFromImport 在寫入第 n 筆之後丟錯（一次性）；傳 undefined 清除。 */
export function injectImportWriteFault(afterWrites: number | undefined): void {
  faultAfterWrites = afterWrites
}

/**
 * 整份替換：單一 readwrite 交易內 count → clear → 依檔案順序 add。
 * 交易內只 await IDB 請求（契約 §3.4 注意 1）；任何失敗都中止交易，名單維持原狀。
 */
export async function replaceAllFromImport(preview: ImportPreview): Promise<ReplaceResult> {
  if (!preview.canConfirm) {
    return { ok: false, reason: preview.counts.formatError > 0 ? 'FORMAT_ERRORS' : 'NOTHING_TO_IMPORT' }
  }
  const fault = faultAfterWrites
  faultAfterWrites = undefined // 一次性

  const toWrite = preview.rows.filter((r) => r.category === 'NEW' || r.category === 'DUP_IN_FILE')
  let tx: { abort(): void } | undefined
  try {
    const db = await getDb()
    const t = db.transaction(STORE_RECORDS, 'readwrite')
    tx = t
    const done = t.done
    done.catch(noop) // 中止時 done 會 reject；統一在 catch 處理，避免 unhandled rejection
    const store = t.objectStore(STORE_RECORDS)

    const deleted = await store.count()
    const pending: Promise<unknown>[] = []
    const issue = (request: Promise<unknown>) => {
      request.catch(noop) // 中止後各請求都會 reject，不可成為 unhandled rejection
      pending.push(request)
    }
    issue(store.clear())
    toWrite.forEach((row, i) => {
      issue(store.add(row.fields)) // 依序發出請求，id 順序＝檔案列序
      if (fault !== undefined && i + 1 >= fault) throw new Error('injected write fault')
    })
    await Promise.all(pending)
    await done
    return { ok: true, result: { deleted, imported: toWrite.length, merged: preview.merged } }
  } catch {
    try {
      tx?.abort()
    } catch {
      // 交易已結束（已提交或已中止），沒有可回滾的東西
    }
    return { ok: false, reason: 'WRITE_FAILED' }
  }
}
