import { expect } from 'vitest'
import { listRecords } from '../../../src/data/records'
import { fields, rowToFields, stripId, type World } from '../world'
import type { Reg, TableRow } from './reg'

/** 名單筆數：資料層一律檢查；UI 已開啟時再檢查畫面上的列數（兩邊都要對，才算「名單上有 N 筆」） */
export async function expectCount(w: World, n: number) {
  const records = await listRecords()
  expect(records, `資料庫內的名單筆數`).toHaveLength(n)
  if (w.ui.mounted) {
    await w.ui.goList()
    await w.ui.expectRowCount(n)
  }
}

export function registerCommon(r: Reg) {
  // ── 前置 ──
  r.step('名單是空的', async (w) => {
    await w.freshDb()
  })
  r.step('名單上有一筆資料：車頭車號 {string}、車斗車號 {string}、駕駛姓名 {string}、駕駛身分證 {string}', async (w, h, t, n, i) => {
    await w.freshDb()
    await w.seed([fields(h, t, n, i)])
  })
  // 同一句話在前置是「建立資料」，在行動之後是「斷言名單包含這些列」（excel-import 的 CSV 引號情境）
  r.step('名單上有以下資料：', async (w, table: TableRow[]) => {
    const rows = table.map(rowToFields)
    if (!w.acted) {
      await w.freshDb()
      await w.seed(rows)
      return
    }
    const now = (await listRecords()).map(stripId)
    for (const row of rows) {
      expect(now, `名單應包含 ${JSON.stringify(row)}`).toContainEqual(row)
    }
  })

  // ── 筆數 ──
  for (const p of [
    '名單上有 {int} 筆資料',
    '名單上仍然只有 {int} 筆資料',
    '名單上仍然有 {int} 筆資料',
    '名單上仍有 {int} 筆資料',
  ]) {
    r.step(p, async (w, n: number) => expectCount(w, n))
  }
  // ── 依駕駛姓名查資料（匯入結果檢查）──
  r.step('名單上有駕駛姓名 {string} 的資料，其車頭車號是 {string}', async (_w, name: string, head: string) => {
    const hits = (await listRecords()).filter((x) => x.ownerName === name)
    expect(hits.map((x) => x.headPlate)).toContain(head)
  })
  r.step(
    '名單上有駕駛姓名 {string} 的資料，其車頭車號是 {string}、車斗車號是 {string}、駕駛身分證是 {string}',
    async (_w, name: string, head: string, tail: string, id: string) => {
      const hits = (await listRecords()).filter((x) => x.ownerName === name).map(stripId)
      expect(hits).toContainEqual(fields(head, tail, name, id))
    },
  )
  r.step(
    '名單上駕駛姓名為文字 {string} 的資料，其車頭車號是 {string}、車斗車號是 {string}',
    async (_w, name: string, head: string, tail: string) => {
      const hits = (await listRecords()).filter((x) => x.ownerName === name)
      expect(hits.map((x) => [x.headPlate, x.tailPlate])).toContainEqual([head, tail])
    },
  )
  r.step('名單上沒有駕駛姓名 {string} 的資料', async (_w, name: string) => {
    expect((await listRecords()).filter((x) => x.ownerName === name)).toHaveLength(0)
  })
  r.step('名單上沒有駕駛姓名為 {string} 的資料', async (_w, name: string) => {
    expect((await listRecords()).filter((x) => x.ownerName === name)).toHaveLength(0)
  })
  r.step('名單上沒有駕駛姓名 {string} 與 {string} 的資料', async (_w, a: string, b: string) => {
    const names = (await listRecords()).map((x) => x.ownerName)
    expect(names).not.toContain(a)
    expect(names).not.toContain(b)
  })
  r.step('名單上駕駛姓名為 {string} 的資料只有 {int} 筆', async (_w, name: string, n: number) => {
    expect((await listRecords()).filter((x) => x.ownerName === name)).toHaveLength(n)
  })
  // numeric cell 情境：整份名單只有這一筆，駕駛姓名必須是「文字」顯示值（007 不可變成 7）
  r.step('這筆資料的駕駛姓名是文字 {string}', async (_w, name: string) => {
    const all = await listRecords()
    expect(all).toHaveLength(1)
    expect(all[0]!.ownerName).toBe(name)
    expect(typeof all[0]!.ownerName).toBe('string')
  })
}
