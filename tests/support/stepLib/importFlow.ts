import { expect } from 'vitest'
import { screen } from '@testing-library/react'
import type { World } from '../world'
import { buildFileBytes, fileNameFor, mimeFor, type FileKind } from '../workbook'
import { makeFile } from '../ui'

/** 目前情境要匯入的檔案位元組：優先「原始位元組」，其次「標題列＋資料列」描述，最後是剛匯出的檔。 */
export function currentFile(w: World): { bytes: Uint8Array; name: string; type: string } {
  if (w.rawFile) return { bytes: w.rawFile.bytes, name: w.rawFile.name, type: 'application/octet-stream' }
  if (w.spec) {
    const kind: FileKind = w.spec.kind
    return { bytes: buildFileBytes(w.spec), name: fileNameFor(kind), type: mimeFor(kind) }
  }
  if (w.exported) {
    const kind: FileKind = w.exported.format === 'csv' ? 'csv' : w.exported.format
    return { bytes: w.exported.bytes, name: w.exported.fileName, type: mimeFor(kind) }
  }
  throw new Error('這個情境沒有準備任何要匯入的檔案')
}

/** 在畫面上選檔 → 預覽 → 按「確認匯入」→ 二次確認框按「確認替換」，並等到結果出現。 */
export async function importViaUi(w: World) {
  const f = currentFile(w)
  await w.ui.open()
  w.previewBefore = await w.records()
  await w.ui.chooseImportFile(makeFile(f.bytes, f.name, f.type))
  await w.ui.confirmImport()
  await w.ui.confirmReplace()
  expect(await screen.findByText(/已匯入\s*\d+\s*筆/, undefined, { timeout: 2000 })).toBeTruthy()
}
