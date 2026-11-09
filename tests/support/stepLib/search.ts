import { expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { quoted, type Reg } from './reg'
import type { World } from '../world'

async function typeKeyword(w: World, keyword: string) {
  await w.ui.open()
  await w.ui.search(keyword)
}

/** 結果的車頭（依畫面順序）應剛好是 heads */
async function expectHeads(w: World, heads: string[]) {
  await waitFor(() => expect(w.ui.allRowValues().map((v) => v.headPlate)).toEqual(heads), { timeout: 2000 })
}

export function registerSearch(r: Reg) {
  r.when('我查詢 {string}', async (w, kw: string) => typeKeyword(w, kw))
  r.step('我查詢了 {string}', async (w, kw: string) => typeKeyword(w, kw))
  r.step('我查詢了 {string}，畫面只列出 {int} 筆', async (w, kw: string, n: number) => {
    await typeKeyword(w, kw)
    await w.ui.expectRowCount(n)
  })
  r.when('我清除關鍵字', async (w) => {
    await w.ui.clearSearch()
  })
  r.when('我把車頭 {string} 那筆的姓名改成 {string} 並儲存', async (w, head: string, name: string) => {
    w.snapshotBeforeAction = await w.records()
    const target = w.snapshotBeforeAction.find((x) => x.headPlate === head)!
    w.lastAction = { kind: 'edit', id: target.id, input: { ...target, ownerName: name } }
    await w.ui.editRow(w.ui.rowBy('headPlate', head), { ownerName: name })
  })

  r.step('結果列出車頭為 {any} 的資料', async (w, list: string) => expectHeads(w, quoted(list)))
  r.step('結果是空的', async (w) => {
    await w.ui.expectRowCount(0)
  })
  r.step('畫面顯示查無符合的資料', async () => {
    expect(await screen.findByText(/查無符合的資料/, undefined, { timeout: 2000 })).toBeTruthy()
  })
  r.step('名單列出全部 {int} 筆資料', async (w, n: number) => {
    await w.ui.expectRowCount(n)
    expect(w.ui.searchBox().value, '清除後查詢框應為空').toBe('')
  })
  r.step('結果中的身分證完整顯示為 {string}', async (w, id: string) => {
    await waitFor(() => expect(w.ui.allRowValues().map((v) => v.idNumber)).toContain(id), { timeout: 2000 })
  })
  r.step('結果仍依 {string} 篩選', async (w, kw: string) => {
    expect(w.ui.searchBox().value, '編輯後查詢條件應保持').toBe(kw)
    const names = w.ui.allRowValues()
    expect(names.length).toBeGreaterThan(0)
    for (const v of names) {
      expect(Object.values(v).join('｜').toLowerCase(), '每一列都應符合查詢條件').toContain(kw.toLowerCase())
    }
  })
}
