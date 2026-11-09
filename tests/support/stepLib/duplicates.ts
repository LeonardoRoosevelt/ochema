import { expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import { detectDuplicates } from '../../../src/data/duplicates'
import { listRecords } from '../../../src/data/records'
import type { DuplicateKind, RecordFields } from '../../../src/data/types'
import { fields, stripId, type World } from '../world'
import { norm } from '../ui'
import { quoted, type Reg } from './reg'

export const KIND_BY_LABEL: Record<string, DuplicateKind> = {
  同車頭: 'SAME_HEAD',
  同車尾: 'SAME_TAIL',
  同身分證不同姓名: 'SAME_ID_DIFF_NAME',
}
const LABELS = Object.keys(KIND_BY_LABEL)

/** 「車頭 "929-X2"、姓名 "王小明"」→ 值清單（用於檢查畫面上列出的衝突資料） */
function valuesIn(desc: string): string[] {
  return quoted(desc)
}

function rowsWithHead(w: World, head: string) {
  return w.ui.rows().filter((row) => w.ui.rowValues(row).headPlate === head)
}
const rowByName = (w: World, name: string) => w.ui.rowBy('ownerName', name)

export function registerDuplicates(r: Reg) {
  // ── @api：名單總檢查 ──
  r.when('我檢查名單的重複', async (w) => {
    w.recordsAtCheck = await listRecords()
    w.report = detectDuplicates(w.recordsAtCheck)
  })
  r.step('偵測到 {int} 組「{any}」重複，值為 {string}，涉及 {int} 筆資料', (w, n: number, label: string, value: string, size: number) => {
    const kind = KIND_BY_LABEL[label]
    expect(kind, `未知的重複種類：${label}`).toBeDefined()
    const groups = w.report!.groups.filter((g) => g.kind === kind)
    expect(groups, `「${label}」的組數`).toHaveLength(n)
    expect(groups[0]!.value).toBe(value)
    expect(groups[0]!.recordIds).toHaveLength(size)
    // 涉及的資料確實都帶有這個值
    const involved = w.recordsAtCheck.filter((x) => groups[0]!.recordIds.includes(x.id))
    const field = kind === 'SAME_HEAD' ? 'headPlate' : kind === 'SAME_TAIL' ? 'tailPlate' : 'idNumber'
    expect(involved.map((x) => x[field])).toEqual(Array(size).fill(value))
  })
  r.step('沒有偵測到任何重複', (w) => {
    expect(w.report!.groups).toEqual([])
    expect(w.report!.byRecordId.size).toBe(0)
  })
  r.step('這兩筆資料都同時被標為「同車頭」與「同身分證不同姓名」', (w) => {
    expect(w.recordsAtCheck).toHaveLength(2)
    for (const rec of w.recordsAtCheck) {
      const kinds = w.report!.byRecordId.get(rec.id) ?? []
      expect(kinds).toContain('SAME_HEAD')
      expect(kinds).toContain('SAME_ID_DIFF_NAME')
    }
  })
  r.step('這兩筆資料都沒有被標為「同車尾」', (w) => {
    for (const rec of w.recordsAtCheck) expect(w.report!.byRecordId.get(rec.id) ?? []).not.toContain('SAME_TAIL')
  })

  // ── @ui：新增／編輯時的存檔通知 ──
  r.step('畫面告知發生的重複種類為「{any}」', (w, label: string) => {
    const notice = w.ui.notice()
    expect(notice, '存檔後應出現「重複與警示通知」').not.toBeNull()
    const text = norm(notice!.textContent)
    expect(text).toContain(label)
    // 只該告知這一種：其餘兩種的名稱不得出現
    for (const other of LABELS.filter((l) => l !== label && !label.includes(l))) {
      expect(text, `通知不該出現「${other}」`).not.toContain(other)
    }
  })
  r.step('畫面列出與之衝突的既有資料：{any}', (w, desc: string) => {
    const notice = w.ui.notice()
    expect(notice, '存檔後應出現「重複與警示通知」').not.toBeNull()
    const text = norm(notice!.textContent)
    for (const v of valuesIn(desc)) expect(text, `通知應列出衝突資料的值 ${v}`).toContain(v)
  })
  for (const p of ['畫面沒有顯示重複通知', '畫面沒有顯示新的重複通知']) {
    r.step(p, (w) => {
      expect(w.ui.notice(), '不該出現「重複與警示通知」').toBeNull()
    })
  }

  // ── @ui：整列相同被擋 ──
  r.step(
    '畫面告知原因是與既有資料整列相同，並列出該筆既有資料：車頭 {string}、車尾 {string}、姓名 {string}、身分證 {string}',
    (w, h: string, t: string, n: string, i: string) => {
      const text = w.ui.alertText()
      expect(text).toContain('整列相同')
      for (const v of [h, t, n, i]) expect(text, `擋下訊息應列出既有資料的值 ${v}`).toContain(v)
    },
  )
  r.step(
    '姓名為 {string} 的那筆仍是：車頭 {string}、車尾 {string}、身分證 {string}',
    async (w, name: string, h: string, t: string, i: string) => {
      await w.ui.goList()
      expect(w.ui.rowValues(rowByName(w, name))).toEqual(fields(h, t, name, i))
    },
  )

  // ── @ui：編輯 ──
  r.when(
    '我把姓名為 {string} 的那筆改成：車頭 {string}、車尾 {string}、姓名 {string}、身分證 {string} 並儲存',
    async (w, name: string, h: string, t: string, n: string, i: string) => {
      await w.ui.goList()
      w.snapshotBeforeAction = await listRecords()
      const target = w.snapshotBeforeAction.find((x) => x.ownerName === name)!
      w.lastAction = { kind: 'edit', id: target.id, input: fields(h, t, n, i) }
      await w.ui.editRow(rowByName(w, name), fields(h, t, n, i))
    },
  )
  r.when('我把姓名為 {string} 的那筆的車頭改成 {string} 並儲存', async (w, name: string, head: string) => {
    await editOne(w, name, { headPlate: head })
  })
  r.when('我把姓名為 {string} 的那筆的姓名改成 {string} 並儲存', async (w, name: string, next: string) => {
    await editOne(w, name, { ownerName: next })
  })
  r.when('我刪除姓名為 {string} 的那筆資料', async (w, name: string) => {
    await w.ui.goList()
    const dialog = await w.ui.requestDelete(rowByName(w, name))
    await w.ui.confirmDelete(dialog)
  })

  // ── @ui：名單上的重複標示 ──
  r.step('車頭 {string} 的兩筆資料都標示為重複', async (w, head: string) => {
    await w.ui.goList()
    const rows = rowsWithHead(w, head)
    expect(rows, `車頭 ${head} 的列數`).toHaveLength(2)
    for (const row of rows) expect(w.ui.marks(row)).toMatch(/同車頭|同車尾|同身分證不同姓名/)
  })
  r.step('車頭 {string} 的兩筆資料都標示為重複，並顯示重複種類「同車頭」', async (w, head: string) => {
    await w.ui.goList()
    const rows = rowsWithHead(w, head)
    expect(rows, `車頭 ${head} 的列數`).toHaveLength(2)
    for (const row of rows) expect(w.ui.marks(row)).toContain('同車頭')
  })
  r.step('車頭 {string} 的資料沒有重複標示', async (w, head: string) => {
    await w.ui.goList()
    const rows = rowsWithHead(w, head)
    expect(rows).toHaveLength(1)
    expect(w.ui.marks(rows[0]!)).not.toMatch(/同車頭|同車尾|同身分證不同姓名/)
  })
  r.step('兩筆資料仍標示為重複，重複種類只有「同車頭」', async (w) => {
    await w.ui.goList()
    const rows = w.ui.rows()
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const m = w.ui.marks(row)
      expect(m).toContain('同車頭')
      expect(m).not.toContain('同車尾')
      expect(m).not.toContain('同身分證不同姓名')
    }
  })
  r.step('兩筆資料都不再標示重複', async (w) => {
    await w.ui.goList()
    const rows = w.ui.rows()
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(w.ui.marks(row)).not.toMatch(/同車頭|同車尾|同身分證不同姓名/)
  })
  r.step('姓名為 {string} 的資料不再標示重複', async (w, name: string) => {
    await w.ui.goList()
    expect(w.ui.marks(rowByName(w, name))).not.toMatch(/同車頭|同車尾|同身分證不同姓名/)
  })
  r.step('姓名為 {string} 的資料沒有重複標示', async (w, name: string) => {
    await w.ui.goList()
    expect(w.ui.marks(rowByName(w, name))).not.toMatch(/同車頭|同車尾|同身分證不同姓名/)
  })
  r.step('姓名為 {string} 與 {string} 的兩筆資料仍標示為重複，重複種類為「同車頭」', async (w, a: string, b: string) => {
    await w.ui.goList()
    for (const name of [a, b]) {
      const m = w.ui.marks(rowByName(w, name))
      expect(m).toContain('同車頭')
      expect(m).not.toContain('同車尾')
      expect(m).not.toContain('同身分證不同姓名')
    }
  })

  // ── @ui：總覽 ──
  r.when('我開啟重複與警示總覽', async (w) => {
    await w.ui.goOverview()
  })
  r.step('總覽顯示目前沒有重複與警示', async (w) => {
    await screen.findByText(/目前沒有重複與警示/, undefined, { timeout: 2000 })
    expect(w.ui.anyDuplicateGroups().length + w.ui.idWarningGroups().length).toBe(0)
  })
  r.step('重複與警示總覽顯示目前沒有重複與警示', async (w) => {
    await w.ui.goOverview()
    await screen.findByText(/目前沒有重複與警示/, undefined, { timeout: 2000 })
    expect(w.ui.anyDuplicateGroups().length + w.ui.idWarningGroups().length).toBe(0)
  })
  r.step('總覽列出 {int} 組「同車頭」重複，值為 {string}', async (w, n: number, value: string) => {
    await expectGroups(w, '同車頭', n, { value })
  })
  r.step('總覽列出 {int} 筆身分證格式警示，涉及姓名 {string}', async (w, n: number, name: string) => {
    await screen.findAllByRole('group', { name: /^身分證警示 / }, { timeout: 2000 })
    const groups = w.ui.idWarningGroups()
    expect(groups).toHaveLength(n)
    expect(groups[0]!.getAttribute('aria-label') ?? norm(groups[0]!.textContent)).toContain(name)
  })
  r.step('重複與警示總覽列出 {int} 組「同車頭」重複', async (w, n: number) => {
    await w.ui.goOverview()
    await expectGroups(w, '同車頭', n, {})
  })
  r.step('重複與警示總覽列出 {int} 組「同車頭」重複，涉及 {int} 筆資料', async (w, n: number, size: number) => {
    await w.ui.goOverview()
    await expectGroups(w, '同車頭', n, { size })
  })
  r.step(
    '重複與警示總覽列出 {int} 組「同車頭」重複，涉及 {int} 筆資料，沒有「同身分證不同姓名」',
    async (w, n: number, size: number) => {
      await w.ui.goOverview()
      await expectGroups(w, '同車頭', n, { size })
      expect(w.ui.duplicateGroups('同身分證不同姓名')).toHaveLength(0)
    },
  )
  r.step('重複與警示總覽不再列出「{any}」重複', async (w, label: string) => {
    await w.ui.goOverview()
    // 三個範例編輯後名單都已無任何問題：等總覽算完（出現「目前沒有重複與警示」）再斷言，避免讀到過時內容
    await screen.findByText(/目前沒有重複與警示/, undefined, { timeout: 2000 })
    expect(w.ui.duplicateGroups(label), `總覽不該再有「${label}」`).toHaveLength(0)
  })
}

async function editOne(w: World, name: string, patch: Partial<RecordFields>) {
  await w.ui.goList()
  w.snapshotBeforeAction = await listRecords()
  const target = w.snapshotBeforeAction.find((x) => x.ownerName === name)!
  w.lastAction = { kind: 'edit', id: target.id, input: { ...stripId(target), ...patch } }
  await w.ui.editRow(rowByName(w, name), patch)
}

async function expectGroups(w: World, label: string, n: number, opts: { value?: string; size?: number }) {
  if (n > 0) await screen.findAllByRole('group', { name: new RegExp(`^${label} `) }, { timeout: 2000 })
  const groups = w.ui.duplicateGroups(label)
  expect(groups, `總覽「${label}」的組數`).toHaveLength(n)
  for (const g of groups) {
    const text = norm(g.textContent)
    if (opts.value !== undefined) expect(g.getAttribute('aria-label')).toContain(opts.value)
    if (opts.size !== undefined) expect(text).toContain(`涉及 ${opts.size} 筆資料`)
    // 組內列出涉及的每一筆完整資料（至少有 size 個可編輯的項目）
    if (opts.size !== undefined) expect(within(g).getAllByRole('button', { name: /^編輯/ })).toHaveLength(opts.size)
  }
}

