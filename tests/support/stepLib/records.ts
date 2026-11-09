import { expect } from 'vitest'
import { screen, within } from '@testing-library/react'
import { listRecords } from '../../../src/data/records'
import type { RecordFields } from '../../../src/data/types'
import { fields, stripId, type World } from '../world'
import { norm } from '../ui'
import type { Reg } from './reg'

const VALID = fields('929-X2', '20-9A', '王小明', 'A123456789')
const trimAll = (f: RecordFields): RecordFields => ({
  headPlate: f.headPlate.trim(),
  tailPlate: f.tailPlate.trim(),
  ownerName: f.ownerName.trim(),
  idNumber: f.idNumber.trim(),
})
const FIELD_BY_LABEL = { 車頭: 'headPlate', 車尾: 'tailPlate', 姓名: 'ownerName', 身分證: 'idNumber' } as const

/** 「這筆資料」＝名單上唯一的那一列（情境保證只有一筆） */
function theRow(w: World): HTMLElement {
  const rows = w.ui.rows()
  expect(rows, '「這筆資料」需要名單上恰好一筆').toHaveLength(1)
  return rows[0]!
}

async function addViaUi(w: World, input: RecordFields) {
  await w.freshDb()
  w.snapshotBeforeAction = await listRecords()
  w.lastAction = { kind: 'add', input }
  await w.ui.open()
  await w.ui.addRecord(input)
}

async function editThis(w: World, patch: Partial<RecordFields>) {
  await w.ui.goList()
  w.snapshotBeforeAction = await listRecords()
  const target = w.snapshotBeforeAction[0]!
  w.lastAction = { kind: 'edit', id: target.id, input: { ...stripId(target), ...patch } }
  await w.ui.editRow(theRow(w), patch)
}

