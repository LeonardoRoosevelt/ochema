/**
 * 每個情境一份的共用狀態（World）。
 *
 * vitest-cucumber 把「每個 step」當成獨立的 vitest test，而共用步驟（defineSteps）又拿不到
 * 情境閉包，所以狀態放在模組層級的單例，由 runFeature 在每個情境結束後重置（AfterEachScenario）。
 * 同一個測試檔內的 test 依序執行，單例不會被並行污染。
 */
import { expect } from 'vitest'
import { closeDbForTest, resetDbForTest } from '../../src/data/db'
import { createRecord, deleteAllRecords, listRecords } from '../../src/data/records'
import type {
  DuplicateReport,
  IdCheck,
  ImportResult,
  PlateCheck,
  PreviewResult,
  RecordFields,
  VehicleRecord,
  ExportResult,
} from '../../src/data/types'
import { Ui } from './ui'
import type { FileSpec } from './workbook'

export const COLUMN_TO_KEY = {
  車頭: 'headPlate',
  車尾: 'tailPlate',
  姓名: 'ownerName',
  身分證: 'idNumber',
} as const satisfies Record<string, keyof RecordFields>
export type ColumnTitle = keyof typeof COLUMN_TO_KEY

export const fields = (h: string, t: string, n: string, i: string): RecordFields => ({
  headPlate: h,
  tailPlate: t,
  ownerName: n,
  idNumber: i,
})

/** Gherkin 資料表的一列（鍵為中文欄名）→ RecordFields */
export function rowToFields(row: Record<string, string>): RecordFields {
  return fields(row['車頭'] ?? '', row['車尾'] ?? '', row['姓名'] ?? '', row['身分證'] ?? '')
}

export const stripId = ({ id: _id, ...rest }: VehicleRecord): RecordFields => rest

export class World {
  /** 前面的步驟已失敗：後續步驟標為 skipped（與 Cucumber 行為一致） */
  failed = false
  /** 已經執行過任何 When：用來區分「名單上有以下資料」是前置（Given）還是斷言（Then） */
  acted = false
  /** 情境是否標了 @ui（由 runFeature 依 feature 的標籤登錄） */
  isUi = false
  private dbFresh = false

  readonly ui = new Ui()

  // 欄位檢查
  plate?: PlateCheck
  idCheck?: IdCheck
  idRaw = ''
  // 重複偵測
  report?: DuplicateReport
  recordsAtCheck: VehicleRecord[] = []
  // 匯入
  spec?: FileSpec
  /** 非「標題列＋資料列」型態的檔案（二進位、損毀、Big5、純文字…）直接給位元組 */
  rawFile?: { bytes: Uint8Array; name: string }
  preview?: PreviewResult
  previewBefore?: VehicleRecord[]
  importResult?: ImportResult
  // 匯出
  exported?: ExportResult
  exportedRecords: RecordFields[] = []
  // UI 動作紀錄
  lastAction?: { kind: 'add' | 'edit'; id?: number; input: RecordFields }
  snapshotBeforeAction: VehicleRecord[] = []
  /** 建置情境等一次性資料的暫存 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scratch: Record<string, any> = {}

  /** 每個情境第一次碰名單時換一個全新的空資料庫。 */
  async freshDb() {
    if (this.dbFresh) return
    this.dbFresh = true
    await resetDbForTest()
  }

  async seed(rows: RecordFields[]) {
    for (const r of rows) {
      const res = await createRecord(r)
      if (!res.ok) throw new Error(`前置資料存檔失敗（${JSON.stringify(r)}）：${JSON.stringify(res)}`)
    }
  }

  async records(): Promise<VehicleRecord[]> {
    return listRecords()
  }

  async clearAll() {
    await deleteAllRecords()
  }

  /** 模擬「關閉再開」資料庫連線：資料應仍在。 */
  async reopenDb() {
    await closeDbForTest()
  }
}

// ── 單例與情境標籤 ─────────────────────────────────────

let current = new World()
export const world = (): World => current

export function resetWorld(): void {
  current.ui.dispose()
  current = new World()
}

/** 「Scenario: 標題」→ 標籤集合；由 runFeature 在載入 feature 後登錄 */
const tagsByDescribeTitle = new Map<string, ReadonlySet<string>>()
export function registerScenarioTags(title: string, tags: ReadonlySet<string>) {
  tagsByDescribeTitle.set(`Scenario: ${title}`, tags)
}
export function bindScenario(suiteName: string | undefined): World {
  const tags = suiteName ? tagsByDescribeTitle.get(suiteName) : undefined
  if (tags) current.isUi = tags.has('ui')
  return current
}

export function expectOk<T extends { ok: boolean }>(r: T, what: string): asserts r is Extract<T, { ok: true }> {
  expect(r.ok, `${what} 應成功，實際：${JSON.stringify(r)}`).toBe(true)
}

