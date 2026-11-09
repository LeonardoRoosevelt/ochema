/**
 * Scenario Outline 展開器。
 *
 * 為什麼需要：@amiceli/vitest-cucumber 8 要求 Outline 的每個 <變數> 都必須出現在「步驟文字」中
 * （偵測只看步驟標題，不看資料表與 docstring），否則載入時丟 ScenarioOutlineVariableNotCalledInStepsError。
 * 已鎖定的 features 有 7 個 Outline 的變數只出現在資料表內（或有未使用的說明欄），無法以原生 Outline 載入。
 *
 * 作法：在記憶體中把「每個 Outline 的每個範例」展開成一個獨立的 Scenario（等同 Cucumber 的 pickle），
 * 再用 loadFeatureFromText 載入。features/ 檔案本身不動。展開後的情境標題為
 *   「<原標題> ［範例 n｜值…］」，原標題由 baseTitleOf() 取回。
 * 因此 step 內文一律是替換後的具體值，不需要在 step 內處理 <變數>。
 */
import { readFileSync } from 'node:fs'

const EXAMPLE_MARK = ' ［範例 '

export interface ExpandedFeature {
  text: string
  /** 展開前的 Scenario／Scenario Outline 數（等於 features 的情境數） */
  baseScenarioCount: number
  /** 展開後的 Scenario 數（Outline 每個範例一個） */
  expandedScenarioCount: number
}

export function baseTitleOf(expandedTitle: string): string {
  const i = expandedTitle.indexOf(EXAMPLE_MARK)
  return i < 0 ? expandedTitle : expandedTitle.slice(0, i)
}

function splitRow(line: string): string[] {
  const t = line.trim()
  return t
    .slice(1, t.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((c) => c.trim())
}

function isBoundary(trimmed: string): boolean {
  return trimmed.startsWith('@') || /^(Scenario Outline|Scenario|Background|Feature|Rule):/.test(trimmed)
}

export function expandOutlines(featureText: string): ExpandedFeature {
  const lines = featureText.split('\n')
  const out: string[] = []
  let pendingTags: string[] = []
  let base = 0
  let expanded = 0
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const t = line.trim()
    if (t.startsWith('@')) {
      pendingTags.push(line)
      i++
      continue
    }
    if (t.startsWith('Scenario Outline:')) {
      base++
      const title = t.slice('Scenario Outline:'.length).trim()
      i++
      const body: string[] = []
      let inDoc = false
      while (i < lines.length) {
        const bt = lines[i]!.trim()
        if (bt.startsWith('"""')) inDoc = !inDoc
        if (!inDoc && isBoundary(bt)) break
        body.push(lines[i]!)
        i++
      }
      // 分成：步驟部分 ／ Examples 表格
      const exIdx = body.findIndex((l) => l.trim().startsWith('Examples:'))
      const stepLines = (exIdx < 0 ? body : body.slice(0, exIdx)).filter((l) => !l.trim().startsWith('#'))
      const tableLines = (exIdx < 0 ? [] : body.slice(exIdx + 1)).filter((l) => l.trim().startsWith('|'))
      if (tableLines.length < 2) throw new Error(`Scenario Outline 沒有範例資料列：${title}`)
      const keys = splitRow(tableLines[0]!)
      tableLines.slice(1).forEach((row, n) => {
        const vals = splitRow(row)
        const sub = (s: string) =>
          keys.reduce((acc, k, ki) => acc.split(`<${k}>`).join(vals[ki] ?? ''), s)
        const label = vals.filter((v) => v !== '').slice(0, 3).join('｜').slice(0, 48)
        out.push(...pendingTags)
        out.push(`  Scenario: ${title}${EXAMPLE_MARK}${n + 1}｜${label}］`)
        out.push(...stepLines.map(sub))
        out.push('')
        expanded++
      })
      pendingTags = []
      continue
    }
    if (t.startsWith('Scenario:')) {
      base++
      expanded++
    }
    out.push(...pendingTags)
    pendingTags = []
    out.push(line)
    i++
  }
  out.push(...pendingTags)
  return { text: out.join('\n'), baseScenarioCount: base, expandedScenarioCount: expanded }
}

export function readFeatureText(path: string): string {
  return readFileSync(path, 'utf8')
}
