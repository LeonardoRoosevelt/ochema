// 元件測試：匯入＝整份替換的畫面規則（使用者裁決 2026-11-09）。
// 資料層以 mock 隔離，只驗畫面：格式錯誤時確認 aria-disabled、二次確認框（預設焦點取消、取消不動、先匯出不動）、結果文字。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ImportPreview, PreviewRow, RecordFields } from '../../src/data/types'

const previewImport = vi.fn()
const replaceAllFromImport = vi.fn()
const exportRecords = vi.fn()
vi.mock('../../src/data/importer', () => ({
  previewImport: (b: Uint8Array) => previewImport(b),
  replaceAllFromImport: (p: ImportPreview) => replaceAllFromImport(p),
}))
vi.mock('../../src/data/excelWrite', () => ({
  exportRecords: (f?: string) => exportRecords(f),
}))

import { ImportView } from '../../src/ui/ImportView'

afterEach(() => {
  cleanup()
  previewImport.mockReset()
  replaceAllFromImport.mockReset()
  exportRecords.mockReset()
})

const F: RecordFields = { headPlate: 'AAA-1', tailPlate: 'B-2', ownerName: '王', idNumber: 'A123456789' }
function row(fileRow: number, category: PreviewRow['category'], extra: Partial<PreviewRow> = {}): PreviewRow {
  return { fileRow, fields: F, category, kinds: [], inFileConflicts: [], ...extra }
}
function preview(rows: PreviewRow[], currentCount = 3): ImportPreview {
  const n = (c: PreviewRow['category']) => rows.filter((r) => r.category === c).length
  const counts = { total: rows.length, new: n('NEW'), dupInFile: n('DUP_IN_FILE'), identicalInFile: n('IDENTICAL_IN_FILE'), formatError: n('FORMAT_ERROR') }
  return {
    rows,
    counts,
    identicalRows: rows.filter((r) => r.category === 'IDENTICAL_IN_FILE').map((r) => r.fileRow),
    willDelete: currentCount,
    willImport: counts.new + counts.dupInFile,
    merged: counts.identicalInFile,
    canConfirm: counts.formatError === 0 && counts.total > 0,
  }
}

const noop = () => {}
async function choose(p: ImportPreview, props: { onCommitted?: () => void; download?: (f: unknown) => void } = {}) {
  previewImport.mockResolvedValue({ ok: true, preview: p })
  render(<ImportView onCommitted={props.onCommitted ?? noop} onCancel={noop} download={props.download ?? noop} />)
  fireEvent.change(screen.getByLabelText('選擇 Excel 檔'), { target: { files: [new File(['x'], 'a.xlsx')] } })
  return (await screen.findByRole('button', { name: '確認匯入' })) as HTMLButtonElement
}

// 可匯入 1、檔內重複 1（會匯入）、整列相同 1（合併）
const clean = (currentCount = 3) =>
  preview(
    [row(2, 'NEW'), row(3, 'DUP_IN_FILE', { kinds: ['SAME_HEAD'] }), row(4, 'IDENTICAL_IN_FILE', { identicalTo: { fileRow: 2 } })],
    currentCount,
  )

describe('預覽畫面', () => {
  it('寫明「將刪除目前 N 筆、匯入 M 筆」，四類統計，整列相同合併告知；沒有任何處理重複的選項', async () => {
    await choose(clean(3))
    expect(screen.getByText(/將刪除目前\s*3\s*筆、匯入\s*2\s*筆/)).toBeTruthy()
    expect(screen.getAllByText(/可匯入\s*1\s*筆/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/檔內重複\s*1\s*筆/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/整列相同\s*1\s*筆/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/格式錯誤\s*0\s*筆/).length).toBeGreaterThan(0)
    expect(screen.getByText(/檔案第 4 列：與檔案第 2 列整列相同/)).toBeTruthy()
    expect(screen.getByText(/合併為一筆/)).toBeTruthy()
    expect(screen.queryAllByRole('radio'), '不該有任何選項').toHaveLength(0)
    expect(screen.queryByText(/略過重複|照樣匯入|與既有資料重複/)).toBeNull()
    const names = screen.getAllByRole('button').map((b) => b.textContent?.trim())
    expect(names.filter((n) => n === '確認匯入' || n === '取消').sort()).toEqual(['取消', '確認匯入'])
  })

  it('有格式錯誤：「確認匯入」aria-disabled、可聚焦、說明原因；點了不會跳二次確認；不顯示「將刪除」', async () => {
    const confirm = await choose(preview([row(2, 'NEW'), row(3, 'FORMAT_ERROR', { error: { field: 'headPlate', code: 'PLATE_LOWERCASE' } })]))
    expect(confirm.getAttribute('aria-disabled')).toBe('true')
    confirm.focus()
    expect(document.activeElement).toBe(confirm) // 不用原生 disabled，鍵盤才讀得到原因
    const why = document.getElementById(confirm.getAttribute('aria-describedby')!)
    expect(why?.textContent).toMatch(/格式錯誤/)
    fireEvent.click(confirm)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(replaceAllFromImport).not.toHaveBeenCalled()
    expect(screen.queryByText(/將刪除目前/)).toBeNull()
  })

  it('檔案沒有資料列：不提供確認匯入，也沒有「將刪除」', async () => {
    previewImport.mockResolvedValue({ ok: true, preview: preview([]) })
    render(<ImportView onCommitted={noop} onCancel={noop} download={noop} />)
    fireEvent.change(screen.getByLabelText('選擇 Excel 檔'), { target: { files: [new File(['x'], 'a.xlsx')] } })
    await screen.findByText('檔案內沒有可匯入的資料')
    expect(screen.queryByRole('button', { name: '確認匯入' })).toBeNull()
    expect(screen.queryByText(/將刪除目前/)).toBeNull()
  })
})

