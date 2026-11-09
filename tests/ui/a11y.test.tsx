// 元件測試：無障礙退回 1 的修正（a11y-review 發現 1–15）。這些行為 features 沒有涵蓋，也無法用 axe 在 jsdom 驗證，
// 所以逐項把「做對了會是什麼樣子」寫成斷言：焦點落點、標題、live 容器常駐、停用狀態可聚焦、摘要不隨輸入變動。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '../../src/App'
import { CellTooLongError } from '../../src/data/excelWrite'
import { closeDbForTest, resetDbForTest } from '../../src/data/db'
import { createRecord } from '../../src/data/records'
import type { RecordFields } from '../../src/data/types'
import { DataView } from '../../src/ui/DataView'
import { Flash } from '../../src/ui/Flash'
import { ListView } from '../../src/ui/ListView'
import { OverviewView } from '../../src/ui/OverviewView'
import { RecordForm } from '../../src/ui/RecordForm'

const WAIT = { timeout: 3000 }
const rec = (n: number): RecordFields => ({ headPlate: `A${n}-1`, tailPlate: `B${n}-2`, ownerName: `王${n}`, idNumber: 'A123456789' })

beforeEach(async () => {
  await resetDbForTest()
  window.history.replaceState(null, '', '/')
  document.title = ''
})
afterEach(async () => {
  cleanup()
  await closeDbForTest()
  vi.useRealTimers()
})

async function openApp(...records: RecordFields[]) {
  for (const r of records) await createRecord(r)
  render(<App download={() => {}} />)
  await screen.findByRole('table', { name: '車輛所屬名單' }, WAIT)
}

describe('發現 2：觸發點消失後焦點不能掉到 <body>', () => {
  it('刪除一筆後，焦點在名單標題', async () => {
    await openApp(rec(1), rec(2))
    const row = screen.getAllByRole('row')[1]!
    fireEvent.click(within(row).getByRole('button', { name: /^刪除/ }))
    const dialog = await screen.findByRole('dialog', { name: '刪除這筆資料？' })
    fireEvent.click(within(dialog).getByRole('button', { name: '刪除' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '刪除這筆資料？' })).toBeNull(), WAIT)
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2), WAIT) // 標題列＋剩下 1 筆
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '名單', level: 2 }))
  })

  it('空名單按「新增第一筆」存檔後（按鈕消失），焦點在名單標題', async () => {
    render(<App download={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: '新增第一筆' }, WAIT))
    const form = await screen.findByRole('form', { name: '新增資料' })
    for (const [label, value] of [['車頭車號', 'A1-1'], ['車斗車號', 'B1-2'], ['駕駛姓名', '王'], ['駕駛身分證', 'A123456789']] as const) {
      fireEvent.change(within(form).getByRole('textbox', { name: new RegExp(`^${label}`) }), { target: { value } })
    }
    fireEvent.click(within(form).getByRole('button', { name: '儲存' }))
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull(), WAIT)
    await screen.findByRole('table', { name: '車輛所屬名單' }, WAIT)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '名單', level: 2 }))
  })

  it('觸發點仍在時（取消編輯），焦點還給原本的按鈕', async () => {
    await openApp(rec(1))
    const edit = screen.getByRole('button', { name: /^編輯/ })
    edit.focus()
    fireEvent.click(edit)
    const form = await screen.findByRole('form', { name: '編輯資料' })
    fireEvent.click(within(form).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^編輯/ }))
  })
})

describe('發現 3：切換分頁時移焦點到新畫面標題並更新 document.title', () => {
  it('名單 → 總覽 → 資料 → 名單', async () => {
    await openApp(rec(1))
    expect(document.title).toBe('名單 — ochema')
    // 首次載入不搶焦點
    expect(document.activeElement).toBe(document.body)

    fireEvent.click(screen.getByRole('link', { name: /^總覽/ }))
    await waitFor(() => expect(document.title).toBe('總覽 — ochema'), WAIT)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: '重複與警示總覽', level: 2 })), WAIT)

    fireEvent.click(screen.getByRole('link', { name: /^資料$/ }))
    await waitFor(() => expect(document.title).toBe('資料 — ochema'), WAIT)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '資料與備份', level: 2 }))

    fireEvent.click(screen.getByRole('link', { name: /^名單$/ }))
    await waitFor(() => expect(document.title).toBe('名單 — ochema'), WAIT)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '名單', level: 2 }))
  })
})

