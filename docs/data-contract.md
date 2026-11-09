# ochema 資料契約（取代 API 契約）

ochema 沒有後端、沒有 HTTP。這份文件定義的是「資料層模組 API」：UI 與 step definitions 只透過這些 TypeScript 函式讀寫 IndexedDB 與檔案（.xlsx／.xls／CSV），**正式程式碼**不直接碰 `idb`、SheetJS。**測試**例外：fixture 的建立（例如數字 7＋格式 `000`、完全空白、損毀檔、Big5 CSV）與匯出檔的讀回驗證（欄序、欄數、儲存格型別 `t:'s'`）無法只靠資料層函式完成，故允許 `tests/support/`（建議 `workbook.ts`、`csvFixture.ts`）直接 import `xlsx` 與使用 `TextEncoder`／手寫位元組；這些 helper 不得被 `src/` 引用。`@api` 情境在 vitest（jsdom＋fake-indexeddb）下直接呼叫這些函式驗證。

- 唯一資料表：`vehicle_records`（見 `schema.dbml`）。
- 依據：`features/*.feature`（已鎖定，檔頭註解為規則來源）與 `.studio/decisions/A-pre-1.md`、`A-gate.md`。
- 建議目錄：`src/data/`（沿用 BloomIn 的 `store/` 分層：IndexedDB 存取與純函式分開）。

| 模組 | 內容 | 性質 |
|---|---|---|
| `types.ts` | 型別與原因代碼列舉 | 型別 |
| `validation.ts` | 欄位檢查、去空白 | 純函式 |
| `duplicates.ts` | 重複偵測、衝突查找、存檔通知 | 純函式 |
| `search.ts` | 查詢 | 純函式 |
| `db.ts` | 開啟資料庫、object store 建立 | idb |
| `records.ts` | 新增／編輯／刪除／列表／總覽 | idb（交易） |
| `fileFormat.ts` | 依內容判定檔案格式（`detectFormat`） | 純函式 |
| `csv.ts` | 自寫 RFC 4180 解析與序列化（見 §4.2） | 純函式 |
| `excelRead.ts` | 讀 .xlsx／.xls 為字串格；三格式共用的「格→原始列」規則（`gridToRawRows`）；`readImportFile` 總入口 | SheetJS 邊界＋純函式 |
| `importer.ts` | 預覽分類（純）、預覽、提交 | 純函式＋idb |
| `excelWrite.ts` | 寫出 .xlsx／.xls（CSV 走 `csv.ts`）；`exportRecords` | SheetJS 邊界 |

純函式不碰 IndexedDB，可用資料陣列直接測；有 I/O 的函式很薄，只負責「讀出→呼叫純函式→交易寫入」。

---

## 1. 列舉與型別

```ts
// ── 欄位 ──────────────────────────────────────────────
export type FieldKey = 'headPlate' | 'tailPlate' | 'ownerName' | 'idNumber'
/** Excel 標題與畫面名稱 */
export const COLUMN_TITLES = { headPlate: '車頭', tailPlate: '車尾', ownerName: '姓名', idNumber: '身分證' } as const
/** 欄位順序：匯出欄序、格式錯誤時「取第一個不合的欄位」的順序 */
export const FIELD_ORDER: readonly FieldKey[] = ['headPlate', 'tailPlate', 'ownerName', 'idNumber']

export interface RecordFields { headPlate: string; tailPlate: string; ownerName: string; idNumber: string }
export interface VehicleRecord extends RecordFields { id: number }   // = vehicle_records 一列

// ── 原因代碼（與 field-validation.feature 檔頭一致，一個不多一個不少）──
export type PlateReason =
  | 'REQUIRED' | 'PLATE_INNER_WHITESPACE' | 'PLATE_FULLWIDTH' | 'PLATE_LOWERCASE'
  | 'PLATE_INVALID_CHAR' | 'PLATE_NO_HYPHEN' | 'PLATE_MULTI_HYPHEN' | 'PLATE_EMPTY_PART'   // 優先序由左至右
export type IdWarning =
  | 'ID_LENGTH' | 'ID_LOWERCASE' | 'ID_FIRST_NOT_ALPHA' | 'ID_LEGACY_RESIDENCE'
  | 'ID_NON_DIGIT' | 'ID_CHECKSUM'                                                        // 優先序由左至右

// ── 重複種類 ──────────────────────────────────────────
export type DuplicateKind = 'SAME_HEAD' | 'SAME_TAIL' | 'SAME_ID_DIFF_NAME'  // 同車頭／同車尾／同身分證不同姓名（只通知）
/** 僅匯入預覽使用；手動新增／編輯遇到 IDENTICAL_ROW 是「擋下」而不是通知 */
export type RowConflictKind = 'IDENTICAL_ROW' | DuplicateKind                  // 整列相同
```

### 1.1 欄位檢查規則

#### 車牌 `checkPlate`

先 `trim()`（JS `String.prototype.trim`，含全形空白 U+3000、NBSP），再依序取**第一個成立**者：

| 優先序 | 代碼 | 成立條件（對 trim 後的字串） |
|---|---|---|
| 1 | `REQUIRED` | 長度 0 |
| 2 | `PLATE_INNER_WHITESPACE` | 含 `/\s/` |
| 3 | `PLATE_FULLWIDTH` | 含 U+FF01–FF5E、U+FFE0–FFE6 的全形字元（含全形連字號 `－`、全形英數） |
| 4 | `PLATE_LOWERCASE` | 含 `[a-z]` |
| 5 | `PLATE_INVALID_CHAR` | 含 `[A-Z0-9-]` 以外的任何字元 |
| 6 | `PLATE_NO_HYPHEN` | 不含 `-` |
| 7 | `PLATE_MULTI_HYPHEN` | `-` 超過 1 個 |
| 8 | `PLATE_EMPTY_PART` | `-` 前或後為空 |

全部不成立即合格，等價於 `^[A-Z0-9]+-[A-Z0-9]+$`。**不自動轉大寫，不做任何正規化。**

#### 身分證 `checkIdNumber`（只警示，不阻擋）

trim 後：空字串 → `REQUIRED`（必填，擋下，屬記錄層而非警示）。否則依序取第一個成立者：

| 優先序 | 代碼 | 成立條件 |
|---|---|---|
| 1 | `ID_LENGTH` | 長度 ≠ 10 |
| 2 | `ID_LOWERCASE` | 第 1 碼為 `[a-z]` |
| 3 | `ID_FIRST_NOT_ALPHA` | 第 1 碼不是 `[A-Z]` |
| 4 | `ID_LEGACY_RESIDENCE` | 第 2 碼為 `[A-Za-z]`（兩碼英文的舊式居留證） |
| 5 | `ID_NON_DIGIT` | 後 9 碼含非 `[0-9]`（含中間空白） |
| 6 | `ID_CHECKSUM` | 檢查碼不符 |

檢查碼：首碼字母對應 n（A10 B11 C12 D13 E14 F15 G16 H17 I34 J18 K19 L20 M21 N22 O35 P23 Q24 R25 S26 T27 U28 V29 W32 X30 Y31 Z33）；`sum = ⌊n/10⌋ + (n%10)×9 + Σ d[i]×w[i]`，`w = [8,7,6,5,4,3,2,1,1]` 對應後 9 碼；`sum % 10 === 0` 為通過。新式居留證（第 2 碼 8、9）套用同一公式。已實測 `A123456789`、`F131104093`、`A800000014`、`B900000017` 通過，`A123456788` 不通過。

#### 姓名

trim 後非空即可；無格式規則（門禁 A 核可）。

---

## 2. DBML ↔ IndexedDB 對應（欄位與約束與 `schema.dbml` 逐項一致）

資料庫名 `ochema`、版本 `1`。`upgrade(db, oldVersion)` 沿用 BloomIn 的增量寫法（`if (oldVersion < 1) {...}`）。

```ts
if (oldVersion < 1) {
  const s = db.createObjectStore('vehicle_records', { keyPath: 'id', autoIncrement: true })
  s.createIndex('uq_vehicle_records_row', ['headPlate', 'tailPlate', 'ownerName', 'idNumber'], { unique: true })
  s.createIndex('idx_vehicle_records_head_plate', 'headPlate')
  s.createIndex('idx_vehicle_records_tail_plate', 'tailPlate')
  s.createIndex('idx_vehicle_records_id_number', 'idNumber')
}
```

| DBML | IndexedDB | 說明 |
|---|---|---|
| `Table vehicle_records` | object store `vehicle_records` | 名稱相同，`@table:vehicle_records` 即 store 名 |
| `id integer [pk, increment]` | `keyPath: 'id'`、`autoIncrement: true` | `add()` 時不給 id，由 IndexedDB 配發 |
| `headPlate/tailPlate/ownerName/idNumber` | 物件屬性（camelCase，與 DBML 欄名一致） | `not null`、長度、格式 IndexedDB 不強制，**由 `validation.ts` 在寫入前保證** |
| `(四欄) [unique]` | 複合 unique index（陣列 keyPath） | 整列相同的最後防線；寫入值已去空白，故「去空白後相同」也被擋 |
| `headPlate`／`tailPlate`／`idNumber` 單欄索引 | 一般 index | 供「同車頭／同車尾／同身分證」的衝突查找（`index.getAll(value)`） |

