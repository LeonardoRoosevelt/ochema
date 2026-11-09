// 元件測試：匯入確認的規則（製片人裁決）——選項永遠顯示且不預選；有重複時未選前「確認匯入」停用，無重複時可直接確認。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ImportPreview, PreviewRow, RecordFields } from '../../src/data/types'

const previewImport = vi.fn()
const commitImport = vi.fn()
vi.mock('../../src/data/importer', () => ({
  previewImport: (b: Uint8Array) => previewImport(b),
  commitImport: (p: ImportPreview, m: string) => commitImport(p, m),
}))

import { ImportView, expectedImports } from '../../src/ui/ImportView'

afterEach(() => {
  cleanup()
  previewImport.mockReset()
  commitImport.mockReset()
})

const F: RecordFields = { headPlate: 'AAA-1', tailPlate: 'B-2', ownerName: '王', idNumber: 'A123456789' }
function row(fileRow: number, category: PreviewRow['category'], extra: Partial<PreviewRow> = {}): PreviewRow {
  return { fileRow, fields: F, category, kinds: [], existingConflicts: [], inFileConflicts: [], ...extra }
}
function preview(rows: PreviewRow[]): ImportPreview {
  const n = (c: PreviewRow['category']) => rows.filter((r) => r.category === c).length
  return {
    rows,
    counts: { total: rows.length, new: n('NEW'), dupExisting: n('DUP_EXISTING'), dupInFile: n('DUP_IN_FILE'), formatError: n('FORMAT_ERROR') },
    identicalRows: rows.filter((r) => r.identicalTo).map((r) => r.fileRow),
    source: [],
  }
}

async function choose(p: ImportPreview) {
  previewImport.mockResolvedValue({ ok: true, preview: p })
  render(<ImportView onCommitted={() => {}} onCancel={() => {}} />)
  const input = screen.getByLabelText('選擇 Excel 檔')
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.xlsx')] } })
  return (await screen.findByRole('button', { name: '確認匯入' })) as HTMLButtonElement
}

// 一筆新增 + 一筆同車頭重複（非整列相同）+ 一筆整列相同
const withDups = () =>
  preview([
    row(2, 'NEW'),
    row(3, 'DUP_EXISTING', { kinds: ['SAME_HEAD'] }),
    row(4, 'DUP_EXISTING', { kinds: ['IDENTICAL_ROW', 'SAME_HEAD'], identicalTo: { source: 'EXISTING', recordId: 1 } }),
  ])

const blocked = (b: HTMLElement) => b.getAttribute('aria-disabled') === 'true'

describe('匯入確認', () => {
  it('有重複時：未選匯入方式前「確認匯入」停用並說明原因，選了才可用', async () => {
    const confirm = await choose(withDups())
    expect(blocked(confirm)).toBe(true)
    expect(screen.getByText('請先選擇上方的匯入方式。')).toBeTruthy()
    // 不用原生 disabled：鍵盤要能聚焦到按鈕，並由 aria-describedby 讀到原因；點了也不能送出
    confirm.focus()
    expect(document.activeElement).toBe(confirm)
    expect(document.getElementById(confirm.getAttribute('aria-describedby')!)?.textContent).toBe('請先選擇上方的匯入方式。')
    fireEvent.click(confirm)
    expect(commitImport).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: '略過重複' }))
    expect(blocked(confirm)).toBe(false)
  })

  it('預計匯入筆數：整列相同的列兩種選項都不匯入', () => {
    const p = withDups()
    expect(expectedImports(p, 'SKIP_DUPLICATES')).toBe(1)
    expect(expectedImports(p, 'IMPORT_ALL')).toBe(2) // 新增 1 + 同車頭 1；整列相同那列不算
  })

  it('確認時把使用者選的方式交給資料層（照樣匯入 ≠ 略過重複）', async () => {
    commitImport.mockResolvedValue({ imported: 2, skipped: 1, formatErrorsNotImported: 0 })
    const p = withDups()
    const confirm = await choose(p)
    fireEvent.click(screen.getByRole('radio', { name: '照樣匯入' }))
    fireEvent.click(confirm)
    await screen.findByText(/已匯入 2 筆、略過 1 筆/)
    expect(commitImport).toHaveBeenCalledWith(p, 'IMPORT_ALL')
  })

  it('整列相同的列單獨告知「兩種選項都不會匯入」', async () => {
    await choose(withDups())
    expect(screen.getByText(/都不會匯入/)).toBeTruthy()
    expect(screen.getByText(/檔案第 4 列：與既有資料整列相同/)).toBeTruthy()
  })

  it('沒有任何重複時：選項仍顯示且不預選，未選也可直接確認（視同略過重複）', async () => {
    const confirm = await choose(preview([row(2, 'NEW'), row(3, 'FORMAT_ERROR', { error: { field: 'headPlate', code: 'PLATE_LOWERCASE' } })]))
    commitImport.mockResolvedValue({ imported: 1, skipped: 0, formatErrorsNotImported: 1 })
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getAllByRole('radio').some((r) => (r as HTMLInputElement).checked)).toBe(false)
    expect(blocked(confirm)).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() => expect(commitImport).toHaveBeenCalledWith(expect.anything(), 'SKIP_DUPLICATES'))
  })

  it('沒有任何可匯入的列（全是格式錯誤）時確認鈕停用並說明', async () => {
    const confirm = await choose(preview([row(2, 'FORMAT_ERROR', { error: { field: 'ownerName', code: 'REQUIRED' } })]))
    expect(blocked(confirm)).toBe(true)
    expect(screen.getByText('沒有可匯入的資料。')).toBeTruthy()
  })
})
