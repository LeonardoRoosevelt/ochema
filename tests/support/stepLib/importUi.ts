import { expect } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { listRecords } from '../../../src/data/records'
import { exportRecords } from '../../../src/data/excelWrite'
import { makeFile, norm, REPLACE_DIALOG } from '../ui'
import { readExportedSheet } from '../workbook'
import { stripId, type World } from '../world'
import { currentFile } from './importFlow'
import type { Reg } from './reg'

const ITEM = 'li, tr, [role="row"], [role="listitem"]'
const WAIT = { timeout: 2000 }

/** 預覽統計與「將刪除／匯入」說明 */
async function expectStats(nNew: number, nError: number) {
  expect((await screen.findAllByText(new RegExp(`可匯入\\s*${nNew}\\s*筆`), undefined, WAIT)).length).toBeGreaterThan(0)
  expect(screen.getAllByText(new RegExp(`格式錯誤\\s*${nError}\\s*筆`)).length).toBeGreaterThan(0)
}

/** 資料庫與操作前完全相同（含 id）；不切換畫面，避免離開預覽／對話框 */
async function expectUnchanged(w: World, n: number) {
  expect(w.previewBefore, '情境沒有記錄操作前的名單').toBeDefined()
  const now = await listRecords()
  expect(now, '名單筆數').toHaveLength(n)
  expect(now, '名單內容（含 id）應與操作前完全相同').toEqual(w.previewBefore)
}

