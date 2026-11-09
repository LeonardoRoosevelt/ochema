// 型別與列舉。依 docs/data-contract.md §1、§3 逐項對應；常數屬資料定義而非邏輯，故直接給值。

// ── 欄位 ──────────────────────────────────────────────
export type FieldKey = 'headPlate' | 'tailPlate' | 'ownerName' | 'idNumber'
/** Excel 標題與畫面名稱 */
export const COLUMN_TITLES = {
  headPlate: '車頭車號',
  tailPlate: '車斗車號',
  ownerName: '駕駛姓名',
  idNumber: '駕駛身分證',
} as const
/** 欄位順序：匯出欄序、格式錯誤時「取第一個不合的欄位」的順序 */
export const FIELD_ORDER: readonly FieldKey[] = ['headPlate', 'tailPlate', 'ownerName', 'idNumber']

export interface RecordFields {
  headPlate: string
  tailPlate: string
  ownerName: string
  idNumber: string
}
/** vehicle_records 的一列 */
export interface VehicleRecord extends RecordFields {
  id: number
}

// ── 原因代碼（與 field-validation.feature 檔頭一致，一個不多一個不少；優先序由左至右）──
export type PlateReason =
  | 'REQUIRED'
  | 'PLATE_INNER_WHITESPACE'
  | 'PLATE_FULLWIDTH'
  | 'PLATE_LOWERCASE'
  | 'PLATE_INVALID_CHAR'
  | 'PLATE_NO_HYPHEN'
  | 'PLATE_MULTI_HYPHEN'
  | 'PLATE_EMPTY_PART'
export type IdWarning =
  | 'ID_LENGTH'
  | 'ID_LOWERCASE'
  | 'ID_FIRST_NOT_ALPHA'
  | 'ID_LEGACY_RESIDENCE'
  | 'ID_NON_DIGIT'
  | 'ID_CHECKSUM'

// ── 重複種類 ──────────────────────────────────────────
/** 同車頭車號／同車斗車號／同駕駛身分證不同姓名（只通知） */
export type DuplicateKind = 'SAME_HEAD' | 'SAME_TAIL' | 'SAME_ID_DIFF_NAME'
/** 僅匯入預覽使用；手動新增／編輯遇到 IDENTICAL_ROW 是「擋下」而不是通知 */
export type RowConflictKind = 'IDENTICAL_ROW' | DuplicateKind

// ── 欄位檢查（validation.ts）──────────────────────────
export type PlateCheck = { ok: true; value: string } | { ok: false; code: PlateReason; value: string }

export type IdCheck =
  | { status: 'ok'; value: string }
  | { status: 'warn'; code: IdWarning; value: string }
  | { status: 'required'; code: 'REQUIRED'; value: '' }

export interface RecordValidation {
  fields: RecordFields
  /** 擋下原因：headPlate/tailPlate → PlateReason；ownerName/idNumber → 'REQUIRED'。空物件＝可存 */
  errors: Partial<Record<FieldKey, PlateReason | 'REQUIRED'>>
  /** 第一個不合的欄位（依 FIELD_ORDER），匯入用；無錯誤為 undefined */
  firstError?: { field: FieldKey; code: PlateReason | 'REQUIRED' }
  /** 駕駛身分證格式警示；idNumber 為空時不給 */
  idWarning?: IdWarning
}

// ── 重複偵測（duplicates.ts）──────────────────────────
export interface DuplicateGroup {
  kind: DuplicateKind
  /** SAME_HEAD→車頭車號值；SAME_TAIL→車斗車號值；SAME_ID_DIFF_NAME→駕駛身分證值 */
  value: string
  /** 涉及的資料，依 id 升冪 */
  recordIds: number[]
}
export interface DuplicateReport {
  /** 依 kind（HEAD, TAIL, ID）再依 value 排序 */
  groups: DuplicateGroup[]
  /** 名單標示用；無重複的資料不在 map 內 */
  byRecordId: ReadonlyMap<number, DuplicateKind[]>
}
export interface DuplicateConflict {
  kind: DuplicateKind
  value: string
  /** 與候選資料衝突的既有資料（不含候選自己；SAME_ID_DIFF_NAME 只含駕駛姓名不同者） */
  records: VehicleRecord[]
}