**DBML 無長度限制**（B-1 建議 1，已於鎖定前修正）：`schema.dbml` 四欄皆為不帶長度的 `varchar`，與 features 一致（無長度規則）。

排序與「第一次出現」：全部依 `id` 升冪（`store.getAll()` 本身即 key 序）。`id` 由 autoIncrement 單調遞增，編輯不改、刪除不重用，所以不需要 `createdAt`。批次匯入在**同一個交易**內依檔案列序逐筆 `add`，故新匯入列的 id 順序＝檔案列序（情境「新匯入的資料姓名依序為…」）。

**索引的實際角色**：名單規模小（數百至數千筆），重複偵測與查詢都可在記憶體內做。三個單欄索引用於存檔時以 O(log n) 找衝突，不是效能必需品；複合 unique 才是有行為的約束（擋整列相同）。

**不入庫的衍生資料**：重複種類／群組、身分證警示、總覽。皆在讀取時由 `detectDuplicates`、`checkIdNumber` 對目前名單計算 → 刪除或編輯後標示即時消失、重開 App 後仍在（情境「重複標示在重新開啟 App 後仍在」）不需額外儲存，也不會有不同步。

**去空白與複合 unique 的先後**：所有欄位先 `trim()` → 再做格式檢查 → 再比對整列相同／寫入。因此 `" 929-X2 "` 與 `"929-X2"` 視為同一值。比對是原樣（`===`），不分大小寫、不做全半形轉換。

---

## 3. 資料層 API

### 3.1 欄位檢查（`validation.ts`，純函式）

```ts
export type PlateCheck =
  | { ok: true; value: string }                         // value = trim 後
  | { ok: false; code: PlateReason; value: string }

export type IdCheck =
  | { status: 'ok'; value: string }
  | { status: 'warn'; code: IdWarning; value: string }  // 仍可存檔
  | { status: 'required'; code: 'REQUIRED'; value: '' }

export function checkPlate(raw: string): PlateCheck
export function checkIdNumber(raw: string): IdCheck

/** 四欄一次檢查。fields 為 trim 後的值（即將存入的值）。 */
export interface RecordValidation {
  fields: RecordFields
  /** 擋下原因：headPlate/tailPlate → PlateReason；ownerName/idNumber → 'REQUIRED'。空物件＝可存 */
  errors: Partial<Record<FieldKey, PlateReason | 'REQUIRED'>>
  /** 第一個不合的欄位（依 FIELD_ORDER），匯入用；無錯誤為 undefined */
  firstError?: { field: FieldKey; code: PlateReason | 'REQUIRED' }
  /** 身分證格式警示；idNumber 為空時不給 */
  idWarning?: IdWarning
}
export function validateRecordInput(input: RecordFields): RecordValidation
```

### 3.2 重複偵測（`duplicates.ts`，純函式）

```ts
export interface DuplicateGroup {
  kind: DuplicateKind
  value: string          // SAME_HEAD→車頭值；SAME_TAIL→車尾值；SAME_ID_DIFF_NAME→身分證值
  recordIds: number[]    // 涉及的資料，依 id 升冪
}
export interface DuplicateReport {
  groups: DuplicateGroup[]                            // 依 kind（HEAD, TAIL, ID）再依 value 排序
  byRecordId: ReadonlyMap<number, DuplicateKind[]>    // 名單標示用；無重複的資料不在 map 內
}
/** 名單總檢查。資料不與自己比對。 */
export function detectDuplicates(records: readonly VehicleRecord[]): DuplicateReport

export interface DuplicateConflict {
  kind: DuplicateKind
  value: string
  /** 與候選資料衝突的既有資料（不含候選自己；SAME_ID_DIFF_NAME 只含姓名不同者） */
  records: VehicleRecord[]
}
/** 候選資料（已 trim）與名單比對；excludeId 供編輯時排除自己。不含整列相同。 */
export function findConflicts(
  candidate: RecordFields, existing: readonly VehicleRecord[], excludeId?: number,
): DuplicateConflict[]

/** 四欄完全相同的既有資料（至多 1 筆，因為名單不會有整列相同） */
export function findIdenticalRow(
  candidate: RecordFields, existing: readonly VehicleRecord[], excludeId?: number,
): VehicleRecord | undefined

/**
 * 存檔通知：只回報「這次存檔新造成」的種類。
 * 新增：findConflicts 全部。編輯：該種類的「比對鍵」有變動才通知——
 *   SAME_HEAD 鍵=headPlate；SAME_TAIL 鍵=tailPlate；SAME_ID_DIFF_NAME 鍵=(idNumber, ownerName)。
 * 鍵沒變＝原本就在那一組，不重複通知。
 */
export function noticesForSave(
  next: RecordFields, existing: readonly VehicleRecord[], previous?: VehicleRecord,
): DuplicateConflict[]
```

重複定義（對照 `duplicate-detection.feature`）：
- `SAME_HEAD`：≥2 筆 `headPlate` 相同。`SAME_TAIL`：≥2 筆 `tailPlate` 相同。
- `SAME_ID_DIFF_NAME`：同一 `idNumber` 下出現 ≥2 種不同 `ownerName`。同身分證同姓名（一人多車）不算。涉及的資料＝該身分證下的所有筆（含同姓名者）——此情況的範例未涵蓋，見待決問題 Q4。
- `SAME_ID_DIFF_NAME` 在**編輯**時的邊界（記錄，features 未涵蓋）：通知鍵是 (idNumber, ownerName)。若該身分證底下原本就有 A、B 兩個不同姓名，把 A 改成第三個姓名 C，鍵有變、仍與 B 衝突，會再通知一次。視為「新的一對衝突」，行為可辯護，維持現狀；若使用者認為吵，再改成「該身分證的不同姓名集合沒有新增衝突者不通知」。
- 一筆資料可同時屬於多種；同種類同值只算一組（三筆共用同一車頭＝1 組、涉及 3 筆）。
- 整列相同（`IDENTICAL_ROW`）不是重複種類而是「禁止」：名單中不會出現，故 `detectDuplicates` 不處理它。

### 3.3 查詢（`search.ts`，純函式）

```ts
/** keyword 先 trim；空字串回傳全部；任一欄位「包含」即符合，不分大小寫（toLowerCase）。保持原順序。 */
export function filterRecords(records: readonly VehicleRecord[], keyword: string): VehicleRecord[]
```

### 3.4 名單 CRUD（`records.ts`，idb；每個寫入函式是**單一 readwrite 交易**）

```ts
export type SaveFailure =
  | { ok: false; reason: 'INVALID'; errors: RecordValidation['errors'] }
  | { ok: false; reason: 'IDENTICAL_ROW'; existing: VehicleRecord }   // 整列相同：擋下，資料不變
  | { ok: false; reason: 'NOT_FOUND' }                                 // 僅 updateRecord
export interface SaveSuccess {
  ok: true
  record: VehicleRecord                // 已存入（trim 後）
  idWarning?: IdWarning                // 身分證警示（仍已存檔）
  notices: DuplicateConflict[]         // 新造成的重複通知；空陣列＝不顯示通知
}
export type SaveResult = SaveSuccess | SaveFailure

/** 驗證順序：INVALID → IDENTICAL_ROW → 寫入。複合 unique 若仍丟 ConstraintError（競態），轉成 IDENTICAL_ROW。 */
export function createRecord(input: RecordFields): Promise<SaveResult>
/** 只改 input 內的欄位值；id 與位置不變。與「自己」相同值不算整列相同。 */
export function updateRecord(id: number, input: RecordFields): Promise<SaveResult>
export function deleteRecord(id: number): Promise<void>        // 確認對話框屬 UI，不在此層
export function deleteAllRecords(): Promise<void>              // 供「全部刪除」與測試清空
export function listRecords(): Promise<VehicleRecord[]>        // id 升冪
// getRecord：已移除（C-1 建議 7，無呼叫端）

export interface Overview {
  duplicateGroups: Array<DuplicateGroup & { records: VehicleRecord[] }>
  idWarnings: Array<{ record: VehicleRecord; code: IdWarning }>   // 依 id 升冪
  isClean: boolean                                                 // 兩者皆空 → 「目前沒有重複與警示」
}
export function buildOverview(records: readonly VehicleRecord[]): Overview   // 純函式
// getOverview：已移除（C-1 建議 7，無呼叫端）；請用 buildOverview(await listRecords())
```

