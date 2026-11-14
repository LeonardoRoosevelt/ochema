import { expect } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Reg } from './reg'
import { norm } from '../ui'
import type { ColumnTitle, World } from '../world'

const WAIT = { timeout: 2000 }
const COLUMN_INDEX: Record<ColumnTitle, number> = { 車頭車號: 0, 車斗車號: 1, 駕駛姓名: 2, 駕駛身分證: 3 }

/** 該列、該欄的「複製」按鈕：真正的 <button>，使用者才能用 Tab 聚焦、Enter 觸發 */
function copyButton(w: World, head: string, column: string): HTMLElement {
  const index = COLUMN_INDEX[column as ColumnTitle]
  if (index === undefined) throw new Error(`沒有「${column}」這一欄（可複製的欄位：${Object.keys(COLUMN_INDEX).join('、')}）`)
  const cell = w.ui.cells(w.ui.rowBy('headPlate', head))[index]!
  const buttons = within(cell).queryAllByRole('button')
  expect(buttons, `「${column}」那一格應有可操作的複製按鈕（button）`).toHaveLength(1)
  return buttons[0]!
}

/** 「操作結果」訊息（C3）的文字 */
const flashText = () => norm(screen.getByRole('status', { name: '操作結果' }).textContent)

export function registerCopy(r: Reg) {
  r.step('這台裝置不允許寫入剪貼簿', async (w) => {
    w.ui.clipboard.reject = true
  })

  r.when('我在名單上點擊車頭車號 {string} 那一筆的 {string}', async (w, head: string, column: string) => {
    await w.ui.open()
    const user = userEvent.setup()
    w.ui.clipboard.install()
    await user.click(copyButton(w, head, column))
  })

  r.when('我用鍵盤移到車頭車號 {string} 那一筆的 {string} 並按 Enter', async (w, head: string, column: string) => {
    await w.ui.open()
    const user = userEvent.setup()
    w.ui.clipboard.install()
    const button = copyButton(w, head, column)
    // 真的用 Tab 走到按鈕，證明它在鍵盤順序內；不直接呼叫 click 或 focus
    for (let i = 0; i < 60 && document.activeElement !== button; i++) await user.tab()
    expect(document.activeElement, `按 Tab 無法移到「${column}」的複製按鈕`).toBe(button)
    await user.keyboard('{Enter}')
  })

  r.step('剪貼簿內容是 {string}', async (w, value: string) => {
    await waitFor(() => expect(w.ui.clipboard.writes, '剪貼簿寫入紀錄').toEqual([value]), WAIT)
  })

  r.step('畫面告知已複製 {string}', async (_w, value: string) => {
    await waitFor(() => expect(flashText()).toContain(`已複製「${value}」`), WAIT)
  })

  r.step('畫面告知無法複製，並顯示要複製的值 {string}', async (w, value: string) => {
    await waitFor(() => {
      const text = flashText()
      expect(text).toContain('無法複製')
      expect(text).toContain(value)
    }, WAIT)
    expect(w.ui.clipboard.writes, '失敗時不應有任何寫入').toEqual([])
    expect(flashText(), '失敗時不可說成已複製').not.toContain('已複製')
    const msg = screen.getByRole('status', { name: '操作結果' }).querySelector('.msg')
    expect(msg?.classList.contains('msg-ok'), '失敗訊息不可用成功樣式（綠色勾勾）').toBe(false)
  })

  r.step('沒有開啟任何表單或對話框', async (w) => {
    expect(w.ui.form(), '不應開啟表單').toBeNull()
    expect(screen.queryAllByRole('dialog'), '不應開啟任何對話框').toHaveLength(0)
  })

  r.step('名單共有 {int} 筆資料', async (w, n: number) => {
    await w.ui.expectRowCount(n)
    const { listRecords } = await import('../../../src/data/records')
    expect(await listRecords(), '資料庫內的名單筆數').toHaveLength(n)
  })
}
