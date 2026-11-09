import { expect } from 'vitest'
import { screen } from '@testing-library/react'
import { deleteAllRecords, listRecords } from '../../../src/data/records'
import { exportRecords } from '../../../src/data/excelWrite'
import { EXPORT_FORMATS, FIELD_ORDER, type ExportFormat } from '../../../src/data/types'
import { startsWithBom, isValidUtf8 } from '../csvFixture'
import { stripId, type World } from '../world'
import { readExportedSheet, type ExportedSheet } from '../workbook'
import type { Reg } from './reg'

const FORMAT_BY_LABEL: Record<string, ExportFormat> = {
  'Excel 檔': 'xlsx',
  Excel: 'xlsx',
  '.xlsx': 'xlsx',
  '.xls': 'xls',
  CSV: 'csv',
}
const formatOf = (label: string): ExportFormat => {
  const f = FORMAT_BY_LABEL[label.trim()]
  if (!f) throw new Error(`未知的匯出格式：${label}`)
  return f
}
const RADIO_BY_FORMAT = { xlsx: '.xlsx', xls: '.xls', csv: 'CSV' } as const
const COL_INDEX = { 車頭車號: 0, 車斗車號: 1, 駕駛姓名: 2, 駕駛身分證: 3 } as const
const HEADERS = ['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證']

const MAGIC = {
  xlsx: [0x50, 0x4b, 0x03, 0x04],
  xls: [0xd0, 0xcf, 0x11, 0xe0],
} as const

function sheetOf(w: World): { sheet: ExportedSheet; format: ExportFormat } {
  expect(w.exported, '尚未匯出').toBeDefined()
  return { sheet: readExportedSheet(w.exported!.bytes, w.exported!.format), format: w.exported!.format }
}

async function exportVia(w: World, format: ExportFormat) {
  w.exportedRecords = (await listRecords()).map(stripId)
  w.exported = await exportRecords(format)
}

/** UI 下載到的檔案（最後一次） */
function downloaded(w: World) {
  const f = w.ui.downloads.at(-1)
  expect(f, '沒有取得任何下載檔').toBeDefined()
  const ext = f!.fileName.split('.').pop()!.toLowerCase() as ExportFormat
  return { file: f!, format: ext, sheet: readExportedSheet(f!.bytes, ext) }
}