`db.ts`：`getDb(): Promise<IDBPDatabase>`（沿用 BloomIn 的單例＋`blocked`／`blocking` 處理），測試用 `resetDbForTest()` 可 `deleteDatabase`。

**IndexedDB 實作注意（給工程部，來自代碼審查員 B-1 建議 5）**
1. `createRecord`／`updateRecord`／`commitImport` 的交易內**只能 await idb 的請求**。夾進其他 await（例如動態 `import('xlsx')`、`TextDecoder` 之外的任何非 IDB promise）會讓交易自動提交。需要的 SheetJS 動作一律在開交易**之前**完成。
2. `add` 遇 `ConstraintError` 時交易會中止，`await tx.done` 也會 reject。必須接住（轉成 `IDENTICAL_ROW`），否則成為 unhandled rejection，vitest 會把整個 run 判失敗。
3. `resetDbForTest` 要先 `db.close()` 再 `deleteDatabase`，否則 blocked；或每個 scenario 換新的 `new IDBFactory()`（fake-indexeddb）。
4. 四欄複合 unique 可行：所有欄位保證為字串（空字串也是合法 key），不會有「值不是合法 key 而略過索引」的洞；`put` 更新自己不會與自己衝突。`getAll()` 為主鍵升冪，autoIncrement 不重用、`clear()` 不重置，與排序主張一致。

### 3.5 Excel 匯入（`excelRead.ts`＋`importer.ts`）

```ts
// ── 格式判定（純函式，fileFormat.ts）──
export type ImportFormat = 'xlsx' | 'xls' | 'csv'
export type ReadFailure =
  | { code: 'UNREADABLE'; hint?: 'SAVE_AS_CSV_UTF8' }  // hint 僅在「無 NUL 但不是合法 UTF-8」時給（Big5 等），UI 據此顯示「請以 CSV UTF-8 另存」
  | { code: 'EMPTY_FILE' }                             // 0 位元組、只有 BOM、或沒有任何非空白儲存格
  | { code: 'MISSING_HEADERS'; missing: string[] }     // 缺少的標題（中文，依 FIELD_ORDER），如 ['身分證']
export function detectFormat(bytes: Uint8Array): { ok: true; format: ImportFormat } | ({ ok: false } & ReadFailure)

// ── 讀檔 ──
/** fileRow：該列在檔案中的**實際列號**（1 起算；xlsx／xls＝工作表絕對列號，CSV＝記錄序號，空白記錄也計入）。
 *  標題列固定為第 1 列，故第一筆資料為第 2 列；列號一律為實際值。cells 為「顯示文字」，尚未 trim。 */
export interface RawRow { fileRow: number; cells: Record<FieldKey, string> }
export type ReadResult = { ok: true; format: ImportFormat; rows: RawRow[] } | ({ ok: false } & ReadFailure)
/** 總入口：detectFormat → 依格式取得字串格 → gridToRawRows。bytes 可為 ArrayBuffer 或 Uint8Array（內部一律正規化成 Uint8Array）。 */
export function readImportFile(bytes: ArrayBuffer | Uint8Array): ReadResult
/** 三格式共用的純函式（「各檔案格式規則一致」由同一份程式碼保證，而非三份各自實作）。 */
export function gridToRawRows(grid: ReadonlyArray<{ fileRow: number; cells: readonly string[] }>):
  { ok: true; rows: RawRow[] } | ({ ok: false } & ReadFailure)

// ── 預覽分類（純函式）──
export type RowCategory = 'NEW' | 'DUP_EXISTING' | 'DUP_IN_FILE' | 'FORMAT_ERROR'
export interface PreviewRow {
  fileRow: number
  fields: RecordFields                                   // trim 後（FORMAT_ERROR 亦然）
  category: RowCategory
  error?: { field: FieldKey; code: PlateReason | 'REQUIRED' }   // 僅 FORMAT_ERROR
  idWarning?: IdWarning                                  // 非 FORMAT_ERROR 才計算
  /** 重複種類，全部成立者，**順序固定**為 IDENTICAL_ROW, SAME_HEAD, SAME_TAIL, SAME_ID_DIFF_NAME（與 feature 寫法一致；step 可逐項比對）。DUP_EXISTING＝對既有資料；DUP_IN_FILE＝對檔內較前面的列。整列相同時含 IDENTICAL_ROW、SAME_HEAD、SAME_TAIL */
  kinds: RowConflictKind[]
  existingConflicts: DuplicateConflict[]                 // 對既有資料的衝突（含衝突的既有資料）
  inFileConflicts: Array<{ kind: DuplicateKind; value: string; fileRows: number[] }>  // 對檔內較前面列的衝突
  /** 與誰整列相同：兩種匯入選項都不會匯入此列 */
  identicalTo?: { source: 'EXISTING'; recordId: number } | { source: 'FILE'; fileRow: number }
}
export interface ImportPreview {
  rows: PreviewRow[]                                     // 檔案順序
  counts: { total: number; new: number; dupExisting: number; dupInFile: number; formatError: number } // 四類相加＝total
  identicalRows: number[]                                // 單獨列出的「整列相同」fileRow（預覽須告知兩選項皆不匯入）
  source: RawRow[]                                       // 供 commitImport 重算
}
export function buildPreview(rows: readonly RawRow[], existing: readonly VehicleRecord[]): ImportPreview

export type PreviewResult = { ok: true; preview: ImportPreview } | ({ ok: false } & ReadFailure)
/** readImportFile + listRecords + buildPreview；不寫入。rows 為空時 ok:true、counts.total=0（UI 顯示「沒有可匯入的資料」且不提供匯入選項）。 */
export function previewImport(bytes: ArrayBuffer | Uint8Array): Promise<PreviewResult>   // 內部呼叫 readImportFile

// ── 提交 ──
export type ImportMode = 'SKIP_DUPLICATES' | 'IMPORT_ALL'   // 略過重複／照樣匯入
export interface ImportResult { imported: number; skipped: number; formatErrorsNotImported: number }
/** 單一交易：讀目前名單→對 preview.source 重算分類（避免預覽後名單已變）→依檔案順序 add。放棄匯入＝不呼叫此函式。 */
export function commitImport(preview: ImportPreview, mode: ImportMode): Promise<ImportResult>
```

**分類演算法**（`buildPreview`；對每個資料列依檔案順序）：

1. 四欄 trim；用 `validateRecordInput` 取第一個不合的欄位 → `FORMAT_ERROR`。此列**不參與任何比對**（不當既有、也不當「較前面的列」）。
2. 其餘列：
   - 對既有資料有任一衝突（`findIdenticalRow` 或 `findConflicts` 非空）→ `DUP_EXISTING`。
   - 否則，對「檔內較前面的非格式錯誤列」（不論它們自己被分到哪一類）有任一衝突 → `DUP_IN_FILE`。
   - 否則 → `NEW`。
3. `identicalTo`：與既有資料或檔內較前面列四欄全同（既有優先）。
4. 同一人多車（同身分證同姓名）不算衝突。

由此推得使用者裁決：檔內重複組第一次出現者為 `NEW`；同時與既有及檔內重複者歸 `DUP_EXISTING`；只與 `DUP_EXISTING` 列重複的後面列歸 `DUP_IN_FILE`（A-gate 修訂 3）。

**提交規則**：

| 列 | `SKIP_DUPLICATES` | `IMPORT_ALL` |
|---|---|---|
| `NEW` | 匯入 | 匯入 |
| `DUP_EXISTING`／`DUP_IN_FILE`，`identicalTo` 有值 | 略過 | **略過** |
| `DUP_EXISTING`／`DUP_IN_FILE`，無 `identicalTo` | 略過 | 匯入 |
| `FORMAT_ERROR` | 不匯入，計入 `formatErrorsNotImported` | 同左 |

`imported + skipped + formatErrorsNotImported = counts.total`。身分證警示的列照常匯入。「沒有可進行匯入的選項」是 UI 規則，資料層以 `counts.total === 0` 表達（step 以此判斷）。

#### 3.5.1 讀檔規格

**格式判定順序**（`detectFormat`，取第一個成立者；副檔名完全不看）：

| 順序 | 條件 | 結果 |
|---|---|---|
| 1 | 長度 0 | `EMPTY_FILE` |
| 2 | 前 4 bytes＝`50 4B 03 04` | `xlsx` |
| 3 | 前 4 bytes＝`D0 CF 11 E0` | `xls` |
| 4 | 去掉開頭 BOM（`EF BB BF`）後長度 0 | `EMPTY_FILE`（只有 BOM） |
| 5 | 含任何 `0x00` | `UNREADABLE`（無 hint） |
| 6 | `new TextDecoder('utf-8', { fatal: true })` 解碼丟錯 | `UNREADABLE`＋`hint: 'SAVE_AS_CSV_UTF8'` |
| 7 | 其他 | `csv`（含合法 UTF-8 的純文字，之後因缺標題被拒絕） |

