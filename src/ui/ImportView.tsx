import { useEffect, useId, useRef, useState } from 'react'
import { previewImport, replaceAllFromImport } from '../data/importer'
import {
  COLUMN_TITLES,
  FIELD_ORDER,
  type ImportPreview,
  type ImportResult,
  type PreviewResult,
  type PreviewRow,
  type RowCategory,
} from '../data/types'
import type { DownloadFn } from './download'
import { Icon } from './icons'
import { KIND_LABEL, fieldErrorText } from './labels'
import { IdWarningTag } from './RecordTable'
import { ReplaceDialog } from './ReplaceDialog'
import { Link } from './router'

const PAGE_SIZE = 200
type Failure = Extract<PreviewResult, { ok: false }>

type Stage =
  | { kind: 'select' }
  | { kind: 'parsing'; fileName: string }
  | { kind: 'failed'; failure: Failure | 'system' }
  | { kind: 'preview'; fileName: string; preview: ImportPreview }
  | { kind: 'done'; result: ImportResult }

/** 以 FileReader 讀位元組（jsdom 與舊版 Safari 都支援，不依賴 Blob.arrayBuffer）。 */
function readFileBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsArrayBuffer(file)
  })
}

function FailureMessage({ failure }: { failure: Failure | 'system' }) {
  if (failure === 'system') {
    return (
      <>
        <strong>無法讀取本機資料</strong>
        <p>請稍後重試；名單沒有任何變更。</p>
      </>
    )
  }
  switch (failure.code) {
    case 'EMPTY_FILE':
      return <strong>檔案是空的</strong>
    case 'MISSING_HEADERS':
      return (
        <>
          <strong>缺少欄位標題「{failure.missing.join('、')}」</strong>
          <p>第一列必須是標題列，含「車頭車號、車斗車號、駕駛姓名、駕駛身分證」，順序不限。</p>
        </>
      )
    case 'UNREADABLE':
      return (
        <>
          <strong>檔案無法讀取</strong>
          {failure.hint === 'SAVE_AS_CSV_UTF8' ? (
            <p>這個檔案看起來是 Big5 等其他編碼的 CSV。請在 Excel 以「CSV UTF-8」格式另存後再匯入。</p>
          ) : (
            <p>請確認檔案是 .xlsx、.xls 或 CSV 檔，且沒有損毀。</p>
          )}
        </>
      )
  }
}

function describe(row: PreviewRow): string {
  if (row.category === 'FORMAT_ERROR' && row.error) return fieldErrorText(row.error.field, row.error.code)
  if (row.category !== 'DUP_IN_FILE') return ''
  const kinds = row.kinds.map((k) => KIND_LABEL[k]).join('、')
  const targets = row.inFileConflicts.map((c) => `檔案第 ${c.fileRows.join('、')} 列`)
  return targets.length ? `${kinds}（${targets.join('；')}）` : kinds
}

