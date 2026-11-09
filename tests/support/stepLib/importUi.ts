import { expect } from 'vitest'
import { screen } from '@testing-library/react'
import { makeFile, norm } from '../ui'
import { currentFile } from './importFlow'
import type { Reg } from './reg'

const ITEM = 'li, tr, [role="row"], [role="listitem"]'

export function registerImportUi(r: Reg) {
  r.when('我選擇這份檔案進行匯入', async (w) => {
    const f = currentFile(w)
    await w.ui.open()
    w.previewBefore = await w.records()
    await w.ui.chooseImportFile(makeFile(f.bytes, f.name, f.type))
  })

  r.step('畫面顯示預覽，列出可新增 {int} 筆與格式錯誤 {int} 筆（含錯誤原因與列號）', async (w, nNew: number, nError: number) => {
    expect((await screen.findAllByText(new RegExp(`可新增\\s*${nNew}\\s*筆`), undefined, { timeout: 2000 })).length).toBeGreaterThan(0)
    expect(screen.getAllByText(new RegExp(`格式錯誤\\s*${nError}\\s*筆`)).length).toBeGreaterThan(0)

    // 錯誤列：檔案中車頭含小寫的那一列（情境固定為 klp-7988），列號 = 資料列序 + 2（標題列為第 1 列）
    const spec = w.spec!
    const headCol = spec.headers.indexOf('車頭')
    const idx = spec.rows.findIndex((row) => /[a-z]/.test(row[headCol] ?? ''))
    expect(idx, '情境檔案裡應有一列小寫車牌').toBeGreaterThanOrEqual(0)
    const fileRow = idx + 2
    const holders = screen.getAllByText(new RegExp(`檔案第\\s*${fileRow}\\s*列`))
    const item = holders.map((el) => el.closest(ITEM)).find((el) => el !== null)
    expect(item, `錯誤明細應把「檔案第 ${fileRow} 列」放在同一個列／項目內`).toBeTruthy()
    expect(norm(item!.textContent), '錯誤明細應附上錯誤原因').toContain('含小寫英文')
  })

  r.when('我確認匯入', async (w) => {
    await w.ui.confirmImport()
    expect(await screen.findByText(/已匯入\s*\d+\s*筆/, undefined, { timeout: 2000 })).toBeTruthy()
  })

  r.step('畫面告知檔案無法讀取，並提示請以「CSV UTF-8」格式另存後再匯入', async () => {
    expect((await screen.findAllByText(/檔案無法讀取/, undefined, { timeout: 2000 })).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/CSV UTF-8/).length).toBeGreaterThan(0)
  })
  r.step('畫面沒有顯示預覽，也沒有可進行匯入的選項', () => {
    expect(screen.queryByText(/可新增\s*\d+\s*筆/), '不該有預覽統計').toBeNull()
    expect(screen.queryByRole('radio', { name: '略過重複' })).toBeNull()
    expect(screen.queryByRole('radio', { name: '照樣匯入' })).toBeNull()
    expect(screen.queryByRole('button', { name: '確認匯入' })).toBeNull()
  })
}