- 0 位元組一律先判 `EMPTY_FILE`，不論副檔名（解決 B-1 建議 2 的自相矛盾）。
- 第 5、6 步即「隨機二進位」的防線：SheetJS 不會替我們擋（見 §4），所以格式判定必須在交給 SheetJS 前完成。**測試 fixture 注意**：「隨機二進位資料」須確定性地含 `0x00` 或不合法 UTF-8 位元組（例如固定種子或直接寫死位元組），不要用未固定的隨機數，否則偶發落入「合法 UTF-8」而變成 `MISSING_HEADERS`。
- 已知限制（Big5）：極少數 Big5 位元組序列恰好也是合法 UTF-8，會被當 CSV 讀成亂碼並因缺標題被拒絕（`MISSING_HEADERS`），不會匯入亂碼資料，但不會出現「請以 CSV UTF-8 另存」的提示。屬可接受降級。

**取得字串格**（`readImportFile` 依格式）：

| 格式 | 作法 |
|---|---|
| `xlsx`／`xls` | `XLSX.read(bytes, { type: 'array' })`，try/catch，丟錯→`UNREADABLE`；`SheetNames` 為空或第一張表不存在→`UNREADABLE`。只讀**第一個**工作表。走 `ws['!ref']` 的 `decode_range` 逐列逐欄，列號＝絕對列號。每格文字＝`cell.w`，無 `w` 才退回 `String(cell.v)`，無此格＝`''`；**不用** `sheet_to_json`／`raw: true`。 |
| `csv` | 去 BOM → `TextDecoder`（已於判定步驟驗證合法）→ `parseCsv` 取得 `string[][]`，每筆記錄一列，`fileRow`＝記錄序號。**不經 SheetJS**（理由見 §4.2）。 |

**`gridToRawRows` 規則**（三格式共用；解決 B-1 建議 6）：
1. **標題列固定為檔案第 1 列**（附錄 Q-E 裁決）。整張表沒有任何 trim 後非空的儲存格→`EMPTY_FILE`（因此「合法但沒有任何儲存格內容」的 .xls／.xlsx、只有空白字元的 CSV 都是 `EMPTY_FILE`）；有內容但第 1 列空白→`MISSING_HEADERS`。
2. 標題儲存格先 `trim()` 再與 `COLUMN_TITLES` 比對（完全相等，不分全半形）。同一標題出現多次取**最左邊**。四個標題缺任何一個→`MISSING_HEADERS`，`missing` 依 `FIELD_ORDER` 列出（純文字會議紀錄會得到四個全缺，step 只需斷言包含「車頭」）。標題順序不拘、多餘欄忽略。
3. 標題列之後逐列：**四個對應欄位 trim 後皆空**的列略過（不計入 `counts.total`，也不佔用結果，但列號照算）；多餘欄的內容不影響這個判斷。只含空白的單一欄位不略過整列，由後續視為留空→`REQUIRED`。
4. 該列比標題列短（CSV 常見）→缺的格視為 `''`；比標題列長→多出的忽略。兩者皆與 .xlsx 一致。
5. `cells` 保持原樣不 trim（trim 在 `buildPreview`／`validateRecordInput`）。

**儲存格讀值**：`cell.w`（格式化後的顯示文字），不用 `raw: true`。**已實測（先前階段，僅 .xlsx）**：數字 7 套用格式 `000` → `"007"`；套用 General → `"7"`；文字儲存格 `"0012-007"` 原樣。**.xls 同款行為尚未實測**，見 §4.1 項目 T1。CSV 沒有儲存格型別，所有值是字串原樣（`007` 就是 `"007"`）。

### 3.6 匯出（`excelWrite.ts`＋`csv.ts`）

```ts
export type ExportFormat = 'xlsx' | 'xls' | 'csv'
export const EXPORT_FORMATS: Record<ExportFormat, { ext: string; mime: string }> = {
  xlsx: { ext: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  xls:  { ext: 'xls',  mime: 'application/vnd.ms-excel' },
  csv:  { ext: 'csv',  mime: 'text/csv;charset=utf-8' },
}

/** 全部資料（不受查詢影響），欄序＝FIELD_ORDER，列序＝id 升冪。空名單只有標題列。沒有額外欄位，不含 id。 */
export function buildExportBytes(records: readonly VehicleRecord[], format: ExportFormat): Uint8Array   // 純函式
export function exportRecords(format: ExportFormat = 'xlsx'): Promise<{ bytes: Uint8Array; count: number; fileName: string; mimeType: string; format: ExportFormat }>
export function exportFileName(now: Date, format: ExportFormat = 'xlsx'): string   // 'ochema-名單-YYYYMMDD-HHmm.<ext>'，沿用 BloomIn backupFileName 風格
```

預設格式 `'xlsx'`（製片人裁決 1）；畫面預設也選 .xlsx。

| 格式 | 寫法 | 前導 0 的保留方式 |
|---|---|---|
| `xlsx` | `XLSX.write(wb, { type: 'array', bookType: 'xlsx' })`；每個值為 `{ t: 's', v }`；工作表名「名單」 | 文字儲存格 |
| `xls` | 同上但 `bookType: 'biff8'`（BIFF8，Excel 97–2003） | 文字儲存格（LABELSST） |
| `csv` | 自寫 `serializeCsv`：位元組以 **UTF-8 BOM（`EF BB BF`）**開頭；標題列＋資料列；欄分隔 `,`；記錄分隔 `\r\n`（每筆含最後一筆都以 `\r\n` 結尾）；`TextEncoder` 編成 UTF-8 | CSV 本身無型別，值就是字串原樣 |

- **CSV 引號規則**：值含 `,`、`"`、`\r`、`\n`，或前後有空白時，以 `"` 包住，內部 `"` 寫成 `""`；其餘不加引號。值一律原樣，**不 trim、不轉義公式字元**（features「特殊字元原樣匯出」）。
- 空名單：三種格式都只有標題列（CSV＝BOM＋標題行），可被 `previewImport` 讀回且 `counts.total === 0`。
- 工作表／檔案只有一份資料集；匯出不含 `id`；匯出再匯入後 id 重新配發，但順序與四欄內容完全還原（三種格式皆然）。
- 觸發下載（Blob＋`<a download>`，MIME 取 `mimeType`）屬 UI，不在資料層。
- 已知限制：(a) `.xls` 工作表上限 65,536 列，名單超過時 SheetJS 行為未實測（現實名單規模遠低於此）；(b) CSV 用 Excel 直接開啟後再存檔，Excel 會把 `007` 變成 `7`、把 `=...` 開頭的姓名當公式——這是 Excel 對 CSV 的行為，不是檔案內容的錯；見 §7 待決。

---

## 4. 檔案函式庫選型（.xlsx／.xls／CSV）

必要條件：(a) 能讀「儲存格顯示文字」；(b) 能寫出文字儲存格以保留前導 0；(c) 可離線打包（純前端、無執行期網址）；(d) 在 jsdom／Node 可測。

| 候選 | (a) 顯示文字 | (b) 文字寫出 | (c) 離線打包 | (d) Node 可測 | 其他 |
|---|---|---|---|---|---|
| **SheetJS CE `xlsx`（0.20.3）** | **通過**（`cell.w`；實測 7＋格式 `000`→`"007"`） | **通過**（`{t:'s'}`；實測 `"0012-007"` 往返不變） | 通過（單一純 JS 套件，無 Node 專用相依） | 通過 | 讀寫同一套 API（含 .xls：`biff8`）；空白檔、截斷 ZIP 都能判斷（均為 .xlsx 實測）；**隨機二進位不丟錯**（當 CSV 解析），須先判定格式；**.xls 部分尚未實測**，見 §4.1 |
| ExcelJS 4.4.0 | **不通過**（實測同一份檔 `cell.text` 回 `"7"`，不套用數字格式） | 通過 | 較差（解包 21 MB，相依 archiver／tmp／fast-csv 等 Node 套件，bundler 設定麻煩） | 通過 | 2024-12 後無新版 |
| read-excel-file 9.3.14＋write-excel-file 4.1.1 | **不通過**（實測數字儲存格回傳 number `7`，沒有格式化文字） | 通過 | 通過（相依 fflate，小） | 通過 | 兩個套件；讀端缺口是硬傷 |
| 自行用 fflate 解 xlsx XML | 需自己實作數字格式（`000`、`0.00`、日期…） | 需自己組 XML | 通過 | 通過 | 工作量與風險遠大於收益，不採用 |

**選擇：SheetJS CE `xlsx` 0.20.3，用於 .xlsx 與 .xls 的讀寫；CSV 不經 SheetJS（§4.2）。** 唯一同時滿足 (a)(b) 的選項，而 (a) 是情境「數字型儲存格讀取顯示的文字」的硬需求。上表的比較實測只針對 .xlsx；ExcelJS 與 read-excel-file 本來就不支援讀 .xls，所以新增 .xls 需求後 SheetJS 更是唯一選項。