function CategoryTable({ title, rows, open }: { title: string; rows: PreviewRow[]; open: boolean }) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const shown = rows.slice(0, limit)
  return (
    <details className="cat" open={open}>
      <summary>{title}</summary>
      {rows.length === 0 ? (
        <p className="none">無</p>
      ) : (
        // 可橫向捲動的區塊要能用鍵盤聚焦（Safari 不會自動），所以給 tabIndex 與區域名稱
        <div className="tablescroll" role="region" aria-label={`${title}（可橫向捲動）`} tabIndex={0}>
          {/* 手機版 CSS 會把表格改成 display:block，瀏覽器因此丟掉表格語意；比照名單表格明確標上角色 */}
          <table className="grid mini" role="table">
            <caption className="sr">{title}</caption>
            <thead role="rowgroup">
              <tr role="row">
                <th role="columnheader" scope="col">
                  列號
                </th>
                {FIELD_ORDER.map((k) => (
                  <th key={k} role="columnheader" scope="col">
                    {COLUMN_TITLES[k]}
                  </th>
                ))}
                <th role="columnheader" scope="col">
                  說明
                </th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {shown.map((r) => (
                <tr key={r.fileRow} role="row">
                  <td role="cell" data-label="列號">
                    檔案第 {r.fileRow} 列
                  </td>
                  {FIELD_ORDER.map((k) => (
                    <td key={k} role="cell" data-label={COLUMN_TITLES[k]} className={k === 'ownerName' ? undefined : 'mono'}>
                      {r.fields[k]}
                    </td>
                  ))}
                  <td role="cell" data-label="說明" className={r.category === 'FORMAT_ERROR' ? 'reasons' : 'catrow-note'}>
                    {describe(r)}
                    {r.idWarning && <IdWarningTag code={r.idWarning} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > shown.length && (
            <p className="more">
              <button type="button" className="btn btn-ghost" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                顯示更多（還有 {rows.length - shown.length} 筆）
              </button>
            </p>
          )}
        </div>
      )}
    </details>
  )
}

interface ImportViewProps {
  /** 替換成功後呼叫（外層重新載入名單） */
  onCommitted: () => Promise<void> | void
  /** 取消／放棄預覽時回到的畫面 */
  onCancel: () => void
  /** 二次確認框「先匯出目前資料」交給下載的函式 */
  download: DownloadFn
}

/** S4 匯入（整份替換）：選檔 → 預覽（確認前不寫入）→ 二次確認 → 結果。 */
export function ImportView({ onCommitted, onCancel, download }: ImportViewProps) {
  const uid = useId()
  const [stage, setStage] = useState<Stage>({ kind: 'select' })
  const [asking, setAsking] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [commitFailed, setCommitFailed] = useState(false)
  const [pickKey, setPickKey] = useState(0)
  const token = useRef(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstStage = useRef(true)

  // 階段切換（選檔→解析→預覽→結果）時，原本的控制項會被卸載，焦點會掉到 <body>；改移到畫面標題。
  // 例外：仍停在選檔畫面的失敗（檔案輸入還在，焦點不需要動）。
  useEffect(() => {
    if (firstStage.current) {
      firstStage.current = false
      return
    }
    if (stage.kind !== 'failed') headingRef.current?.focus()
  }, [stage.kind])

  function reset() {
    token.current += 1
    setStage({ kind: 'select' })
    setAsking(false)
    setCommitFailed(false)
    setPickKey((n) => n + 1)
  }

  async function onFile(file: File) {
    const mine = ++token.current
    setAsking(false)
    setCommitFailed(false)
    setStage({ kind: 'parsing', fileName: file.name })
    let bytes: Uint8Array
    try {
      bytes = await readFileBytes(file)
    } catch {
      if (mine === token.current) setStage({ kind: 'failed', failure: { ok: false, code: 'UNREADABLE' } })
      return
    }
    try {
      const result = await previewImport(bytes)
      if (mine !== token.current) return // 解析中途取消或改選了別的檔案
      setStage(result.ok ? { kind: 'preview', fileName: file.name, preview: result.preview } : { kind: 'failed', failure: result })
    } catch {
      if (mine === token.current) setStage({ kind: 'failed', failure: 'system' })
    }
  }

  /** 二次確認框按下「確認替換」 */
  async function replace(preview: ImportPreview) {
    if (committing) return
    setCommitting(true)
    setCommitFailed(false)
    try {
      const result = await replaceAllFromImport(preview)
      if (result.ok) {
        await onCommitted()
        setAsking(false)
        setStage({ kind: 'done', result: result.result })
      } else {
        setAsking(false)
        setCommitFailed(true)
      }
    } catch {
      setAsking(false)
      setCommitFailed(true)
    } finally {
      setCommitting(false)
    }
  }

  const picking = stage.kind === 'select' || stage.kind === 'failed'

  return (
    <section aria-labelledby="import-h">
      <h2 id="import-h" ref={headingRef} className="stitle" tabIndex={-1} data-view-heading>
        {stage.kind === 'preview' ? '匯入預覽' : stage.kind === 'done' ? '匯入結果' : '匯入 Excel'}
      </h2>

      {picking && (
        <>
          <p>
            匯入會用檔案內容<strong>整份取代</strong>目前的名單（不是累加）。檔案需含標題列「車頭車號、車斗車號、駕駛姓名、駕駛身分證」，依標題對應，順序不限。支援
            .xlsx、.xls 與 CSV（UTF-8）。可先
            <Link to="data">匯出一份當範本或備份</Link>。
          </p>
          <p className="acts pickrow">
            <input
              key={pickKey}
              id={`${uid}-file`}
              className="vh"
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onFile(file)
              }}
            />
            <label htmlFor={`${uid}-file`} className="btn btn-primary filebtn">
              <Icon name="file" />
              選擇 Excel 檔
            </label>
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              取消
            </button>
          </p>
        </>
      )}

      {stage.kind === 'failed' && (
        <div className="msg msg-block" role="alert">
          <div className="msg-h">
            <Icon name="block" />
            <FailureMessage failure={stage.failure} />
          </div>
          <div className="msg-b">
            <p>名單沒有任何變更。可以重新選擇檔案。</p>
          </div>
        </div>
      )}

      {/* 常駐的 live 容器，狀態訊息之後才放進來，讀屏才會播報；取消鈕放在容器外，不會被一起念出 */}
      <div aria-live="polite" data-live="import">
        {stage.kind === 'parsing' && <p className="progress-text">解析中：{stage.fileName}</p>}
        {stage.kind === 'preview' && stage.preview.counts.total === 0 && (
          <div className="msg msg-ok">
            <div className="msg-h">
              <Icon name="ok" />
              <strong>檔案內沒有可匯入的資料</strong>
            </div>
            <div className="msg-b">
              <p>{stage.fileName} 只有標題列，或資料列都是空白。名單沒有任何變更。</p>
            </div>
          </div>
        )}
        {stage.kind === 'done' && (
          <div className="msg msg-ok result">
            <div className="msg-h">
              <Icon name="ok" />
              <strong>
                匯入完成：已刪除 {stage.result.deleted} 筆、已匯入 {stage.result.imported} 筆
              </strong>
            </div>
            {stage.result.merged > 0 && (
              <div className="msg-b">
                <p>合併 {stage.result.merged} 筆整列相同（只保留第一次出現的那一列）。</p>
              </div>
            )}
            <span className="seal" aria-hidden="true">
              存
            </span>
          </div>
        )}
      </div>

      {stage.kind === 'parsing' && (
        <p className="acts">
          <button type="button" className="btn btn-ghost" onClick={reset}>
            取消
          </button>
        </p>
      )}

      {stage.kind === 'preview' && (
        <PreviewPanel
          fileName={stage.fileName}
          preview={stage.preview}
          commitFailed={commitFailed}
          onConfirm={() => setAsking(true)}
          onCancel={onCancel}
          onPickAnother={reset}
          uid={uid}
        />
      )}

      {stage.kind === 'preview' && asking && (
        <ReplaceDialog
          willDelete={stage.preview.willDelete}
          willImport={stage.preview.willImport}
          merged={stage.preview.merged}
          download={download}
          busy={committing}
          onCancel={() => setAsking(false)}
          onConfirm={() => void replace(stage.preview)}
        />
      )}

      {stage.kind === 'done' && (
        <>
          <p className="acts">
            <Link to="list" className="btn btn-primary">
              回到名單
            </Link>
            <Link to="overview" className="btn btn-ghost">
              查看重複與警示總覽
            </Link>
          </p>
        </>
      )}
    </section>
  )
}

interface PreviewPanelProps {
  fileName: string
  preview: ImportPreview
  commitFailed: boolean
  onConfirm: () => void
  onCancel: () => void
  onPickAnother: () => void
  uid: string
}

function PreviewPanel({ fileName, preview, commitFailed, onConfirm, onCancel, onPickAnother, uid }: PreviewPanelProps) {
  const { counts } = preview
  const byCategory = (c: RowCategory) => preview.rows.filter((r) => r.category === c)
  const idWarnings = preview.rows.filter((r) => r.idWarning).length
  const sums = counts.new + counts.dupInFile + counts.identicalInFile + counts.formatError === counts.total

  if (counts.total === 0) {
    return (
      <>
        <p className="acts">
          <button type="button" className="btn btn-ghost" onClick={onPickAnother}>
            選擇其他檔案
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
        </p>
      </>
    )
  }

  // 有格式錯誤：整份擋下，不可確認，也不提「將刪除」，避免讓人以為會替換
  const hint = preview.canConfirm
    ? undefined
    : `檔案有 ${counts.formatError} 筆格式錯誤，整份不會匯入，所以不能確認。請修正檔案後重新選擇；名單沒有任何變更。`

  return (
    <>
      <p className="fileinfo">
        <Icon name="file" />
        <span>
          <strong>{fileName}</strong>・資料列 {counts.total} 筆（不含標題列）
        </span>
      </p>

      <div className="stats" role="group" aria-label="預覽統計">
        <p className="st st-new">
          <span className="stat-line">可匯入 {counts.new} 筆</span>
        </p>
        <p className="st st-dupf">
          <span className="stat-line">檔內重複 {counts.dupInFile} 筆</span>
        </p>
        <p className="st st-dupe">
          <span className="stat-line">整列相同 {counts.identicalInFile} 筆</span>
        </p>
        <p className="st st-bad">
          <span className="stat-line">格式錯誤 {counts.formatError} 筆</span>
        </p>
      </div>
      <p className="sumline">
        {counts.new} ＋ {counts.dupInFile} ＋ {counts.identicalInFile} ＋ {counts.formatError} ＝{' '}
        <strong className="wxtotal">{counts.total} 列</strong>
        {sums && <span>　四類相加與資料列數相符。</span>}
      </p>
      {preview.canConfirm && (
        <p className="replaceline">
          <strong>{`將刪除目前 ${preview.willDelete} 筆、匯入 ${preview.willImport} 筆`}</strong>
          <span>（整份替換，不是累加）。檔內重複的列也會匯入，並在名單與總覽持續標示。</span>
        </p>
      )}
      {idWarnings > 0 && (
        <p className="idflag">
          <span className="tag tag-warn">
            <Icon name="warn" />
            <span>駕駛身分證警示 {idWarnings} 筆</span>
          </span>
          <span>只提醒，不影響匯入。</span>
        </p>
      )}

      {preview.identicalRows.length > 0 && (
        <div className="msg msg-warn" role="group" aria-label="整列相同的列">
          <div className="msg-h">
            <Icon name="warn" />
            <strong>整列相同 {preview.identicalRows.length} 筆將合併</strong>
          </div>
          <div className="msg-b">
            <ul className="same">
              {preview.identicalRows.map((n) => {
                const to = preview.rows.find((r) => r.fileRow === n)?.identicalTo
                return (
                  <li key={n}>
                    檔案第 {n} 列：與檔案第 {to?.fileRow} 列整列相同
                  </li>
                )
              })}
            </ul>
            <p>四欄完全相同的列合併為一筆，只保留第一次出現的那一列。</p>
          </div>
        </div>
      )}

      <div className="cats">
        <CategoryTable title={`格式錯誤明細（${counts.formatError} 筆）`} rows={byCategory('FORMAT_ERROR')} open />
        <CategoryTable title={`檔內重複明細（${counts.dupInFile} 筆）`} rows={byCategory('DUP_IN_FILE')} open />
        <CategoryTable title={`可匯入明細（${counts.new} 筆）`} rows={byCategory('NEW')} open={false} />
      </div>

      {commitFailed && (
        <div className="msg msg-block compact" role="alert">
          <div className="msg-h">
            <Icon name="block" />
            <strong>匯入失敗，名單沒有任何變更</strong>
          </div>
          <div className="msg-b">
            <p>請再按一次「確認匯入」重試。</p>
          </div>
        </div>
      )}

      <p className="acts">
        <button
          type="button"
          className="btn btn-primary"
          // 不能確認時用 aria-disabled 而不是 disabled：按鈕仍可用鍵盤聚焦，才讀得到下方的原因說明
          aria-disabled={!preview.canConfirm || undefined}
          aria-describedby={hint ? `${uid}-hint` : undefined}
          onClick={() => preview.canConfirm && onConfirm()}
        >
          確認匯入
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          取消
        </button>
      </p>
      {hint && (
        <p id={`${uid}-hint`} className="help">
          {hint}
        </p>
      )}
    </>
  )
}