export function registerRecords(r: Reg) {
  // ── 開啟 ──
  r.when('我開啟名單', async (w) => {
    await w.ui.open()
    await w.ui.goList()
  })
  r.when('我開啟 App', async (w) => {
    await w.ui.open()
  })
  r.when('我關閉並重新開啟 App', async (w) => {
    await w.ui.open()
    await w.ui.restart()
  })

  // ── 新增 ──
  r.when('我新增一筆資料：車頭 {string}、車尾 {string}、姓名 {string}、身分證 {string}', async (w, h, t, n, i) => {
    await addViaUi(w, fields(h, t, n, i))
  })
  r.when('我新增一筆資料，但把「{any}」留空，其餘欄位填入合格內容', async (w, label: string) => {
    const key = FIELD_BY_LABEL[label as keyof typeof FIELD_BY_LABEL]
    expect(key, `未知欄位：${label}`).toBeDefined()
    await addViaUi(w, { ...VALID, [key]: '' })
  })
  r.when('我新增一筆資料，姓名只輸入空白字元，其餘欄位填入合格內容', async (w) => {
    await addViaUi(w, { ...VALID, ownerName: '   ' })
  })

  // ── 存檔結果 ──
  r.step('資料已存檔', async (w) => {
    const a = w.lastAction
    expect(a, '前面沒有新增或編輯的動作').toBeDefined()
    expect(w.ui.form(), '存檔成功後表單應關閉').toBeNull()
    const now = await listRecords()
    const want = trimAll(a!.input)
    if (a!.kind === 'add') {
      expect(now.map(stripId), '新增的資料應已存入（前後空白已去除）').toContainEqual(want)
      expect(now).toHaveLength(w.snapshotBeforeAction.length + 1)
    } else {
      expect(now.find((x) => x.id === a!.id), '被編輯的資料').toMatchObject(want)
      expect(now).toHaveLength(w.snapshotBeforeAction.length)
    }
  })
  r.step('資料不會存檔', async (w) => {
    expect(w.ui.form(), '被擋下時表單應保持開啟').not.toBeNull()
    expect((await listRecords()).map(stripId), '資料庫內容應與動作前相同').toEqual(w.snapshotBeforeAction.map(stripId))
  })

  // ── 擋下訊息 ──
  r.step('畫面告知「{any}」為必填', (w, label: string) => {
    expect(w.ui.alertText()).toContain(`「${label}」為必填`)
  })
  r.step('畫面指出車頭的格式不合，並說明只接受大寫英文或數字、以單一連字號相連', (w) => {
    const text = w.ui.alertText()
    expect(text).toMatch(/車頭.*格式不合/)
    expect(text).toContain('只接受大寫英文或數字、以單一連字號相連')
  })
  r.step('畫面提示這筆資料的身分證檢查碼不符', (w) => {
    const notice = w.ui.notice()
    expect(notice, '存檔成功但身分證有警示時應出現「重複與警示通知」').not.toBeNull()
    const text = norm(notice!.textContent)
    expect(text).toContain('身分證')
    expect(text).toContain('檢查碼不符')
  })

  // ── 編輯 ──
  r.when('我把這筆資料的車頭改成 {string} 並儲存', async (w, v: string) => editThis(w, { headPlate: v }))
  r.when('我把這筆資料的姓名改成 {string} 並儲存', async (w, v: string) => editThis(w, { ownerName: v }))
  r.when('我把這筆資料的身分證改成 {string} 並儲存', async (w, v: string) => editThis(w, { idNumber: v }))
  r.when('我開始編輯這筆資料並把姓名改成 {string}，然後取消', async (w, v: string) => {
    await w.ui.goList()
    await w.ui.openEditForm(theRow(w))
    w.ui.fillForm({ ownerName: v })
    await w.ui.cancelForm()
  })

  // ── 刪除 ──
  r.when('我要求刪除這筆資料並確認', async (w) => {
    await w.ui.goList()
    const dialog = await w.ui.requestDelete(theRow(w))
    await w.ui.confirmDelete(dialog)
  })
  r.when('我要求刪除這筆資料但在確認時取消', async (w) => {
    await w.ui.goList()
    const dialog = await w.ui.requestDelete(theRow(w))
    await w.ui.cancelDelete(dialog)
  })

  // ── 「這筆資料」的內容（畫面與資料庫兩邊都要對）──
  const expectThis = async (w: World, want: Partial<RecordFields>) => {
    await w.ui.goList()
    const row = theRow(w)
    const shown = w.ui.rowValues(row)
    const stored = (await listRecords())[0]!
    for (const [k, v] of Object.entries(want) as Array<[keyof RecordFields, string]>) {
      expect(shown[k], `畫面上的 ${k}`).toBe(v)
      expect(stored[k], `資料庫內的 ${k}`).toBe(v)
    }
  }
  r.step(
    '這筆資料的車頭是 {string}、車尾是 {string}、姓名是 {string}、身分證是 {string}',
    async (w, h, t, n, i) => expectThis(w, fields(h, t, n, i)),
  )
  for (const p of ['這筆資料的車頭是 {string}', '這筆資料的車頭仍是 {string}']) {
    r.step(p, async (w, v: string) => expectThis(w, { headPlate: v }))
  }
  for (const p of ['這筆資料的姓名是 {string}', '這筆資料的姓名仍是 {string}']) {
    r.step(p, async (w, v: string) => expectThis(w, { ownerName: v }))
  }
  r.step('這筆資料的身分證仍完整顯示為 {string}', async (w, v: string) => expectThis(w, { idNumber: v }))
  r.step('這筆資料標示身分證格式警示', async (w) => {
    await w.ui.goList()
    expect(w.ui.marks(theRow(w))).toContain('身分證警示')
  })
  r.step('這筆資料不再標示身分證格式警示', async (w) => {
    await w.ui.goList()
    expect(w.ui.marks(theRow(w))).not.toContain('身分證警示')
  })

  // ── 空狀態與本機資料說明 ──
  r.step('畫面顯示名單目前沒有資料，並提示可以新增或匯入', async (w) => {
    await w.ui.goList()
    expect(await screen.findByText(/名單目前沒有資料/, undefined, { timeout: 2000 })).toBeTruthy()
    expect(w.ui.rows(), '空狀態不該有名單表格').toHaveLength(0)
    expect(screen.getByRole('button', { name: '新增第一筆' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '匯入 Excel' })).toBeTruthy()
  })
  r.step('畫面說明資料只存在這台裝置上', () => {
    expect(within(document.body).getAllByText(/資料只存在這台裝置上/).length).toBeGreaterThan(0)
  })
  r.step('畫面提醒定期匯出 Excel 作為備份', () => {
    expect(within(document.body).getAllByText(/定期匯出 Excel/).length).toBeGreaterThan(0)
  })
}
