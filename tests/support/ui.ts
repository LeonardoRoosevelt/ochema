/**
 * UI 驅動器：以角色與可及名稱操作 <App/>，不依賴 CSS class 或 DOM 結構。
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  畫面可及名稱契約（第二段前端實作必須滿足；本檔是它的可執行版本）
 *  來源：design/ia.md、design/directions/ledger/brief.md；括號內為對應的 IA 畫面編號。
 * ════════════════════════════════════════════════════════════════════════════
 *  <App download?>   download(file: {fileName, mimeType, bytes}) 為可注入的下載函式（預設 Blob＋<a download>）。
 *  導覽（navigation）  三個 link：「名單」（預設首頁）、「總覽」（名稱可帶徽章數字，以「總覽」開頭）、「資料」。
 *  S1 名單
 *    - textbox「查詢」（關鍵字）；有關鍵字時出現 button「清除關鍵字」；查無結果時另有同名按鈕。
 *    - 名單本體為 table「車輛所屬名單」：第 1 列為 columnheader；之後每筆一個 row，
 *      cell 依序為 車頭、車尾、姓名、身分證、標示、操作。前四格文字就是值（完整、未遮罩）。
 *      「標示」格含重複種類文字（同車頭／同車尾／同身分證不同姓名）與身分證警示文字「身分證警示：<原因>」。
 *      「操作」格有 button「編輯…」「刪除…」（名稱以此二字開頭，可帶車牌等識別）。
 *    - 空名單（0 筆且無查詢）：文字「名單目前沒有資料」＋ button「新增第一筆」「匯入 Excel」，且沒有 table。
 *    - 有查詢但 0 筆：文字「查無符合的資料」。
 *    - button「新增資料」開啟 S2。
 *    - C2 常駐說明含「資料只存在這台裝置上」「定期匯出 Excel」。
 *  S2 表單：form 名稱「新增資料」或「編輯資料」；textbox 名稱以「車頭」「車尾」「姓名」「身分證」開頭；
 *    button「儲存」「取消」。擋下的訊息放在 role=alert：
 *      必填 →「「姓名」為必填」；車牌 →「車頭 格式不合」＋「只接受大寫英文或數字、以單一連字號相連」；
 *      整列相同 →「與既有資料整列相同，未儲存」＋既有那筆的四欄值。
 *    存檔成功則 form 消失。擋下時 form 保持開啟。
 *  C1 存檔後通知：role=status、名稱「重複與警示通知」，內含重複種類、衝突既有資料的欄位值、身分證警示原因
 *    （例如「檢查碼不符」）；沒有新問題時整個元素不存在。
 *  S3 刪除確認：dialog 名稱「刪除這筆資料？」，內有 button「刪除」「取消」。
 *  S5 總覽（link「總覽」）：每個重複組是 role=group、名稱「<種類> <值>」（如「同車頭 929-X2」），
 *    內文含「涉及 N 筆資料」；每筆身分證警示是 role=group、名稱「身分證警示 <姓名>」，內文含警示原因。
 *    無問題時文字「目前沒有重複與警示」。
 *  S6 資料（link「資料」）：radiogroup「匯出格式」內 radio「.xlsx」（預設選取）「.xls」「CSV」；
 *    button「匯出全部…」（名稱以此開頭）；button「匯入 Excel」進入 S4；
 *    C3 結果訊息放在 role=status，內含「已匯出 N 筆資料」。
 *  S4 匯入：file input 標籤「選擇 Excel 檔」；選檔後顯示預覽：
 *    統計文字「可新增 N 筆」「與既有資料重複 N 筆」「檔內重複 N 筆」「格式錯誤 N 筆」；
 *    格式錯誤明細的同一個 listitem／row 內有「檔案第 N 列」與錯誤原因文字（文案見 ia.md 5.1）；
 *    radio「略過重複」「照樣匯入」；button「確認匯入」（預設已有選項，見回報待決問題）；button「取消」。
 *    結果文字「已匯入 N 筆、略過 M 筆」（有格式錯誤時加「格式錯誤未匯入 K 筆」）；button/link「回到名單」。
 *    無法讀取：文字「檔案無法讀取」；Big5 另含「CSV UTF-8」提示；此時沒有預覽統計、沒有選項、沒有「確認匯入」。
 * ════════════════════════════════════════════════════════════════════════════
 */
import { createElement } from 'react'
import { expect } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import { App, type DownloadedFile } from '../../src/App'
import type { RecordFields } from '../../src/data/types'
import { NetworkGuard } from './network'

export const LIST_NAME = '車輛所屬名單'
export const FORM_NAMES = { add: '新增資料', edit: '編輯資料' } as const
export const NOTICE_NAME = '重複與警示通知'
const WAIT = { timeout: 2000 }

const FIELD_LABELS: Record<keyof RecordFields, string> = {
  headPlate: '車頭',
  tailPlate: '車尾',
  ownerName: '姓名',
  idNumber: '身分證',
}

export const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

