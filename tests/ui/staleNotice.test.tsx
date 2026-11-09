// 製片人補測：整份替換後，名單頁不得殘留指向已被刪除資料的「已儲存…」通知（終審發現）。
import { afterEach, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { NOTICE_NAME, Ui, makeFile } from '../support/ui'
import { buildFileBytes, fileNameFor, mimeFor } from '../support/workbook'

const ui = new Ui()
afterEach(() => ui.dispose())

it('替換匯入後，先前新增時的重複通知不再顯示', async () => {
  await ui.open()
  await ui.addRecord({ headPlate: 'KLP-7988', tailPlate: '20-9A', ownerName: '王大明', idNumber: 'A123456789' })
  await ui.addRecord({ headPlate: 'KLP-7988', tailPlate: 'OL-02', ownerName: '陳小美', idNumber: 'B123456780' })
  expect(await screen.findByRole('status', { name: NOTICE_NAME })).toBeTruthy()

  await ui.goData()
  const spec = { kind: 'xlsx' as const, headers: ['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證'], rows: [['929-X2', '99-Q9', '林一', 'A123456789']] }
  await ui.chooseImportFile(makeFile(buildFileBytes(spec), fileNameFor('xlsx'), mimeFor('xlsx')))
  await ui.confirmImport()
  await ui.confirmReplace()
  await screen.findByText(/已匯入\s*1\s*筆/)

  await ui.goList()
  await ui.expectRowCount(1)
  expect(screen.queryByRole('status', { name: NOTICE_NAME })).toBeNull()
  expect(screen.queryByText(/陳小美/)).toBeNull()
})
