import type { World } from '../world'

export type StepFn = (w: World, ...args: any[]) => unknown // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * 步驟註冊介面。pattern 使用 vitest-cucumber 的表達式（{string} {int} {any}）。
 * 注意：該函式庫不會跳脫 pattern 裡的正規式特殊字元（. ( ) + * | [ ]），pattern 一律用全形標點或 {any}。
 * 參數順序：表達式參數 → 資料表（若有）→ docstring（若有）。
 * 先註冊者優先；較特定的 pattern 必須排在泛用 pattern 之前。
 */
export interface Reg {
  /** 一般步驟（Given／Then／And 共用，Cucumber 本來就不分關鍵字） */
  step(pattern: string, fn: StepFn): void
  /** 動作步驟（When）：標記情境已進入「行動」階段 */
  when(pattern: string, fn: StepFn): void
}

/** 取出字串中所有 "…" 內容 */
export const quoted = (text: string): string[] => [...text.matchAll(/"([^"]*)"/g)].map((m) => m[1]!)

/** 表格列（中文欄名）→ 欄位值；供 Gherkin 資料表使用 */
export type TableRow = Record<string, string>