### 4.1 注意事項與「待工程部實測」清單

**狀態說明**：「已實測」＝架構師先前階段在暫存目錄對 0.20.3（僅 .xlsx）的實測結論；**證據腳本與輸出未存檔**（代碼審查員 B-1 指出 `.studio/evidence/` 為空，且他沒有獨立重現）。這次範圍調整後架構師**不再下載、安裝或執行任何外部程式碼**，所以下表所有項目都由工程部在第一個測試中驗證；驗證失敗時照「備案」欄處理。

1. **版本來源與入庫**：npm 上的 `xlsx` 停在 0.18.5，帶有已知漏洞（CVE-2023-30533 原型污染、CVE-2024-22363 ReDoS），**不可使用**。修正版只發佈在 `cdn.sheetjs.com`。決定（製片人）：把 tgz 放進 repo 的 `vendor/xlsx-0.20.3.tgz`（由使用者下載，來源 `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`），`package.json` 以 `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` 參照，lockfile 記錄 integrity，CI 與重建不依賴外網；執行期完全離線。
   - **SHA-256 基準值**：`8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`（製片人交接單提供；代碼審查員 B-1 獨立下載後計算也得到同值，2.4 MB，Apache-2.0）。
   - **工程部入庫時必做**：`shasum -a 256 vendor/xlsx-0.20.3.tgz` 與上值比對，不符不得入庫；換版時同時更新此處。**本次架構師沒有取得 tgz，未做此驗證。**
2. **先驗格式再交給 SheetJS**：見 §3.5.1。已實測：隨機二進位會被 SheetJS 當純文字解析而不丟錯，所以 `detectFormat` 必須先擋；截斷的 ZIP 會丟錯。
3. **I/O 型別**：`XLSX.read(bytes, { type: 'array' })`、`XLSX.write(wb, { type: 'array', bookType })`，避免 `Buffer`。寫出的結果以 `new Uint8Array(out)` 正規化。jsdom 的 `Blob`／`File` 可能沒有 `arrayBuffer()`，UI 以 `FileReader` 取 `ArrayBuffer` 後再呼叫資料層；測試端傳 `ArrayBuffer`／Node 的 `Uint8Array`。jsdom 與 Node 之間的跨 realm `instanceof Uint8Array` 可能失敗——`readImportFile` 對輸入用 `ArrayBuffer.isView` 或 `new Uint8Array(input)` 判斷，不用 `instanceof`。
4. **打包大小未實測**（SheetJS 壓縮後約數百 KB 量級為估計）。因離線需求無論如何都要進 PWA precache；建議 `import('xlsx')` 動態載入以免拖慢首次畫面（動態 import 須在 IndexedDB 交易之外完成，見 §3.4）。
5. **測試造檔**：「完全空白檔」xlsx 用 `aoa_to_sheet([])`（已實測讀回 `!ref` 為 undefined）；「損毀 .xlsx」用 `PK\x03\x04`＋雜訊或截斷真實檔（已實測兩者皆丟錯）。helper 見本文件開頭的測試例外。

**待工程部實測清單**（SheetJS 相關，皆尚未驗證）：

| # | 要驗證的行為 | 預期 | 若 SheetJS 做不到的備案 |
|---|---|---|---|
| T1 | **.xls 數字儲存格顯示文字**：數字 7＋格式 `000` 讀 `cell.w` 得 `"007"`；General 得 `"7"`（情境「.xls 的數字型儲存格…」） | `w` 與 .xlsx 同款產生 | `w` 缺失時用 `XLSX.SSF.format(cell.z, cell.v)` 自行格式化（`SSF` 隨套件匯出，**其存在與行為也待驗證**）；仍不行 → 回報架構部，該情境改為只驗證 General，並請使用者裁決是否接受「.xls 數字格式化不支援」。**不得**默默退回 `String(cell.v)` 而讓 `007` 變 `7`。 |
| T2 | **.xls 讀取中文與特殊字元**（BIFF8 Unicode 字串；`"李""美玲"`、逗號） | 原樣 | 無合理備案（不自寫 BIFF 解析器）；失敗即升級使用者。 |
| T3 | **.xls 寫出（`bookType: 'biff8'`）再讀回**：文字儲存格前導 0（`0012-007`、`007`）、特殊字元、空名單只有標題列皆原樣 | 原樣 | 無合理備案；失敗 → 升級使用者，選項：移除 .xls 匯出，或接受限制。 |
| T4 | **前後空白往返**（僅影響測試 fixture，見下）：xlsx 寫出 `" 929-X2 "`、`"   "` 再讀回是否保留（需 `xml:space="preserve"`）；.xls 同測 | 保留 | xlsx：fixture 先寫出再用 fflate 解壓、直接改 `sharedStrings.xml`／`sheet1.xml` 補上 `xml:space="preserve"`；或以 CSV／.xls 驗證空白情境（規則共用同一個 `gridToRawRows`，單元測試即可覆蓋）。 |
| T5 | **截斷的 .xls（D0 CF 11 E0 開頭）是否丟錯**；**有效但無儲存格的 .xls** 能否由 `aoa_to_sheet([])`＋`biff8` 產生並讀回為「無儲存格」（區分 `UNREADABLE` 與 `EMPTY_FILE`） | 截斷丟錯；空表讀回 `!ref` 為 undefined | 截斷不丟錯 → 加判斷：檔案長度 < 512，或 `(長度 − 512) % 512 !== 0` 且讀回 `SheetNames` 為空 → `UNREADABLE`（此啟發式可能誤殺未補齊最後磁區的真實 .xls，工程部須用真實 .xls 範例確認）；fixture 以「從有效 .xls 在磁區邊界之外截斷」造。 |
| T6 | **PK 開頭但不是 xlsx**（`PK\x03\x04`＋雜訊、其他 ZIP）：丟錯或 `SheetNames` 為空 | 丟錯（先前實測 PK＋雜訊丟錯） | 已由 §3.5.1 的「`SheetNames` 為空或第一表不存在→`UNREADABLE`」兜底。 |
| T7 | **`XLSX.write(..., { type: 'array' })` 的回傳型別**（`ArrayBuffer` 或 `Uint8Array`）與 jsdom 相容 | 可 `new Uint8Array(out)` | 改 `type: 'buffer'` 僅限 Node 測試環境；瀏覽器端不可用 Buffer，需另行包裝。 |
| T8 | **`import('xlsx')` 的 ESM 在 vitest（jsdom）與 Vite 打包下可用**；實際 bundle 大小 | 可 | 改靜態 import（犧牲首次載入）。 |
| T9 | **`cell.w` 對 `t:'s'` 文字格 = 字串原樣**（含 xlsx 共享字串、含前導 0、含全形字元） | 是 | 退回 `String(cell.v)`（文字格的 `v` 就是字串，安全）。 |

> 若 T1、T2、T3 任一失敗且無備案，**這是範圍層級問題**（使用者要求的 .xls 支援不成立），工程部須停手回報製片人，不要自行縮減。

### 4.2 CSV：自寫 RFC 4180，不用 SheetJS（取捨）

| | SheetJS 解析 CSV | **自寫 `csv.ts`（採用）** |
|---|---|---|
| 保持字串、不轉數字 | 預設會把 `007` 轉成數字 7，須 `raw: true` 且仍有其他自動型別推斷細節**待驗證** | 天生都是字串，不會轉型 |
| UTF-8 驗證／Big5 提示 | 需另外用 `TextDecoder({fatal:true})` 先驗；SheetJS 對 `type:'array'` 的 CSV 編碼推斷（是否預設 UTF-8、是否需 `codepage: 65001`）**待驗證** | 判定階段已用 `TextDecoder` 驗證並解碼，無歧義 |
| 少欄／多欄、引號內換行 | 行為待驗證 | 規格明確，單元測試可完整覆蓋 |
| 成本 | 零行程式碼 | 約 40 行狀態機＋序列化約 10 行（確定性邏輯，非判斷工作） |

**採用自寫**。理由：格式判定本來就必須自己做 UTF-8 驗證（見 §3.5.1），讀端沒有使用 SheetJS 的優勢，卻要為 `raw`／`codepage` 的未驗證行為負責；匯出端同理，BOM 與引號規則自寫最直接。這是架構判斷而非實測結論，若工程部更傾向用 SheetJS，需先驗證上表三個「待驗證」格。

