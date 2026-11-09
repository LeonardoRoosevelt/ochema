import { registerCommon } from './common'
import { registerDuplicates } from './duplicates'
import { registerExport } from './export'
import { registerFieldValidation } from './fieldValidation'
import { registerImportApi } from './importApi'
import { registerImportUi } from './importUi'
import { registerOffline } from './offline'
import { registerRecords } from './records'
import type { Reg } from './reg'
import { registerSearch } from './search'

/**
 * 全部 step definitions。7 個 features 共用同一組，因為同一句話（例如「名單上有以下資料：」）
 * 會跨 feature 出現。較特定的 pattern 必須先於泛用 pattern 註冊（vitest-cucumber 取第一個符合者）。
 * 每個 feature 的每個步驟必須恰好符合其中一個 pattern：由 tests/stepBinding.test.ts 驗證。
 */
export function registerAllSteps(r: Reg): void {
  registerCommon(r)
  registerFieldValidation(r)
  registerDuplicates(r)
  registerRecords(r)
  registerSearch(r)
  registerImportApi(r)
  registerImportUi(r)
  registerExport(r)
  registerOffline(r)
}