export class Ui {
  readonly downloads: DownloadedFile[] = []
  readonly network = new NetworkGuard()
  private view?: RenderResult

  // ── 啟動 ────────────────────────────────────────────
  get mounted() {
    return this.view !== undefined
  }

  /** render <App/> 並等名單頁載入完成；已 render 則什麼都不做（表單開著時不能要求名單頁在場）。 */
  async open(): Promise<void> {
    if (this.view) return
    this.mount()
    await this.ready()
  }

  private mount() {
    window.history.replaceState(null, '', '/')
    this.network.install()
    this.view = render(createElement(App, { download: (f) => void this.downloads.push(f) }))
  }

  /** 等到名單頁載入完成（出現名單表格、空狀態或查無結果）。 */
  async ready(): Promise<void> {
    await waitFor(() => {
      const loaded =
        screen.queryByRole('table', { name: LIST_NAME }) ??
        screen.queryByText(/名單目前沒有資料/) ??
        screen.queryByText(/查無符合的資料/)
      expect(
        loaded,
        `名單頁沒有載入完成（找不到名單表格、空狀態或查無結果）。目前畫面文字：「${norm(document.body.textContent).slice(0, 160)}」`,
      ).not.toBeNull()
    }, WAIT)
  }

  /** 關閉並重新開啟 App：卸載後重新 render，資料庫保留。 */
  async restart(): Promise<void> {
    this.view?.unmount()
    this.view = undefined
    await this.open()
  }

  dispose() {
    this.view?.unmount()
    this.view = undefined
    cleanup()
    this.network.uninstall()
  }

  // ── 導覽 ────────────────────────────────────────────
  async goList() {
    await this.open()
    await this.leaveForm()
    fireEvent.click(await screen.findByRole('link', { name: /^名單$/ }, WAIT))
    await this.ready()
  }

  async goOverview() {
    await this.open()
    await this.leaveForm()
    fireEvent.click(await screen.findByRole('link', { name: /^總覽/ }, WAIT))
  }

  async goData() {
    await this.open()
    await this.leaveForm()
    fireEvent.click(await screen.findByRole('link', { name: /^資料$/ }, WAIT))
  }

  /** 表單開著時先取消（手機的表單是整頁，沒有導覽）。 */
  private async leaveForm() {
    if (this.form()) fireEvent.click(within(this.form()!).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(this.form()).toBeNull(), WAIT)
    const dialog = screen.queryByRole('dialog', { name: '刪除這筆資料？' })
    if (dialog) fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
  }

  // ── 名單 ────────────────────────────────────────────
  searchBox(): HTMLInputElement {
    return screen.getByRole('textbox', { name: /^查詢/ }) as HTMLInputElement
  }

  async search(keyword: string) {
    await this.goList()
    fireEvent.change(this.searchBox(), { target: { value: keyword } })
    // 關鍵字改變後名單會（可能延遲 ≤150ms）重新篩選；等輸入框值生效即可，結果由後續斷言輪詢
    await waitFor(() => expect(this.searchBox().value).toBe(keyword), WAIT)
  }

  async clearSearch() {
    fireEvent.click(await screen.findByRole('button', { name: '清除關鍵字' }, WAIT))
  }

  /** 名單的資料列（不含標題列）；沒有表格（空狀態／查無結果）回傳空陣列。 */
  rows(): HTMLElement[] {
    const table = screen.queryByRole('table', { name: LIST_NAME })
    if (!table) return []
    return within(table)
      .getAllByRole('row')
      .filter((r) => within(r).queryAllByRole('columnheader').length === 0)
  }

  /** 前六格：車頭、車尾、姓名、身分證、標示、操作 */
  cells(row: HTMLElement): HTMLElement[] {
    return within(row).getAllByRole('cell')
  }

  rowValues(row: HTMLElement): RecordFields {
    const c = this.cells(row).map((x) => norm(x.textContent))
    return { headPlate: c[0] ?? '', tailPlate: c[1] ?? '', ownerName: c[2] ?? '', idNumber: c[3] ?? '' }
  }

  /** 標示格文字（重複種類＋身分證警示） */
  marks(row: HTMLElement): string {
    return norm(this.cells(row)[4]?.textContent)
  }

  allRowValues(): RecordFields[] {
    return this.rows().map((r) => this.rowValues(r))
  }

  rowBy(field: keyof RecordFields, value: string): HTMLElement {
    const hits = this.rows().filter((r) => this.rowValues(r)[field] === value)
    if (hits.length !== 1) throw new Error(`名單上以${FIELD_LABELS[field]}「${value}」找到 ${hits.length} 列（預期 1 列）`)
    return hits[0]!
  }

  /** 等名單剛好有 n 列（含重新篩選、重新載入的等待）。 */
  async expectRowCount(n: number) {
    await waitFor(() => expect(this.rows()).toHaveLength(n), WAIT)
  }

  // ── 表單 ────────────────────────────────────────────
  form(): HTMLElement | null {
    return (
      screen.queryByRole('form', { name: FORM_NAMES.add }) ?? screen.queryByRole('form', { name: FORM_NAMES.edit })
    )
  }