**`parseCsv(text): string[][]` 規格**：
- 欄分隔只認 `,`（不自動偵測 `;`、Tab——Excel 台灣地區「CSV UTF-8」存檔即逗號）。
- 記錄分隔接受 `\r\n`、`\n`、`\r`；檔尾的最後一個換行不產生額外空記錄；中間的空行是一筆只含 `['']` 的記錄（列號照算，之後被 `gridToRawRows` 當空白列略過）。
- 以 `"` 開頭的欄位為引號欄：內部 `""`→`"`；可含 `,`、換行（換行原樣保留）。引號欄結束後到下一個分隔符之間的雜字元，原樣附加（寬鬆）。
- 非引號欄中出現的 `"` 視為一般字元（寬鬆）。
- **引號欄沒有收尾（直到檔尾）→ 丟 `CsvError`，`readImportFile` 轉成 `UNREADABLE`**。這是 features 未涵蓋的情況，由架構師定為嚴格（寧可拒絕也不匯入被吞掉的資料），列入 §7 待決供確認。
- 不 trim、不轉型。

---

---

## 5. 追溯表

欄位說明：函式＝該情境斷言所依賴的資料層函式；表＝`vehicle_records`（`—` 表示不涉及資料表，`@table:none`）。「純」表示不碰 IndexedDB。

### 5.1 `@api` 情境（逐一對應）

> 情境總數 141（原 110＋範圍變更新增 31）。新增 31＝`@api` 26（import 17、export 9）＋`@ui` 5（import 2、export 3）。製片人／產品部回報書中「+16／+11、137」是以 Outline 計數的誤差；以 `Scenario`／`Scenario Outline` 標題逐一計數為 141。驗證腳本：對 `features/*.feature` 取全部情境標題，逐一檢查是否出現在本章（缺漏 0）。

**field-validation.feature**

| 情境 | 函式 | 表 |
|---|---|---|
| 合格的車牌格式 | `checkPlate`（純） | vehicle_records |
| 不合格的車牌格式一律擋下 | `checkPlate`（純） | vehicle_records |
| 車牌前後空白先去除再檢查 | `checkPlate`（純） | vehicle_records |
| 身分證前後空白先去除再檢查 | `checkIdNumber`（純） | vehicle_records |
| 身分證檢查碼正確則不警示 | `checkIdNumber`（純） | vehicle_records |
| 身分證不合格只警示，不阻擋 | `checkIdNumber`（純；「仍可存檔」＝`status:'warn'`，`createRecord` 不因它拒收） | vehicle_records |
| 身分證中間含空白只警示，不阻擋 | `checkIdNumber`（純） | vehicle_records |

**duplicate-detection.feature**

| 情境 | 函式 | 表 |
|---|---|---|
| 同一車頭出現在多筆資料 | `detectDuplicates`（`listRecords` 供資料） | vehicle_records |
| 同一車尾出現在多筆資料 | `detectDuplicates` | vehicle_records |
| 同一身分證對應到不同姓名 | `detectDuplicates` | vehicle_records |
| 同一人擁有多台車不算重複 | `detectDuplicates` | vehicle_records |
| 沒有重複的名單 | `detectDuplicates` | vehicle_records |
| 只有一筆資料時不會與自己重複 | `detectDuplicates` | vehicle_records |
| 一筆資料同時符合多種重複 | `detectDuplicates`（`byRecordId`） | vehicle_records |
| 三筆共用同一車頭視為同一組 | `detectDuplicates` | vehicle_records |
| 比對為原樣比對，不同的字串不算重複 | `detectDuplicates` | vehicle_records |

**excel-import.feature**

| 情境 | 函式 | 表 |
|---|---|---|
| 預覽：檔案內容全部都能新增 | `previewImport`、`listRecords` | vehicle_records |
| 預覽：與既有資料重複的列，四種重複各自歸為「與既有重複」 | `previewImport`（`kinds`、`existingConflicts`） | vehicle_records |
| 預覽：檔內重複，第一次出現者算可新增、其餘算檔內重複 | `previewImport`（`inFileConflicts`） | vehicle_records |
| 預覽：同時與既有資料及檔內其他列重複的列，歸為「與既有重複」 | `previewImport` | vehicle_records |
| 預覽：後出現的列同時符合既有重複與檔內重複時歸既有，先出現的列仍算可新增 | `previewImport` | vehicle_records |
| 預覽：每一列只屬於一類，各類筆數相加等於資料列數 | `previewImport`（`counts`） | vehicle_records |
| 預覽：同一人多台車的列不算重複 | `previewImport` | vehicle_records |
| 預覽：車牌格式或必填有問題的列為錯誤列 | `previewImport`（`error.code`） | vehicle_records |
| 預覽：單獨列出整列相同的列，並告知兩種選項都不會匯入 | `previewImport`（`identicalRows`、`identicalTo`） | vehicle_records |
| 整列相同的列在兩種選項下都不匯入，其餘依選項處理 | `previewImport`、`commitImport` | vehicle_records |
| 預覽：只與「與既有重複的列」重複的後面列，歸為檔內重複，略過重複時兩列都不匯入 | `previewImport`、`commitImport` | vehicle_records |
| 小寫車牌不會被自動轉成大寫，照樣匯入也不匯入 | `previewImport`、`commitImport`（`formatErrorsNotImported`） | vehicle_records |
| 前後空白自動去除後再檢查與比對 | `readImportFile`（不 trim）、`buildPreview`（trim）、`commitImport` | vehicle_records |
| 只含空白的儲存格視為留空 | `previewImport`（`REQUIRED`） | vehicle_records |
| 數字型儲存格讀取顯示的文字 | `readImportFile`（`cell.w`）、`commitImport` | vehicle_records |
| 數字型儲存格的值不符車牌格式時為錯誤列 | `readImportFile`、`previewImport` | vehicle_records |
| 預覽：身分證不合格的列只警示，仍算可新增 | `previewImport`（`idWarning`） | vehicle_records |
| 預覽：一列同時有格式錯誤與重複時，以格式錯誤為準 | `previewImport`（FORMAT_ERROR 不參與比對） | vehicle_records |
| 缺少必要的欄位標題時整份檔案不接受 | `readImportFile`（`MISSING_HEADERS`） | vehicle_records |
| 欄位順序與匯出不同，仍依標題對應 | `readImportFile` | vehicle_records |
| 只有標題列、沒有資料列的檔案 | `previewImport`（`counts.total=0`） | vehicle_records |
| 完全空白的檔案 | `readImportFile`（`EMPTY_FILE`） | vehicle_records |
| 不是 Excel 的檔案 | `readImportFile`（`UNREADABLE`；`detectFormat`） | vehicle_records |
| 選擇略過重複：與既有資料重複的列不匯入 | `commitImport('SKIP_DUPLICATES')` | vehicle_records |
| 略過重複：檔內重複組只保留第一次出現的那一列 | `commitImport('SKIP_DUPLICATES')` | vehicle_records |
| 混合檔案：略過重複與照樣匯入的匯入筆數與保留的列 | `commitImport` 兩種模式、`listRecords`（id 序） | vehicle_records |
| 選擇照樣匯入：與既有資料的同車頭、同車尾、同身分證不同姓名照樣匯入 | `commitImport('IMPORT_ALL')` | vehicle_records |
| 選擇照樣匯入：檔內的同車頭、同車尾、同身分證不同姓名兩列都匯入 | `commitImport('IMPORT_ALL')` | vehicle_records |
| 照樣匯入：與既有資料四欄完全相同的整列不匯入 | `commitImport('IMPORT_ALL')`（`identicalTo`） | vehicle_records |
| 照樣匯入：檔內四欄完全相同的整列只保留第一列 | `commitImport('IMPORT_ALL')` | vehicle_records |
| 照樣匯入：格式錯誤的列仍然不匯入 | `commitImport('IMPORT_ALL')` | vehicle_records |
| 身分證不合格的列在略過重複時照常匯入 | `commitImport('SKIP_DUPLICATES')` | vehicle_records |
| 預覽後放棄，名單不變 | `previewImport`（唯讀；不呼叫 `commitImport`） | vehicle_records |

**excel-export.feature**

| 情境 | 函式 | 表 |
|---|---|---|
| 匯出檔的標題與欄位順序 | `exportRecords`／`buildExportBytes` | vehicle_records |
| 所有值以文字保留，前導 0 不消失 | `buildExportBytes(…, 'xlsx')`（`t:'s'`） | vehicle_records |
| 重複與警示的資料也如實匯出 | `exportRecords` | vehicle_records |
| 匯出後再匯入能完整還原 | `exportRecords`、`deleteAllRecords`、`previewImport`、`commitImport('IMPORT_ALL')`、`listRecords` | vehicle_records |
| 含重複的名單匯出再匯入，選擇照樣匯入仍能完整還原 | 同上 | vehicle_records |
| 名單為空時匯出只有標題列的範本檔 | `exportRecords` | vehicle_records |
| 空名單匯出的範本檔可再匯入，預覽告知沒有可匯入的資料 | `exportRecords`、`previewImport`（`counts.total=0`） | vehicle_records |
| 含特殊字元的姓名原樣匯出 | `buildExportBytes` | vehicle_records |

**excel-import.feature — 範圍變更新增（.xls／CSV，17 個 `@api`）**

