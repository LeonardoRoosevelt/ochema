import { expect } from 'vitest'
import { screen } from '@testing-library/react'
import type { ImportMode } from '../../../src/data/types'
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

export const MODE_BY_LABEL: Record<string, ImportMode> = {
  略過重複: 'SKIP_DUPLICATES',
  照樣匯入: 'IMPORT_ALL',
}

/** 在畫面上選檔 → 預覽 → 選擇匯入方式 → 確認，並等到結果出現。 */
export async function importViaUi(w: World, label: '略過重複' | '照樣匯入') {
  const f = currentFile(w)
  await w.ui.open()
  w.previewBefore = await w.records()
  await w.ui.chooseImportFile(makeFile(f.bytes, f.name, f.type))
  await w.ui.chooseImportMode(label)
  await w.ui.confirmImport()
  expect(await screen.findByText(/已匯入\s*\d+\s*筆/, undefined, { timeout: 2000 })).toBeTruthy()
}