  async openAddForm() {
    await this.goList()
    const buttons = screen.getAllByRole('button', { name: FORM_NAMES.add })
    fireEvent.click(buttons[0]!)
    await screen.findByRole('form', { name: FORM_NAMES.add }, WAIT)
  }

  async openEditForm(row: HTMLElement) {
    fireEvent.click(within(row).getByRole('button', { name: /^編輯/ }))
    await screen.findByRole('form', { name: FORM_NAMES.edit }, WAIT)
  }

  fillForm(values: Partial<RecordFields>) {
    const form = this.form()
    if (!form) throw new Error('表單沒有開啟')
    for (const [key, value] of Object.entries(values) as Array<[keyof RecordFields, string]>) {
      const input = within(form).getByRole('textbox', { name: new RegExp(`^${FIELD_LABELS[key]}`) })
      fireEvent.change(input, { target: { value } })
    }
  }

  /** 按「儲存」，等到「表單關閉」或「出現擋下訊息」其一。 */
  async submitForm() {
    const form = this.form()
    if (!form) throw new Error('表單沒有開啟')
    fireEvent.click(within(form).getByRole('button', { name: '儲存' }))
    await waitFor(() => {
      const closed = this.form() === null
      const blocked = screen.queryAllByRole('alert').length > 0
      expect(closed || blocked, '送出後既沒有關閉表單，也沒有出現擋下訊息').toBe(true)
    }, WAIT)
  }

  async cancelForm() {
    const form = this.form()
    if (!form) throw new Error('表單沒有開啟')
    fireEvent.click(within(form).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(this.form()).toBeNull(), WAIT)
  }

  async addRecord(values: RecordFields) {
    await this.openAddForm()
    this.fillForm(values)
    await this.submitForm()
  }

  /** 開啟指定那列的編輯表單、改欄位並儲存（等到關閉或被擋）。 */
  async editRow(row: HTMLElement, values: Partial<RecordFields>) {
    await this.openEditForm(row)
    this.fillForm(values)
    await this.submitForm()
  }

  alertText(): string {
    return norm(
      screen
        .queryAllByRole('alert')
        .map((a) => a.textContent)
        .join(' '),
    )
  }

  /** C1 存檔後通知（不存在回傳 null） */
  notice(): HTMLElement | null {
    return screen.queryByRole('status', { name: NOTICE_NAME })
  }

  // ── 刪除 ────────────────────────────────────────────
  async requestDelete(row: HTMLElement): Promise<HTMLElement> {
    fireEvent.click(within(row).getByRole('button', { name: /^刪除/ }))
    return screen.findByRole('dialog', { name: '刪除這筆資料？' }, WAIT)
  }

  async confirmDelete(dialog: HTMLElement) {
    fireEvent.click(within(dialog).getByRole('button', { name: '刪除' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '刪除這筆資料？' })).toBeNull(), WAIT)
  }

  async cancelDelete(dialog: HTMLElement) {
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '刪除這筆資料？' })).toBeNull(), WAIT)
  }

  // ── 總覽 ────────────────────────────────────────────
  duplicateGroups(kindLabel: string): HTMLElement[] {
    return screen.queryAllByRole('group', { name: new RegExp(`^${kindLabel} `) })
  }

  anyDuplicateGroups(): HTMLElement[] {
    return screen.queryAllByRole('group', { name: /^同(車頭|車尾|身分證不同姓名) / })
  }

  idWarningGroups(): HTMLElement[] {
    return screen.queryAllByRole('group', { name: /^身分證警示 / })
  }

  // ── 匯出 ────────────────────────────────────────────
  async exportAll(format?: '.xlsx' | '.xls' | 'CSV') {
    await this.goData()
    if (format) fireEvent.click(await screen.findByRole('radio', { name: format }, WAIT))
    fireEvent.click(await screen.findByRole('button', { name: /^匯出全部/ }, WAIT))
    await waitFor(() => expect(this.downloads.length, '按下匯出後沒有取得任何檔案').toBeGreaterThan(0), WAIT)
  }

  // ── 匯入 ────────────────────────────────────────────
  async chooseImportFile(file: File) {
    await this.goData()
    fireEvent.click(await screen.findByRole('button', { name: '匯入 Excel' }, WAIT))
    const input = await screen.findByLabelText('選擇 Excel 檔', undefined, WAIT)
    fireEvent.change(input, { target: { files: [file] } })
  }

  async chooseImportMode(label: '略過重複' | '照樣匯入') {
    fireEvent.click(await screen.findByRole('radio', { name: label }, WAIT))
  }

  async confirmImport() {
    const button = await screen.findByRole('button', { name: '確認匯入' }, WAIT)
    expect((button as HTMLButtonElement).disabled, '「確認匯入」不可用：選檔後應已預設選項（見回報待決問題 Q2）').toBe(false)
    fireEvent.click(button)
  }
}

export function makeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as BlobPart], name, { type })
}