export function registerImportUi(r: Reg) {
  r.when('我選擇這份檔案進行匯入', async (w) => {
    const f = currentFile(w)
    await w.ui.open()
    w.previewBefore = await w.records()
    await w.ui.chooseImportFile(makeFile(f.bytes, f.name, f.type))
  })

  r.step('畫面顯示預覽，列出可匯入 {int} 筆與格式錯誤 {int} 筆，並寫明 將刪除目前 {int} 筆、匯入 {int} 筆', async (_w, nNew: number, nError: number, del: number, imp: number) => {
    await expectStats(nNew, nError)
    expect(screen.getAllByText(new RegExp(`將刪除目前\\s*${del}\\s*筆、匯入\\s*${imp}\\s*筆`)).length, '「將刪除目前 N 筆、匯入 M 筆」說明').toBeGreaterThan(0)
  })

  r.step('畫面顯示預覽，列出可匯入 {int} 筆與格式錯誤 {int} 筆（含錯誤原因與列號）', async (w, nNew: number, nError: number) => {
    await expectStats(nNew, nError)

    // 錯誤列：檔案中車頭車號含小寫的那一列（情境固定為 klp-7988），列號 = 資料列序 + 2（標題列為第 1 列）
    const spec = w.spec!
    const headCol = spec.headers.indexOf('車頭車號')
    const idx = spec.rows.findIndex((row) => /[a-z]/.test(row[headCol] ?? ''))
    expect(idx, '情境檔案裡應有一列小寫車牌').toBeGreaterThanOrEqual(0)
    const fileRow = idx + 2
    const holders = screen.getAllByText(new RegExp(`檔案第\\s*${fileRow}\\s*列`))
    const item = holders.map((el) => el.closest(ITEM)).find((el) => el !== null)
    expect(item, `錯誤明細應把「檔案第 ${fileRow} 列」放在同一個列／項目內`).toBeTruthy()
    expect(norm(item!.textContent), '錯誤明細應附上錯誤原因').toContain('含小寫英文')
  })

  r.step('「確認匯入」按鈕不可用', async (w) => {
    const button = w.ui.importButton()
    expect(button.getAttribute('aria-disabled'), '有格式錯誤時應為 aria-disabled').toBe('true')
    // 不用原生 disabled：鍵盤要能聚焦，並由 aria-describedby 讀到原因
    button.focus()
    expect(document.activeElement).toBe(button)
    const why = document.getElementById(button.getAttribute('aria-describedby') ?? '')
    expect(norm(why?.textContent), '應說明為什麼不能確認').toMatch(/格式錯誤/)
    // 點了也不能往下走
    button.click()
    await new Promise((res) => setTimeout(res, 50))
    expect(w.ui.replaceDialog(), '不可確認時不該跳出二次確認框').toBeNull()
  })

  // ── 按鈕與二次確認框 ──
  r.when('我按下確認匯入', async (w) => {
    await w.ui.confirmImport()
  })
  r.when('我按下確認匯入並在二次確認框按下確認', async (w) => {
    await w.ui.confirmImport()
    await w.ui.confirmReplace()
    expect(await screen.findByText(/已匯入\s*\d+\s*筆/, undefined, WAIT)).toBeTruthy()
  })
  r.step('畫面跳出二次確認框，預設焦點在「取消」', async () => {
    const dialog = await screen.findByRole('dialog', { name: REPLACE_DIALOG }, WAIT)
    const cancel = within(dialog).getByRole('button', { name: '取消' })
    expect(document.activeElement, '二次確認框的預設焦點應在「取消」').toBe(cancel)
    expect(within(dialog).getByRole('button', { name: '先匯出目前資料' })).toBeTruthy()
  })
  r.when('我在二次確認框按下確認', async (w) => {
    await w.ui.confirmReplace()
  })
  r.when('我在二次確認框按下取消', async (w) => {
    await w.ui.cancelReplace()
  })
  r.when('我在二次確認框按下「先匯出目前資料」', async (w) => {
    await w.ui.exportBeforeReplace()
  })
  r.step('二次確認框關閉，沒有任何替換發生', async (w) => {
    await waitFor(() => expect(w.ui.replaceDialog()).toBeNull(), WAIT)
    await expectUnchanged(w, (w.previewBefore ?? []).length)
  })
  r.step('二次確認框仍然開著', (w) => {
    expect(w.ui.replaceDialog(), '先匯出之後二次確認框應仍開著').not.toBeNull()
  })
  r.step('我取得一個 .xlsx 檔案，內含目前名單的全部 {int} 筆資料', async (w, n: number) => {
    expect(w.ui.downloads, '應取得一個匯出檔').toHaveLength(1)
    const file = w.ui.downloads[0]!
    expect(file.fileName.endsWith('.xlsx'), `檔名 ${file.fileName}`).toBe(true)
    const sheet = readExportedSheet(file.bytes, 'xlsx')
    expect(sheet.rows).toHaveLength(n)
    // 內容就是匯出當下的名單（與直接匯出的結果逐列相同），不是檔案裡的新資料
    const direct = readExportedSheet((await exportRecords('xlsx')).bytes, 'xlsx')
    expect(sheet.rows).toEqual(direct.rows)
    expect((w.previewBefore ?? []).map(stripId).map((x) => x.ownerName)).toEqual(sheet.rows.map((row) => row[2]))
  })

  // ── 名單狀態（只查資料庫，不切換畫面）──
  r.step('在我確認之前名單仍是原本的 {int} 筆資料', async (w, n: number) => expectUnchanged(w, n))
  r.step('名單仍是原本的 {int} 筆資料', async (w, n: number) => expectUnchanged(w, n))
  r.step('名單仍是原本的 {int} 筆資料，駕駛姓名為 {string}', async (w, n: number, name: string) => {
    await expectUnchanged(w, n)
    expect((await listRecords()).map((x) => x.ownerName)).toEqual([name])
  })

  // 替換後回到名單頁檢查畫面上的列（資料庫與畫面兩邊都要對）
  r.step('畫面顯示 {any}', async (_w, text: string) => {
    const d = text.match(/已刪除\s*(\d+)\s*筆/)
    const i = text.match(/已匯入\s*(\d+)\s*筆/)
    expect(d && i, `無法解析結果描述：${text}`).toBeTruthy()
    await screen.findByText(new RegExp(`已刪除\\s*${d![1]}\\s*筆`), undefined, WAIT)
    await screen.findByText(new RegExp(`已匯入\\s*${i![1]}\\s*筆`), undefined, WAIT)
  })
  r.step('名單上有 {int} 筆資料，駕駛姓名為 {string} 與 {string}', async (w, n: number, a: string, b: string) => {
    await w.ui.goList()
    await w.ui.expectRowCount(n)
    expect(w.ui.allRowValues().map((v) => v.ownerName)).toEqual([a, b])
    expect((await listRecords()).map((x) => x.ownerName)).toEqual([a, b])
  })

  r.step('畫面告知檔案無法讀取，並提示請以「CSV UTF-8」格式另存後再匯入', async () => {
    expect((await screen.findAllByText(/檔案無法讀取/, undefined, WAIT)).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/CSV UTF-8/).length).toBeGreaterThan(0)
  })
  r.step('畫面沒有顯示預覽，也沒有可進行匯入的選項', () => {
    expect(screen.queryByText(/可匯入\s*\d+\s*筆/), '不該有預覽統計').toBeNull()
    expect(screen.queryAllByRole('radio'), '匯入畫面不該有任何選項').toHaveLength(0)
    expect(screen.queryByRole('button', { name: '確認匯入' })).toBeNull()
  })
}
