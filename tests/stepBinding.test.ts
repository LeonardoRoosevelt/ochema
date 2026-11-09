/**
 * 步驟綁定檢查：features 裡展開後的每一個步驟，必須恰好符合一個 step definition。
 *
 * 為什麼需要：vitest-cucumber 遇到多個 pattern 同時符合時，不報錯、只悄悄取先註冊的那個，
 * 一旦有人調整 pattern 讓泛用規則搶走特定步驟，測試會綠燈卻驗錯東西。這個檢查把它變成失敗。
 * （缺 step 本身由函式庫在載入時丟 StepAbleStepsNotCalledError，scripts/bdd-dryrun.sh 負責抓。）
 */
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { expandOutlines, readFeatureText } from './support/gherkin'
import { registerAllSteps } from './support/stepLib'

const patterns: string[] = []
registerAllSteps({ step: (p) => void patterns.push(p), when: (p) => void patterns.push(p) })

const toRegex = (p: string) =>
  new RegExp(
    '^' +
      p
        .replace(/[?]/g, '\\$&')
        .replace(/\{string\}/g, '("[^"]*"|\'[^\']*\')')
        .replace(/\{int\}/g, '-?\\d+')
        .replace(/\{any\}/g, '.+') +
      '$',
  )
const compiled = patterns.map((p) => ({ p, re: toRegex(p) }))

function stepTexts(featureText: string): string[] {
  const out = new Set<string>()
  let inDoc = false
  for (const raw of featureText.split('\n')) {
    const t = raw.trim()
    if (t.startsWith('"""')) inDoc = !inDoc
    if (inDoc || t.startsWith('"""') || t.startsWith('#')) continue
    const m = t.match(/^(?:Given|When|Then|And|But) (.*)$/)
    if (m) out.add(m[1]!)
  }
  return [...out]
}

describe('step definition 綁定', () => {
  const used = new Set<string>()
  const dir = resolve(process.cwd(), 'features')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.feature'))) {
    test(`${file}：每個步驟恰好符合一個 step definition`, () => {
      const steps = stepTexts(expandOutlines(readFeatureText(resolve(dir, file))).text)
      expect(steps.length).toBeGreaterThan(0)
      const problems: string[] = []
      for (const s of steps) {
        const hits = compiled.filter((c) => c.re.test(s)).map((c) => c.p)
        hits.forEach((h) => used.add(h))
        if (hits.length !== 1) problems.push(`${hits.length} 個符合：${s}\n    ${hits.join('\n    ')}`)
      }
      expect(problems, problems.join('\n')).toEqual([])
    })
  }

  test('沒有任何 feature 用到的 step definition（死碼）', () => {
    expect(patterns.filter((p) => !used.has(p))).toEqual([])
  })
})

describe('Outline 展開器忠實度', () => {
  const dir = resolve(process.cwd(), 'features')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.feature'))) {
    test(`${file}：展開後情境數＝非 Outline Scenario 數＋所有 Examples 資料列數`, () => {
      const text = readFeatureText(resolve(dir, file))
      let plain = 0
      let exampleRows = 0
      let inExamples = false
      let headerSeen = false
      let inDoc = false
      for (const raw of text.split('\n')) {
        const t = raw.trim()
        if (t.startsWith('"""')) inDoc = !inDoc
        if (inDoc) continue
        if (t.startsWith('Scenario:')) plain++
        if (/^(Scenario Outline|Scenario|Background|Feature|Rule):/.test(t)) inExamples = false
        if (t.startsWith('Examples:')) {
          inExamples = true
          headerSeen = false
        } else if (inExamples && t.startsWith('|')) {
          if (headerSeen) exampleRows++
          else headerSeen = true
        }
      }
      expect(expandOutlines(text).expandedScenarioCount).toBe(plain + exampleRows)
    })
  }
})