describe('二次確認框', () => {
  it('按「確認匯入」跳出原生 dialog，預設焦點在「取消」，此時尚未替換', async () => {
    const confirm = await choose(clean())
    fireEvent.click(confirm)
    const dialog = await screen.findByRole('dialog', { name: '確認替換整份名單？' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: '取消' }))
    expect(within(dialog).getByRole('button', { name: '先匯出目前資料' })).toBeTruthy()
    expect(within(dialog).getByText(/目前\s*3\s*筆/)).toBeTruthy()
    expect(replaceAllFromImport).not.toHaveBeenCalled()
  })

  it('名單是空的（將刪除 0 筆）也要二次確認', async () => {
    const confirm = await choose(clean(0))
    fireEvent.click(confirm)
    await screen.findByRole('dialog', { name: '確認替換整份名單？' })
    expect(replaceAllFromImport).not.toHaveBeenCalled()
  })

  it('取消：對話框關閉、不呼叫替換、預覽仍在、焦點回到「確認匯入」', async () => {
    const onCommitted = vi.fn()
    const confirm = await choose(clean(), { onCommitted })
    confirm.focus()
    fireEvent.click(confirm)
    const dialog = await screen.findByRole('dialog', { name: '確認替換整份名單？' })
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(replaceAllFromImport).not.toHaveBeenCalled()
    expect(onCommitted).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '確認匯入' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '確認匯入' }))
  })

  it('先匯出目前資料：匯出全部、預設 .xlsx，交給下載；對話框仍開著、不呼叫替換', async () => {
    exportRecords.mockResolvedValue({ bytes: new Uint8Array([1]), count: 3, fileName: 'ochema-x.xlsx', mimeType: 'x', format: 'xlsx' })
    const download = vi.fn()
    const confirm = await choose(clean(), { download })
    fireEvent.click(confirm)
    const dialog = await screen.findByRole('dialog', { name: '確認替換整份名單？' })
    fireEvent.click(within(dialog).getByRole('button', { name: '先匯出目前資料' }))
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    expect(exportRecords).toHaveBeenCalledWith('xlsx')
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'ochema-x.xlsx' }))
    expect(screen.getByRole('dialog', { name: '確認替換整份名單？' })).toBeTruthy()
    expect(await within(dialog).findByText(/已匯出\s*3\s*筆/)).toBeTruthy()
    expect(replaceAllFromImport).not.toHaveBeenCalled()
  })

  it('先匯出失敗：對話框內告知，仍不替換', async () => {
    exportRecords.mockRejectedValue(new Error('boom'))
    const confirm = await choose(clean())
    fireEvent.click(confirm)
    const dialog = await screen.findByRole('dialog', { name: '確認替換整份名單？' })
    fireEvent.click(within(dialog).getByRole('button', { name: '先匯出目前資料' }))
    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(replaceAllFromImport).not.toHaveBeenCalled()
  })

  it('確認替換：把預覽交給資料層，顯示「已刪除 N 筆、已匯入 M 筆」與合併筆數，並通知外層重新載入', async () => {
    replaceAllFromImport.mockResolvedValue({ ok: true, result: { deleted: 3, imported: 2, merged: 1 } })
    const onCommitted = vi.fn()
    const p = clean()
    const confirm = await choose(p, { onCommitted })
    fireEvent.click(confirm)
    const dialog = await screen.findByRole('dialog', { name: '確認替換整份名單？' })
    fireEvent.click(within(dialog).getByRole('button', { name: '確認替換' }))
    expect(await screen.findByText(/已刪除\s*3\s*筆、已匯入\s*2\s*筆/)).toBeTruthy()
    expect(screen.getByText(/合併\s*1\s*筆整列相同/)).toBeTruthy()
    expect(replaceAllFromImport).toHaveBeenCalledWith(p)
    expect(onCommitted).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('寫入失敗：對話框關閉，預覽仍在並告知「名單沒有任何變更」', async () => {
    replaceAllFromImport.mockResolvedValue({ ok: false, reason: 'WRITE_FAILED' })
    const onCommitted = vi.fn()
    const confirm = await choose(clean(), { onCommitted })
    fireEvent.click(confirm)
    const dialog = await screen.findByRole('dialog', { name: '確認替換整份名單？' })
    fireEvent.click(within(dialog).getByRole('button', { name: '確認替換' }))
    expect(await screen.findByText(/名單沒有任何變更/)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: '確認匯入' })).toBeTruthy()
    expect(onCommitted).not.toHaveBeenCalled()
  })
})