| 情境 | 函式 | 表 |
|---|---|---|
| 舊式 .xls 檔可預覽並匯入 | `previewImport`、`commitImport`（`readImportFile` 走 xls 分支） | vehicle_records |
| .xls 的數字型儲存格同樣讀取顯示的文字 | `readImportFile`（`cell.w`；**待實測 T1**）、`commitImport` | vehicle_records |
| UTF-8 CSV 可預覽並匯入，不論有無 BOM；前導 0 保留為字串 | `detectFormat`、`parseCsv`、`previewImport`、`commitImport` | vehicle_records |
| CSV 的欄位內含逗號、被引號包住的欄位依規則解析 | `parseCsv`（引號欄、`""`）、`commitImport` | vehicle_records |
| 非 UTF-8 的 CSV 不接受，提示以 CSV UTF-8 另存 | `detectFormat`（`UNREADABLE`＋`hint: 'SAVE_AS_CSV_UTF8'`） | vehicle_records |
| 隨機二進位資料或損毀的檔案，不論副檔名一律無法讀取 | `detectFormat`（NUL／非 UTF-8）；截斷 .xls 見 **T5** | vehicle_records |
| 檔案格式依內容判定，不看副檔名 | `detectFormat`（只看位元組） | vehicle_records |
| 各檔案格式的預覽分類規則一致 | `previewImport`／`buildPreview`（三格式共用 `gridToRawRows`） | vehicle_records |
| 各檔案格式的匯入選項規則一致 | `commitImport` | vehicle_records |
| 各檔案格式都依標題名稱對應欄位，與欄位順序無關 | `gridToRawRows` | vehicle_records |
| 各檔案格式缺少必要的欄位標題時整份檔案不接受 | `gridToRawRows`（`MISSING_HEADERS`） | vehicle_records |
| 各檔案格式只有標題列、沒有資料列時告知沒有可匯入的資料 | `previewImport`（`counts.total=0`） | vehicle_records |
| 各檔案格式完全空白的檔案不接受，告知檔案是空的 | `detectFormat`（長度 0、只有 BOM）、`gridToRawRows`（無非空白列）→ `EMPTY_FILE`；有效空 .xls 見 **T5** | vehicle_records |
| 各檔案格式的前後空白自動去除後再檢查與比對 | `readImportFile`（不 trim）、`buildPreview`（trim）；xlsx／xls fixture 見 **T4** | vehicle_records |
| 合法 UTF-8 的純文字檔（非表格）依 CSV 讀取，因缺標題被拒絕 | `detectFormat`→`csv`、`gridToRawRows`（`MISSING_HEADERS`） | vehicle_records |
| CSV 某列欄位少於標題列時，缺的欄位視為空白，必填缺漏成為格式錯誤 | `gridToRawRows`（規則 4）、`previewImport`（`REQUIRED`） | vehicle_records |
| CSV 某列欄位多於標題列時，多出的欄位忽略，該列照常處理 | `gridToRawRows`（規則 4） | vehicle_records |

**excel-export.feature — 範圍變更新增（三格式，9 個 `@api`）**

| 情境 | 函式 | 表 |
|---|---|---|
| 各格式匯出檔的標題與欄位順序一致 | `buildExportBytes(…, fmt)`；讀回驗證用測試 helper（xlsx／xls 用 `xlsx`，CSV 用 `parseCsv`） | vehicle_records |
| 各格式匯出的值都以文字保留，前導 0 不消失 | 測試 helper 檢查 `t:'s'`（xlsx／xls，**T3**）；CSV 檢查原始文字 | vehicle_records |
| CSV 匯出為帶 BOM 的 UTF-8 | `buildExportBytes(…, 'csv')`（前 3 bytes＝`EF BB BF`） | vehicle_records |
| CSV 匯出時，含逗號與引號的值以引號包住並原樣還原 | `serializeCsv`、`parseCsv`（往返） | vehicle_records |
| 各格式匯出後再匯入能完整還原 | `exportRecords(fmt)`、`deleteAllRecords`、`previewImport`、`commitImport('IMPORT_ALL')`、`listRecords` | vehicle_records |
| 各格式匯出含重複的名單再匯入，選擇照樣匯入仍能完整還原 | 同上 | vehicle_records |
| 名單為空時各格式都匯出只有標題列的範本檔 | `exportRecords(fmt)` | vehicle_records |
| 各格式空名單匯出的範本檔可再匯入，預覽告知沒有可匯入的資料 | `exportRecords(fmt)`、`previewImport`（`counts.total=0`） | vehicle_records |
| 各格式匯出含特殊字元的姓名都原樣保留 | `buildExportBytes(…, fmt)`、`readImportFile`（xls 見 **T2**／**T3**） | vehicle_records |

**offline-use.feature（`@api @table:none`，不屬資料層）**

| 情境 | 驗證對象 | 表 |
|---|---|---|
| 建置產物預先快取 App 外殼與所有執行時資源 | 建置產物（`dist/` 的 precache manifest），工程部的建置檢查 | — |
| 執行時所需資源不依賴外部網址 | 建置產物掃描 | — |
| 建置產物具備可安裝的 Web App 資訊 | `manifest.webmanifest`、service worker | — |
| 新版本更新期間不中斷目前操作，也不遺失資料 | service worker 更新設定；資料層側的保證：`upgrade()` 只做增量建立、不清除（`db.ts`） | — |

### 5.2 `@ui` 情境（依賴的資料層函式，按檔案分組）

| Feature／情境 | 依賴函式 | 表 |
|---|---|---|
| record-management：新增、必填、空白、小寫車牌、車牌中間空白、前後空白、身分證警示 | `createRecord`（`INVALID`／`idWarning`）、`validateRecordInput` | vehicle_records |
| record-management：編輯、編輯去空白、編輯被擋、放棄修改 | `updateRecord`、`getRecord`（放棄＝不呼叫） | vehicle_records |
| record-management：刪除、取消刪除 | `deleteRecord`（確認屬 UI） | vehicle_records |
| record-management：重新開啟後仍在、空狀態 | `listRecords` | vehicle_records |
| field-validation：名單標示身分證警示、修正後消失 | `checkIdNumber`／`getOverview`（衍生、不入庫） | vehicle_records |
| duplicate-detection：新增／編輯造成重複並告知種類與衝突資料 | `createRecord`／`updateRecord` 的 `notices` | vehicle_records |
| duplicate-detection：整列相同擋下（新增、去空白後、編輯） | `createRecord`／`updateRecord` → `IDENTICAL_ROW`＋`existing`；`getOverview().isClean` | vehicle_records |
| duplicate-detection：不造成重複不通知、編輯不動衝突欄位不誤報 | `noticesForSave`（經 `createRecord`／`updateRecord`） | vehicle_records |
| duplicate-detection：名單持續標示、重開仍在、刪除後消失、編輯解除、三筆剩兩筆 | `detectDuplicates`（`byRecordId`）、`listRecords`、`deleteRecord` | vehicle_records |
| duplicate-detection：總覽（有／無問題） | `getOverview` | vehicle_records |
| search：全部 7 個情境 | `filterRecords`、`listRecords`（編輯後查詢條件保持屬 UI 狀態） | vehicle_records |
| excel-import：照樣匯入後標示重複、畫面預覽並匯入 | `previewImport`、`commitImport`、`detectDuplicates` | vehicle_records |
| excel-export：畫面匯出、空名單範本、篩選中仍匯出全部 | `exportRecords`（`count` 供「已匯出 N 筆」；不吃查詢條件） | vehicle_records |
| excel-import（新增）：在畫面上選擇 .xls 或 CSV 檔預覽並匯入 | `previewImport`、`commitImport`（檔案以 `FileReader` 取 `ArrayBuffer`） | vehicle_records |
| excel-import（新增）：在畫面上選擇 Big5 CSV，提示以 CSV UTF-8 另存 | `previewImport` 回 `{ code: 'UNREADABLE', hint: 'SAVE_AS_CSV_UTF8' }`；UI 據 `hint` 顯示提示、不顯示預覽與匯入選項 | vehicle_records |
| excel-export（新增）：未選格式預設取得 .xlsx | `exportRecords()`（預設 `'xlsx'`） | vehicle_records |
| excel-export（新增）：在畫面上選擇格式匯出並取得對應檔案 | `exportRecords(fmt)`（`fileName` 副檔名、`mimeType`） | vehicle_records |
| excel-export（新增）：篩選中各格式匯出仍是全部資料 | `exportRecords(fmt)`（不吃查詢條件） | vehicle_records |
| offline-use：無網路查詢／新增／匯出／預覽匯入 | `filterRecords`、`createRecord`、`exportRecords`、`previewImport`／`commitImport`（資料層不發任何網路請求，SheetJS 為打包內容） | vehicle_records |
| offline-use：所有操作都不對外發出網路請求 | 同上全部函式 | vehicle_records |
| offline-use：畫面說明資料只存在這台裝置並提醒備份 | 無（純 UI 文案） | — |

