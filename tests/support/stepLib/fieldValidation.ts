import { expect } from 'vitest'
import { createRecord } from '../../../src/data/records'
import { checkIdNumber, checkPlate } from '../../../src/data/validation'
import { fields } from '../world'
import type { Reg } from './reg'

export function registerFieldValidation(r: Reg) {
  r.when('我檢查車牌 {string}', (w, raw: string) => {
    w.plate = checkPlate(raw)
  })
  r.when('我檢查駕駛身分證 {string}', (w, raw: string) => {
    w.idRaw = raw
    w.idCheck = checkIdNumber(raw)
  })

  r.step('結果為合格', (w) => {
    expect(w.plate, '尚未檢查車牌').toBeDefined()
    expect(w.plate!.ok, `車牌應合格，實際：${JSON.stringify(w.plate)}`).toBe(true)
  })
  r.step('結果為合格，去除空白後的值是 {string}', (w, value: string) => {
    expect(w.plate).toEqual({ ok: true, value })
  })
  r.step('結果為不合格，原因代碼為 {string}', (w, code: string) => {
    expect(w.plate).toMatchObject({ ok: false, code })
  })

  r.step('結果為通過，沒有警示，去除空白後的值是 {string}', (w, value: string) => {
    expect(w.idCheck).toEqual({ status: 'ok', value })
  })
  r.step('結果為通過，沒有警示（{any}）', (w) => {
    expect(w.idCheck).toEqual({ status: 'ok', value: w.idRaw })
  })
  r.step('結果為警示，原因代碼為 {string}', (w, code: string) => {
    expect(w.idCheck).toMatchObject({ status: 'warn', code })
  })
  // 「仍可存檔」＝警示不阻擋：除了 status 是 warn，真的把它存進名單也要成功（契約 §5.1）
  r.step('這個值仍可存檔', async (w) => {
    expect(w.idCheck?.status).toBe('warn')
    await w.freshDb()
    const res = await createRecord(fields('929-X2', '20-9A', '王小明', w.idRaw))
    expect(res.ok, `駕駛身分證 ${w.idRaw} 只該警示，卻存檔失敗：${JSON.stringify(res)}`).toBe(true)
  })
}