describe('發現 4：live 容器常駐，內容之後才放進來', () => {
  const listProps = {
    status: 'ready' as const,
    total: 0,
    shown: [],
    keyword: { query: '', applied: '', onChange() {}, onCompositionStart() {}, onCompositionEnd() {}, clear() {} },
    kindsById: new Map(),
    idWarningById: new Map(),
    onDismissNotice() {},
    onAdd() {},
    onEdit() {},
    onDelete() {},
    onImport() {},
    onRetry() {},
  }
  const notice = {
    record: { id: 1, ...rec(1) },
    notices: [{ kind: 'SAME_HEAD' as const, value: 'A1-1', records: [{ id: 2, ...rec(2) }] }],
  }

  it('Notice 的容器在通知出現前就已在 DOM，且出現後是同一個節點', () => {
    const { container, rerender } = render(<ListView {...(listProps as never)} notice={undefined} />)
    const slot = container.querySelector('[data-live="notice"]')
    expect(slot).not.toBeNull()
    expect(slot!.getAttribute('aria-live')).toBe('polite')
    expect(slot!.children).toHaveLength(0)

    rerender(<ListView {...(listProps as never)} notice={notice} />)
    expect(container.querySelector('[data-live="notice"]')).toBe(slot)
    expect(within(slot as HTMLElement).getByRole('status', { name: '重複與警示通知' })).toBeTruthy()
  })

  it('總覽「目前沒有重複與警示」放在先存在的 live 容器裡', () => {
    const clean = { isClean: true, duplicateGroups: [], idWarnings: [] }
    const { container } = render(<OverviewView overview={clean as never} total={3} onEdit={() => {}} onDelete={() => {}} />)
    const slot = container.querySelector('[data-live="overview"]')!
    expect(slot.getAttribute('aria-live')).toBe('polite')
    expect(slot.textContent).toContain('目前沒有重複與警示')
  })

  it('發現 1：總覽乾淨訊息沒有套用查詢框清除鈕的 .clear 樣式', () => {
    const clean = { isClean: true, duplicateGroups: [], idWarnings: [] }
    const { container } = render(<OverviewView overview={clean as never} total={0} onEdit={() => {}} onDelete={() => {}} />)
    expect(container.querySelector('.clear')).toBeNull()
  })

  it('匯出頁的提示（CSV 前導 0）放在先存在的 live 容器裡，並關聯到 CSV radio', () => {
    const { container } = render(<DataView count={1} download={() => {}} onImport={() => {}} onResult={() => {}} theme="system" onTheme={() => {}} />)
    const slot = container.querySelector('[data-live="export-hints"]')!
    expect(slot.textContent).toBe('')
    fireEvent.click(screen.getByRole('radio', { name: 'CSV' }))
    expect(container.querySelector('[data-live="export-hints"]')).toBe(slot)
    expect(slot.textContent).toContain('前導 0')
    const describedBy = screen.getByRole('radio', { name: 'CSV' }).getAttribute('aria-describedby')!
    expect(describedBy.split(' ').map((id) => document.getElementById(id)?.parentElement)).toContain(slot)
  })
})