// ── 名單 CRUD（records.ts）────────────────────────────
export type SaveFailure =
  | { ok: false; reason: 'INVALID'; errors: RecordValidation['errors'] }
  | { ok: false; reason: 'IDENTICAL_ROW'; existing: VehicleRecord }
  | { ok: false; reason: 'NOT_FOUND' }
export interface SaveSuccess {
  ok: true
  /** 已存入（trim 後） */
  record: VehicleRecord
  /** 駕駛身分證警示（仍已存檔） */
  idWarning?: IdWarning
  /** 新造成的重複通知；空陣列＝不顯示通知 */
  notices: DuplicateConflict[]
}
export type SaveResult = SaveSuccess | SaveFailure

export interface Overview {
  duplicateGroups: Array<DuplicateGroup & { records: VehicleRecord[] }>
  /** 依 id 升冪 */
  idWarnings: Array<{ record: VehicleRecord; code: IdWarning }>
  /** 兩者皆空 → 「目前沒有重複與警示」 */
  isClean: boolean
}

// ── 匯入（fileFormat.ts／excelRead.ts／importer.ts）───
export type ImportFormat = 'xlsx' | 'xls' | 'csv'
export type ReadFailure =
  | { code: 'UNREADABLE'; hint?: 'SAVE_AS_CSV_UTF8' }
  | { code: 'EMPTY_FILE' }
  | { code: 'MISSING_HEADERS'; missing: string[] }
export type FormatResult = { ok: true; format: ImportFormat } | ({ ok: false } & ReadFailure)

/** fileRow：檔案中的實際列號（1 起算；標題列固定為第 1 列，見契約附錄 Q-E）。cells 為顯示文字，尚未 trim。 */
export interface RawRow {
  fileRow: number
  cells: Record<FieldKey, string>
}
export type ReadResult = { ok: true; format: ImportFormat; rows: RawRow[] } | ({ ok: false } & ReadFailure)
export type GridRowsResult = { ok: true; rows: RawRow[] } | ({ ok: false } & ReadFailure)

export type RowCategory = 'NEW' | 'DUP_EXISTING' | 'DUP_IN_FILE' | 'FORMAT_ERROR'
export interface PreviewRow {
  fileRow: number
  /** trim 後（FORMAT_ERROR 亦然） */
  fields: RecordFields
  category: RowCategory
  /** 僅 FORMAT_ERROR */
  error?: { field: FieldKey; code: PlateReason | 'REQUIRED' }
  /** 非 FORMAT_ERROR 才計算 */
  idWarning?: IdWarning
  /** 全部成立者，順序固定：IDENTICAL_ROW, SAME_HEAD, SAME_TAIL, SAME_ID_DIFF_NAME */
  kinds: RowConflictKind[]
  /** 對既有資料的衝突（含衝突的既有資料） */
  existingConflicts: DuplicateConflict[]
  /** 對檔內較前面列的衝突 */
  inFileConflicts: Array<{ kind: DuplicateKind; value: string; fileRows: number[] }>
  /** 與誰整列相同：兩種匯入選項都不會匯入此列 */
  identicalTo?: { source: 'EXISTING'; recordId: number } | { source: 'FILE'; fileRow: number }
}
export interface ImportPreview {
  /** 檔案順序 */
  rows: PreviewRow[]
  /** 四類相加＝total */
  counts: { total: number; new: number; dupExisting: number; dupInFile: number; formatError: number }
  /** 單獨列出的「整列相同」fileRow */
  identicalRows: number[]
  /** 供 commitImport 重算 */
  source: RawRow[]
}
export type PreviewResult = { ok: true; preview: ImportPreview } | ({ ok: false } & ReadFailure)
/** 略過重複／照樣匯入 */
export type ImportMode = 'SKIP_DUPLICATES' | 'IMPORT_ALL'
export interface ImportResult {
  imported: number
  skipped: number
  formatErrorsNotImported: number
}

// ── 匯出（excelWrite.ts）─────────────────────────────
export type ExportFormat = 'xlsx' | 'xls' | 'csv'
export const EXPORT_FORMATS: Record<ExportFormat, { ext: string; mime: string }> = {
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  xls: { ext: 'xls', mime: 'application/vnd.ms-excel' },
  csv: { ext: 'csv', mime: 'text/csv;charset=utf-8' },
}
export interface ExportResult {
  bytes: Uint8Array
  count: number
  fileName: string
  mimeType: string
  format: ExportFormat
}
