/**
 * 載入 features/<檔名> 並註冊其全部情境與步驟。每個 tests/steps/<feature>.steps.ts 只呼叫這一行。
 *
 * - Scenario Outline 先展開成一個範例一個情境（見 gherkin.ts 說明原因）。
 * - 缺 step：函式庫在載入時丟 StepAbleStepsNotCalledError／StepAbleUnknowStepError（scripts/bdd-dryrun.sh 會抓）。
 * - 情境由 feature 自身列舉，所以不會有「漏寫情境」；新增的情境若沒有對應步驟，同樣在載入時失敗。
 * - 某一步失敗後，同情境後面的步驟標為 skipped（與 Cucumber 一致），失敗統計才不會被連鎖失敗灌水。
 */
import { resolve } from 'node:path'
import { describeFeature, loadFeatureFromText } from '@amiceli/vitest-cucumber'
import type { TestContext } from 'vitest'
import { expandOutlines, readFeatureText } from './gherkin'
import { registerAllSteps } from './stepLib'
import type { Reg, StepFn } from './stepLib/reg'
import { bindScenario, registerScenarioTags, resetWorld } from './world'

const FEATURES_DIR = resolve(process.cwd(), 'features')

function wrap(fn: StepFn, isWhen: boolean) {
  return async (ctx: TestContext, ...args: unknown[]) => {
    const w = bindScenario(ctx.task.suite?.name)
    if (w.failed) ctx.skip('前面的步驟已失敗')
    if (isWhen) w.acted = true
    try {
      await fn(w, ...args)
    } catch (error) {
      w.failed = true
      throw error
    }
  }
}

export function runFeature(featureFile: string): void {
  const { text } = expandOutlines(readFeatureText(resolve(FEATURES_DIR, featureFile)))
  const feature = loadFeatureFromText(text)
  for (const sc of feature.scenarii) registerScenarioTags(sc.description, sc.tags)

  describeFeature(feature, ({ Background, Scenario, defineSteps, AfterEachScenario }) => {
    defineSteps(({ Step }) => {
      const reg: Reg = {
        step: (pattern, fn) => Step(pattern, wrap(fn, false)),
        when: (pattern, fn) => Step(pattern, wrap(fn, true)),
      }
      registerAllSteps(reg)
    })
    AfterEachScenario(() => resetWorld())
    if (feature.background) Background(() => {})
    for (const sc of feature.scenarii) Scenario(sc.description, () => {})
  })
}