describe('發現 5：表單錯誤摘要不隨輸入變動', () => {
  it('送出失敗後在欄位打字，摘要文字不變；欄位底下的錯誤即時更新；全部改正後摘要收起', async () => {
    render(<RecordForm onClose={() => {}} onSaved={() => {}} />)
    const form = screen.getByRole('form', { name: '新增資料' })
    fireEvent.click(within(form).getByRole('button', { name: '儲存' }))
    const alert = await screen.findByRole('alert', undefined, WAIT)
    const before = alert.textContent
    expect(before).toContain('請修正 4 個欄位')

    fireEvent.change(within(form).getByRole('textbox', { name: /^車頭車號/ }), { target: { value: 'a' } })
    fireEvent.change(within(form).getByRole('textbox', { name: /^車頭車號/ }), { target: { value: 'AB' } })
    expect(screen.getByRole('alert').textContent).toBe(before) // 摘要維持上次送出的內容
    expect(screen.getByRole('alert')).toBe(alert) // 而且是同一個節點，不是移除重建

    for (const [label, value] of [['車頭車號', 'A1-1'], ['車斗車號', 'B1-2'], ['駕駛姓名', '王'], ['駕駛身分證', 'A123456789']] as const) {
      fireEvent.change(within(form).getByRole('textbox', { name: new RegExp(`^${label}`) }), { target: { value } })
    }
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('發現 6：停用狀態可辨識、原因可聚焦讀到', () => {
  it('匯出 .xls 超限：按鈕 aria-disabled、可聚焦、說明關聯、點了不匯出', () => {
    const download = vi.fn()
    render(<DataView count={70000} download={download} onImport={() => {}} onResult={() => {}} theme="system" onTheme={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: '.xls' }))
    const button = screen.getByRole('button', { name: /^匯出全部/ })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect((button as HTMLButtonElement).disabled).toBe(false)
    button.focus()
    expect(document.activeElement).toBe(button)
    expect(document.getElementById(button.getAttribute('aria-describedby')!)?.textContent).toContain('資料超過 .xls 上限')
    fireEvent.click(button)
    expect(download).not.toHaveBeenCalled()
  })
})

describe('發現 8：結果訊息可關閉、hover／focus 暫停自動消失', () => {
  const flash = { id: 1, body: '已匯出 3 筆資料' }

  it('按「關閉」立刻收起', () => {
    const onExpire = vi.fn()
    render(<Flash flash={flash} onExpire={onExpire} />)
    fireEvent.click(screen.getByRole('button', { name: '關閉' }))
    expect(onExpire).toHaveBeenCalledWith(1)
  })

  it('8 秒後自動消失；游標停在上面時不計時，離開後重新計時', () => {
    vi.useFakeTimers()
    const onExpire = vi.fn()
    const { container } = render(<Flash flash={flash} onExpire={onExpire} />)
    const box = container.querySelector('.flash')!
    fireEvent.mouseEnter(box)
    act(() => void vi.advanceTimersByTime(20_000))
    expect(onExpire).not.toHaveBeenCalled()
    fireEvent.mouseLeave(box)
    act(() => void vi.advanceTimersByTime(7_999))
    expect(onExpire).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1))
    expect(onExpire).toHaveBeenCalledWith(1)
  })

  it('焦點在訊息內（關閉鈕）時不計時', () => {
    vi.useFakeTimers()
    const onExpire = vi.fn()
    render(<Flash flash={flash} onExpire={onExpire} />)
    fireEvent.focus(screen.getByRole('button', { name: '關閉' }))
    act(() => void vi.advanceTimersByTime(20_000))
    expect(onExpire).not.toHaveBeenCalled()
  })

  it('訊息收掉後不留下暫停狀態：下一則照常計時', () => {
    vi.useFakeTimers()
    const onExpire = vi.fn()
    const { container, rerender } = render(<Flash flash={flash} onExpire={onExpire} />)
    fireEvent.mouseEnter(container.querySelector('.flash')!)
    rerender(<Flash flash={undefined} onExpire={onExpire} />)
    rerender(<Flash flash={{ id: 2, body: '下一則' }} onExpire={onExpire} />)
    act(() => void vi.advanceTimersByTime(8_000))
    expect(onExpire).toHaveBeenCalledWith(2)
  })
})

describe('發現 13：主題切換鈕有狀態', () => {
  it('aria-pressed 隨切換改變', async () => {
    await openApp(rec(1))
    const btn = screen.getByRole('button', { name: '暗色主題' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('發現 15：名單表格列索引', () => {
  it('標題列為 1，資料列依序從 2 起，與 aria-rowcount 一致', async () => {
    await openApp(rec(1), rec(2))
    const table = screen.getByRole('table', { name: '車輛所屬名單' })
    expect(table.getAttribute('aria-rowcount')).toBe('3')
    expect(screen.getAllByRole('row').map((r) => r.getAttribute('aria-rowindex'))).toEqual(['1', '2', '3'])
  })
})

describe('資料層新錯誤型別：儲存格超過 32,767 字元', () => {
  it('匯出丟 CellTooLongError 時告知改用 CSV，而不是「匯出失敗」', async () => {
    const exportRecords = await import('../../src/data/excelWrite')
    const spy = vi.spyOn(exportRecords, 'exportRecords').mockRejectedValue(new CellTooLongError(7, 'ownerName', 40000, 32767, 'xlsx'))
    const download = vi.fn()
    render(<DataView count={1} download={download} onImport={() => {}} onResult={() => {}} theme="system" onTheme={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^匯出全部/ }))
    expect((await screen.findByRole('alert')).textContent).toContain('有資料超過 Excel 儲存格上限，請改用 CSV 匯出')
    expect(screen.queryByText(/匯出失敗/)).toBeNull()
    expect(download).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
