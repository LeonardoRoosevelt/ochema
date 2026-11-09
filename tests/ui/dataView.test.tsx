// 元件測試：契約有、features 沒涵蓋的匯出提示（Q-D CSV 前導 0、Q-F .xls 超量）。
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const exportRecords = vi.fn()
vi.mock('../../src/data/excelWrite', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/data/excelWrite')>()),
  exportRecords: (f: string) => exportRecords(f),
}))

import { XLS_MAX_ROWS } from '../../src/data/excelWrite'
import { DataView } from '../../src/ui/DataView'

afterEach(() => {
  cleanup()
  exportRecords.mockReset()
})

function show(count: number) {
  const download = vi.fn()
  const onResult = vi.fn()
  render(<DataView count={count} download={download} onImport={() => {}} onResult={onResult} theme="system" onTheme={() => {}} />)
  return { download, onResult }
}
const pick = (name: string) => fireEvent.click(screen.getByRole('radio', { name }))
const exportButton = () => screen.getByRole('button', { name: /^匯出全部/ }) as HTMLButtonElement

describe('Q-D：選 CSV 匯出時提示前導 0 可能消失', () => {
  it('只有選 CSV 才出現提示，且建議改用 .xlsx', () => {
    show(3)
    expect(screen.queryByText(/前導 0 可能被吃掉/)).toBeNull()
    pick('CSV')
    expect(screen.getByText(/前導 0 可能被吃掉/).textContent).toContain('.xlsx')
    pick('.xls')
    expect(screen.queryByText(/前導 0 可能被吃掉/)).toBeNull()
  })
})

describe('Q-F：.xls 超過 65,536 列', () => {
  it('筆數加標題列超過上限時，選 .xls 就告知改用 .xlsx 且不能匯出', () => {
    show(XLS_MAX_ROWS) // 資料 65,536 筆 + 標題列 = 65,537 列
    pick('.xls')
    expect(screen.getByText(/資料超過 \.xls 上限/).textContent).toContain('請改用 .xlsx')
    expect(exportButton().getAttribute("aria-disabled")).toBe("true")
    pick('.xlsx')
    expect(screen.queryByText(/資料超過 \.xls 上限/)).toBeNull()
    expect(exportButton().getAttribute("aria-disabled")).toBeNull()
  })

  it('剛好放得下（資料 + 標題列 = 65,536 列）不攔', () => {
    show(XLS_MAX_ROWS - 1)
    pick('.xls')
    expect(exportButton().getAttribute("aria-disabled")).toBeNull()
  })

  it('資料層丟 XlsRowLimitError 時顯示同樣的告知，而不是未處理錯誤', async () => {
    const err = new Error('too many')
    err.name = 'XlsRowLimitError'
    exportRecords.mockRejectedValue(err)
    const { download, onResult } = show(5)
    pick('.xls')
    fireEvent.click(exportButton())
    await waitFor(() => expect(screen.getByText(/資料超過 \.xls 上限/)).toBeTruthy())
    expect(download).not.toHaveBeenCalled()
    expect(onResult).not.toHaveBeenCalled()
  })
})
