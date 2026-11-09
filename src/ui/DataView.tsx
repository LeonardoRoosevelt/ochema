import { useId, useState } from 'react'
import { exportRecords, XLS_MAX_ROWS } from '../data/excelWrite'
import type { ExportFormat } from '../data/types'
import type { DownloadFn } from './download'
import { Icon } from './icons'
import type { ThemeChoice } from './theme'

const FORMATS: ReadonlyArray<{ value: ExportFormat; label: string; note: string }> = [
  { value: 'xlsx', label: '.xlsx', note: 'Excel 2007 以上（建議）。前導 0 以文字保留。' },
  { value: 'xls', label: '.xls', note: 'Excel 97–2003，給舊版軟體使用。' },
  { value: 'csv', label: 'CSV', note: '純文字（UTF-8），可用其他軟體開啟。' },
]
const THEMES: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: '跟隨系統' },
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
]

interface DataViewProps {
  /** 名單目前的總筆數（匯出一律是全部，不受查詢影響） */
  count: number
  download: DownloadFn
  onImport: () => void
  /** 匯出完成的結果訊息（C3） */
  onResult: (message: string) => void
  theme: ThemeChoice
  onTheme: (theme: ThemeChoice) => void
}

/** S6 資料與備份：本機資料說明、匯出（三種格式）、匯入入口、外觀。 */
export function DataView({ count, download, onImport, onResult, theme, onTheme }: DataViewProps) {
  const uid = useId()
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [xlsRejected, setXlsRejected] = useState(false)
  const [cellTooLong, setCellTooLong] = useState(false)

  // 標題列也佔一列
  const xlsTooMany = format === 'xls' && (count + 1 > XLS_MAX_ROWS || xlsRejected)

  async function doExport() {
    if (busy || xlsTooMany) return
    setBusy(true)
    setFailed(false)
    setXlsRejected(false)
    setCellTooLong(false)
    try {
      const result = await exportRecords(format)
      await download({ fileName: result.fileName, mimeType: result.mimeType, bytes: result.bytes })
      onResult(`已匯出 ${result.count} 筆資料`)
    } catch (e) {
      // 資料層在超過 .xls 上限時丟 XlsRowLimitError：照樣告知改用 .xlsx（以名稱判斷，不綁定類別實體）
      if (e instanceof Error && e.name === 'XlsRowLimitError') setXlsRejected(true)
      // 某個儲存格超過 Excel 的 32,767 字元上限：.xlsx／.xls 都寫不出來，CSV 沒有這個限制
      else if (e instanceof Error && e.name === 'CellTooLongError') setCellTooLong(true)
      else setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="data-h">
      <h2 id="data-h" className="stitle" tabIndex={-1} data-view-heading>
        資料與備份
      </h2>

      <ul className="c2list">
        <li>資料只存在這台裝置上，沒有帳號、也不會同步。</li>
        <li>清除網站資料或刪除主畫面圖示，資料可能消失。</li>
        <li>請定期匯出 Excel 作為備份。</li>
      </ul>

      <div className="block">
        <h3>匯出 Excel</h3>
        <p>
          一律匯出全部資料，不受名單上的查詢條件影響。共 {count} 筆。
          {count === 0 && '名單是空的，將匯出只有標題列的範本檔。'}
        </p>

        <div role="radiogroup" aria-labelledby={`${uid}-fmt`} className="fmt">
          <p id={`${uid}-fmt`} className="sublabel">
            匯出格式
          </p>
          {FORMATS.map((f) => (
            <div key={f.value}>
              <label className="opt">
                <input
                  type="radio"
                  name={`${uid}-format`}
                  value={f.value}
                  checked={format === f.value}
                  onChange={() => { setFormat(f.value); setXlsRejected(false); setCellTooLong(false) }}
                  aria-describedby={f.value === 'csv' && format === 'csv' ? `${uid}-${f.value}-n ${uid}-csv` : `${uid}-${f.value}-n`}
                />
                <span className="ot">{f.label}</span>
              </label>
              <p id={`${uid}-${f.value}-n`} className="help">
                {f.note}
              </p>
            </div>
          ))}
        </div>

        {/* 常駐的 live 容器：切換格式或匯出失敗時才出現的提示才會被讀屏播報 */}
        <div aria-live="polite" data-live="export-hints">
          {format === 'csv' && (
            <p className="hint check-hint" id={`${uid}-csv`}>
              <Icon name="warn" />
              <span>用 Excel 直接開啟 CSV，前導 0 可能被吃掉（007 會變成 7）；要編輯請選 .xlsx。</span>
            </p>
          )}
          {xlsTooMany && (
            <p className="err check-hint" id={`${uid}-xls`}>
              <Icon name="block" />
              <span>
                資料超過 .xls 上限（一張工作表最多 {XLS_MAX_ROWS.toLocaleString('en-US')} 列，含標題列），請改用 .xlsx。
              </span>
            </p>
          )}
        </div>
        {cellTooLong && (
          <p className="err check-hint" role="alert">
            <Icon name="block" />
            <span>有資料超過 Excel 儲存格上限，請改用 CSV 匯出。</span>
          </p>
        )}
        {failed && (
          <p className="err check-hint" role="alert">
            <Icon name="block" />
            <span>匯出失敗，資料未變更。請再試一次。</span>
          </p>
        )}

        <p className="acts">
          <button
            type="button"
            className="btn btn-primary"
            onClick={doExport}
            disabled={busy}
            // 超限時用 aria-disabled 而不是 disabled：按鈕仍可用鍵盤聚焦，才讀得到上方的原因說明
            aria-disabled={xlsTooMany || undefined}
            aria-describedby={xlsTooMany ? `${uid}-xls` : undefined}
          >
            匯出全部（{count} 筆）
          </button>
        </p>
      </div>

      <div className="block">
        <h3>匯入 Excel</h3>
        <p>從 Excel 檔批次加入資料，匯入前會先預覽。支援 .xlsx、.xls 與 CSV（UTF-8）。</p>
        <p className="acts">
          <button type="button" className="btn btn-ghost" onClick={onImport}>
            <Icon name="file" />
            匯入 Excel
          </button>
        </p>
      </div>

      <div className="block">
        <h3>外觀</h3>
        <div role="radiogroup" aria-label="外觀主題" className="theme-pick">
          {THEMES.map((t) => (
            <label key={t.value}>
              <input type="radio" name={`${uid}-theme`} value={t.value} checked={theme === t.value} onChange={() => onTheme(t.value)} />
              {t.label}
            </label>
          ))}
        </div>
      </div>
    </section>
  )
}