export function registerExport(r: Reg) {
  // ════ @api ════
  r.when('我匯出名單', async (w) => {
    w.exportedRecords = (await listRecords()).map(stripId)
    w.exported = await exportRecords() // 預設 .xlsx
  })
  r.when('我把名單匯出成 {any}', async (w, label: string) => exportVia(w, formatOf(label)))
  r.step('我已把名單匯出成 {any}', async (w, label: string) => exportVia(w, formatOf(label)))
  r.step('我把名單全部刪除', async () => {
    await deleteAllRecords()
  })
  r.step('名單上的資料與匯出前完全相同', async (w) => {
    expect((await listRecords()).map(stripId)).toEqual(w.exportedRecords)
    expect(w.exportedRecords.length, '匯出前的名單不該是空的，否則這個斷言沒有意義').toBeGreaterThan(0)
  })

  r.step('匯出檔第一列標題依序為 車頭車號、車斗車號、駕駛姓名、駕駛身分證', (w) => {
    expect(sheetOf(w).sheet.headers).toEqual(HEADERS)
  })
  r.step('匯出檔有 {int} 列資料，順序與名單一致', (w, n: number) => {
    const { sheet } = sheetOf(w)
    expect(sheet.rows).toHaveLength(n)
    expect(sheet.rows).toEqual(w.exportedRecords.map((x) => FIELD_ORDER.map((k) => x[k])))
  })
  r.step('匯出檔有 {int} 列資料', (w, n: number) => {
    expect(sheetOf(w).sheet.rows).toHaveLength(n)
  })
  r.step('匯出檔沒有任何資料列', (w) => {
    expect(sheetOf(w).sheet.rows).toHaveLength(0)
  })
  r.step('匯出檔的內容與名單完全一致，沒有額外欄位', (w) => {
    const { sheet } = sheetOf(w)
    expect(sheet.columnCount, '欄數（不含 id 等額外欄位）').toBe(4)
    expect(sheet.rows).toEqual(w.exportedRecords.map((x) => FIELD_ORDER.map((k) => x[k])))
  })
  r.step('匯出檔的編碼是 UTF-8，且開頭帶有 BOM', (w) => {
    expect(w.exported?.format).toBe('csv')
    const bytes = w.exported!.bytes
    expect(startsWithBom(bytes), 'CSV 前三個位元組應是 EF BB BF').toBe(true)
    expect(isValidUtf8(bytes)).toBe(true)
  })
  // 「儲存格」與「值」兩種說法是同一件事：該欄第一筆資料的值就是原字串；xlsx／xls 還要求是文字型別 t:'s'
  {
    r.step('匯出檔中{any}的值是文字 {string}', (w, col: string, value: string) => {
      const title = col.replace('儲存格', '') as keyof typeof COL_INDEX
      const idx = COL_INDEX[title]
      expect(idx, `未知欄位：${col}`).toBeDefined()
      const { sheet, format } = sheetOf(w)
      expect(sheet.rows.length).toBeGreaterThan(0)
      expect(sheet.rows[0]![idx]).toBe(value)
      if (format !== 'csv') expect(sheet.cellTypes![0]![idx], `${title}儲存格的型別應為文字(s)`).toBe('s')
    })
  }

  // ════ @ui ════
  for (const p of ['我要求匯出名單', '我沒有另外選擇匯出格式，直接要求匯出名單']) {
    r.when(p, async (w) => {
      await w.ui.open()
      await w.ui.exportAll()
    })
  }
  r.when('我選擇以 {any} 匯出名單', async (w, label: string) => {
    await w.ui.open()
    await w.ui.exportAll(RADIO_BY_FORMAT[formatOf(label)])
  })

  r.step('我取得一個 Excel 檔案', (w) => {
    const { file, format } = downloaded(w)
    expect(format).toBe('xlsx')
    expect(file.mimeType).toBe(EXPORT_FORMATS.xlsx.mime)
    expect([...file.bytes.slice(0, 4)]).toEqual(MAGIC.xlsx)
  })
  r.step('我取得一個只有標題列的 Excel 檔案', (w) => {
    const { file, format, sheet } = downloaded(w)
    expect(format).toBe('xlsx')
    expect([...file.bytes.slice(0, 4)]).toEqual(MAGIC.xlsx)
    expect(sheet.headers).toEqual(HEADERS)
    expect(sheet.rows).toHaveLength(0)
  })
  r.step('我取得一個 {any} 格式的檔案', (w, label: string) => {
    const want = formatOf(label)
    const { file, format } = downloaded(w)
    expect(format, `檔名副檔名 ${file.fileName}`).toBe(want)
    expect(file.fileName).toMatch(new RegExp(`^ochema-名單-\\d{8}-\\d{4}\\.${EXPORT_FORMATS[want].ext}$`))
    expect(file.mimeType).toBe(EXPORT_FORMATS[want].mime)
    if (want === 'csv') expect(startsWithBom(file.bytes)).toBe(true)
    else expect([...file.bytes.slice(0, 4)]).toEqual(MAGIC[want])
  })
  r.step('畫面告知已匯出 {int} 筆資料', async (w, n: number) => {
    expect((await screen.findAllByText(new RegExp(`已匯出\\s*${n}\\s*筆資料`), undefined, { timeout: 2000 })).length).toBeGreaterThan(0)
    // 告知的數字要與實際取得的檔案一致
    expect(downloaded(w).sheet.rows).toHaveLength(n)
  })
  const exportedRows = (w: World, n: number, names: string[]) => {
    const { sheet } = downloaded(w)
    expect(sheet.rows, '匯出的資料列數').toHaveLength(n)
    expect(sheet.rows.map((row) => row[COL_INDEX['駕駛姓名']])).toEqual(expect.arrayContaining(names))
  }
  r.step('匯出的 {any} 檔有 {int} 列資料，包含駕駛姓名 {string} 與 {string}', (w, _label: string, n: number, a: string, b: string) => {
    exportedRows(w, n, [a, b])
  })
  r.step('匯出的 {any} 檔有 {int} 列資料', (w, _label: string, n: number) => {
    expect(downloaded(w).sheet.rows, '匯出的資料列數').toHaveLength(n)
  })
}