---

## 6. 原因代碼與 features 註解的一致性

| 來源 | 代碼 | 本文件 |
|---|---|---|
| field-validation 檔頭（車牌 8 個） | `PLATE_LOWERCASE`、`PLATE_FULLWIDTH`、`PLATE_NO_HYPHEN`、`PLATE_MULTI_HYPHEN`、`PLATE_EMPTY_PART`、`PLATE_INNER_WHITESPACE`、`PLATE_INVALID_CHAR`、`REQUIRED` | `PlateReason`，優先序同註解 |
| field-validation 檔頭（身分證 6 個） | `ID_CHECKSUM`、`ID_LENGTH`、`ID_LOWERCASE`、`ID_FIRST_NOT_ALPHA`、`ID_NON_DIGIT`、`ID_LEGACY_RESIDENCE` | `IdWarning`，優先序同註解 |
| duplicate-detection／excel-import | 同車頭／同車尾／同身分證不同姓名／整列相同 | `SAME_HEAD`／`SAME_TAIL`／`SAME_ID_DIFF_NAME`／`IDENTICAL_ROW`（features 內是中文，代碼為本文件命名，工程部可調整，但須一對一） |

匯入預覽的四類（可新增／與既有重複／檔內重複／格式錯誤）＝`NEW`／`DUP_EXISTING`／`DUP_IN_FILE`／`FORMAT_ERROR`。

---

## 7. 待決問題與變更記錄

### 7.1 本次（階段 2a 範圍調整後）契約變更

1. 讀檔：新增 `detectFormat` 判定順序、`readImportFile`（取代 `readWorkbook`）、三格式共用 `gridToRawRows`、CSV 自寫解析；新增 `hint: 'SAVE_AS_CSV_UTF8'`。
2. 匯出：`exportRecords(format)`、`buildExportBytes`、`exportFileName(now, format)`、MIME 與副檔名表、CSV UTF-8＋BOM。
3. 追溯表補上 31 個新增情境；既有列的函式名同步更名。
4. 吸收 B-1 建議 2–10（對照：2→§3.5.1 判定順序；3→開頭測試例外；4→§3.5 提交規則末句；5→§3.4 注意；6→§3.5.1 規則 1–3；7→`kinds` 順序；8→§3.2；9、10→§4.1 項 1；1→§2）。
5. SheetJS 相關行為全部標「待工程部實測」（§4.1 T1–T9），附備案。

### 7.2 待決（涉及商業意圖，架構師未自行決定）

- **Q-A（已結案）**：`schema.dbml` 於門禁 B 鎖定前已移除長度（製片人修正），無待決。
- **Q-B**：CSV 引號欄沒有收尾（資料被吞掉）時，目前定為 `UNREADABLE`（嚴格）。features 未涵蓋；是否同意？
- **Q-C**：CSV 匯出的「公式注入」：姓名以 `=`、`+`、`-`、`@` 開頭時，Excel 直接開 CSV 會當公式。features 要求原樣匯出，契約照做不轉義。是否接受此風險（個人離線工具、資料為自己輸入），或允許 CSV 另加單引號前綴（會破壞「原樣還原」）？
- **Q-D**：CSV 用 Excel 直接開啟再存檔會讓前導 0 消失（`007`→`7`）。這是 Excel 行為；UI 是否要在 CSV 匯出旁加一句提示（建議用 .xlsx 或 .xls 保留前導 0）？
- **Q-E**：標題列「第一個非空白列」而非固定第 1 列（B-1 建議 6 要求寫死）。features 描述為「第一列」，此為對「前面有空白列」情況的延伸；是否同意？
- **Q4（沿用）**：`SAME_ID_DIFF_NAME` 涉及的資料含該身分證下所有筆（含同姓名者），features 範例未涵蓋；目前採含所有筆。
- **Q-F**：.xls 匯出超過 65,536 列的行為未定義（現實不會發生）；是否需要上限檢查？建議不做。


## 附錄：製片人裁決（契約待決 §7.2，2026-11-09）
- Q-B：引號未收尾 → UNREADABLE。
- Q-C：CSV 不做公式注入轉義（features 要求原樣），列為已知風險。
- Q-D：UI 選 CSV 匯出時顯示前導 0 提示。
- Q-E：**不採用「第一個非空白列」**；標題列固定為第 1 列，依 features 字面。`gridToRawRows` 須照此實作。
- Q-F：.xls 匯出超過 65,536 列時告知改用 .xlsx。
- Big5 誤判為 UTF-8 的降級：接受。
- Q-E 邊界：標題列固定為檔案第 1 列。整張表沒有任何非空白儲存格 → EMPTY_FILE；有內容但第 1 列空白 → MISSING_HEADERS（缺四個標題）。

## 附錄：製片人裁決（工程部紅燈待決，2026-11-09）
- 匯入確認（更正，鎖定情境優先）：兩個選項一律顯示、不預選；預覽沒有任何重複時「確認匯入」可直接按；有重複時未選選項前確認鈕停用。
- 截斷 .xls 偵測不完整（T5）：接受降級，列為已知限制；不加結構啟發式。
- PWA：registerType 'prompt' 且不做更新提示 UI（UX 裁決 9）；新版在所有視窗關閉後下次開啟生效，不打斷操作。
- 契約補充：db.ts 有 closeDbForTest()；App 接受 download prop（DownloadedFile 型別）供測試攔截下載。
- 契約規則 features 未涵蓋者（格式錯誤列不參與比對、CSV 引號未收尾、Q-E 邊界、Q-D 提示、Q-F 上限、整列相同告知文案）：綠燈階段以 tests/**/*.test.ts 單元／元件測試補上，不動 features。

## 附錄：綠燈階段實作回寫（工程部，2026-11-09）
- `db.ts`：新增 `closeDbForTest()`（只關連線、不刪資料）；`resetDbForTest()` 先呼叫它再 `deleteDB`。`blocking` 時自動讓出連線並使單例失效。
- `excelWrite.ts`：新增 `XLS_MAX_ROWS = 65_536` 與 `class XlsRowLimitError extends Error`（欄位 `rows`、`limit`）。`buildExportBytes(…, 'xls')` 在「標題列＋資料列 > 65,536」時**丟出** `XlsRowLimitError`，`exportRecords('xls')` 隨之 reject。理由：實測 SheetJS 超過上限時只在 console 警告「Data may be lost」並默默截斷，等於靜默遺失資料。**UI 須接住並顯示「請改用 .xlsx」**（Q-F）。
- `readImportFile`／`buildExportBytes` 維持同步簽名，因此 `excelRead.ts`／`excelWrite.ts` 以**靜態** `import * as XLSX from 'xlsx'`（契約 §4.1 項 4 建議的動態載入未採用；接上 UI 後 xlsx 會進入主 bundle，約 +500 kB／gzip +160 kB，見回報待決問題）。
- T5 補充：有效空 .xls 的 `!ref` 是 `'A1'`（非 undefined），但無任何非空儲存格，仍走 `EMPTY_FILE`。
- `gridToRawRows`／`readImportFile`：xlsx／xls 的格一律從第 1 列第 A 欄起讀（即使 `!ref` 不從 A1 開始），標題列固定為第 1 列。
- 移除 `src/data/notImplemented.ts`（紅燈 stub 用，已無人引用）。

## 附錄：C 退回 1 修正（資料層，2026-11-09）
- `excelWrite.ts`：新增 `CELL_MAX_CHARS = 32_767`（.xlsx）、`XLS_CELL_MAX_CHARS = 255`（.xls）與 `class CellTooLongError extends Error`（欄位 `recordId: number`、`field: FieldKey`、`length: number`、`limit: number`、`format: 'xlsx' | 'xls'`）。.xls 上限為 255 的原因：SheetJS BIFF8 寫端對每格 `slice(0, 255)`，超過會**靜默截斷**（實測 256+ 字元讀回只剩 255）。`buildExportBytes(…, 'xlsx' | 'xls')` 在任一欄位（UTF-16 長度）超過該格式上限時丟出，指出依 id 升冪、欄序第一個違規者；`exportRecords` 隨之 reject。CSV 不受影響。不新增輸入長度規則（存入仍不限長）。**UI 須接住並顯示「有資料超過 Excel 儲存格上限，請改用 CSV 匯出」**。
- 契約 §3.6 往返還原的**已知限制**：.xlsx 內的 CRLF（`\r\n`）讀回會變 LF。SheetJS 讀取 xlsx 字串時，對「已解碼 XML 跳脫（含 `&#13;`、`_x000D_`）後」的結果一律執行 `replace(/\r\n/g, "\n")`（xlsx.mjs `unescapexml(text, true)`），所有字串讀取路徑皆然，寫端無法繞過；單獨 CR、單獨 LF 可還原。CSV、.xls 不受影響。
