import { useEffect, useId, useRef, useState } from 'react'
import { commitImport, previewImport } from '../data/importer'
import {
  COLUMN_TITLES,
  FIELD_ORDER,
  type ImportMode,
  type ImportPreview,
  type ImportResult,
  type PreviewResult,
  type PreviewRow,
  type RowCategory,
} from '../data/types'
import { Icon } from './icons'
import { KIND_LABEL, fieldErrorText } from './labels'
import { IdWarningTag } from './RecordTable'
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

/** 兩種匯入選項各自會匯入幾筆：NEW 一律匯入；照樣匯入再加上「重複但不是整列相同」的列（整列相同兩種選項都不匯入）。 */
export function expectedImports(preview: ImportPreview, mode: ImportMode): number {
  if (mode === 'SKIP_DUPLICATES') return preview.counts.new
  const forced = preview.rows.filter((r) => (r.category === 'DUP_EXISTING' || r.category === 'DUP_IN_FILE') && !r.identicalTo).length
  return preview.counts.new + forced
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
          <p>第一列必須是標題列，含「車頭、車尾、姓名、身分證」，順序不限。</p>
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
  if (row.category === 'NEW') return ''
  const kinds = row.kinds.map((k) => KIND_LABEL[k]).join('、')
  const targets: string[] = []
  for (const c of row.existingConflicts) targets.push(`既有資料：${c.records.map((r) => `${r.ownerName}（${r.headPlate}）`).join('、')}`)
  for (const c of row.inFileConflicts) targets.push(`檔案第 ${c.fileRows.join('、')} 列`)
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
  /** 匯入成功後呼叫（外層重新載入名單） */
  onCommitted: () => Promise<void> | void
  /** 取消／放棄預覽時回到的畫面 */
  onCancel: () => void
}

/** S4 匯入：選檔 → 預覽（確認前不寫入）→ 結果。 */
export function ImportView({ onCommitted, onCancel }: ImportViewProps) {
  const uid = useId()
  const [stage, setStage] = useState<Stage>({ kind: 'select' })
  const [mode, setMode] = useState<ImportMode | undefined>()
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
    setMode(undefined)
    setCommitFailed(false)
    setPickKey((n) => n + 1)
  }

  async function onFile(file: File) {
    const mine = ++token.current
    setMode(undefined)
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

  async function confirm(preview: ImportPreview, chosen: ImportMode) {
    if (committing) return
    setCommitting(true)
    setCommitFailed(false)
    try {
      const result = await commitImport(preview, chosen)
      await onCommitted()
      setStage({ kind: 'done', result })
    } catch {
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
            檔案需含標題列「車頭、車尾、姓名、身分證」，依標題對應，順序不限。支援 .xlsx、.xls 與 CSV（UTF-8）。可先
            <Link to="data">匯出一份當範本</Link>。
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
              <p>{stage.fileName} 只有標題列，或資料列都是空白。檔案本身格式沒有問題。</p>
            </div>
          </div>
        )}
        {stage.kind === 'done' && (
          <div className="msg msg-ok result">
            <div className="msg-h">
              <Icon name="ok" />
              <strong>
                匯入完成：已匯入 {stage.result.imported} 筆、略過 {stage.result.skipped} 筆
              </strong>
            </div>
            {stage.result.formatErrorsNotImported > 0 && (
              <div className="msg-b">
                <p>格式錯誤未匯入 {stage.result.formatErrorsNotImported} 筆。</p>
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
          mode={mode}
          onMode={setMode}
          committing={committing}
          commitFailed={commitFailed}
          onConfirm={(m) => void confirm(stage.preview, m)}
          onCancel={onCancel}
          onPickAnother={reset}
          uid={uid}
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
  mode: ImportMode | undefined
  onMode: (mode: ImportMode) => void
  committing: boolean
  commitFailed: boolean
  onConfirm: (mode: ImportMode) => void
  onCancel: () => void
  onPickAnother: () => void
  uid: string
}

function PreviewPanel({ fileName, preview, mode, onMode, committing, commitFailed, onConfirm, onCancel, onPickAnother, uid }: PreviewPanelProps) {
  const { counts } = preview
  const byCategory = (c: RowCategory) => preview.rows.filter((r) => r.category === c)
  const idWarnings = preview.rows.filter((r) => r.idWarning).length
  const duplicates = counts.dupExisting + counts.dupInFile
  // 選項永遠顯示、不預選。沒有任何重複時兩種結果相同，不選也可直接確認（視同略過重複）；有重複時必須明確選一個
  const needChoice = duplicates > 0
  const chosen: ImportMode | undefined = needChoice ? mode : (mode ?? 'SKIP_DUPLICATES')
  const expected = chosen ? expectedImports(preview, chosen) : 0

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

  const hint = needChoice && !chosen ? '請先選擇上方的匯入方式。' : expected === 0 ? '沒有可匯入的資料。' : undefined
  const sums = counts.new + counts.dupExisting + counts.dupInFile + counts.formatError === counts.total

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
          <span className="stat-line">可新增 {counts.new} 筆</span>
        </p>
        <p className="st st-dupe">
          <span className="stat-line">與既有資料重複 {counts.dupExisting} 筆</span>
        </p>
        <p className="st st-dupf">
          <span className="stat-line">檔內重複 {counts.dupInFile} 筆</span>
        </p>
        <p className="st st-bad">
          <span className="stat-line">格式錯誤 {counts.formatError} 筆</span>
        </p>
      </div>
      <p className="sumline">
        {counts.new} ＋ {counts.dupExisting} ＋ {counts.dupInFile} ＋ {counts.formatError} ＝{' '}
        <strong className="wxtotal">{counts.total} 列</strong>
        {sums && <span>　四類相加與資料列數相符。</span>}
      </p>
      {idWarnings > 0 && (
        <p className="idflag">
          <span className="tag tag-warn">
            <Icon name="warn" />
            <span>身分證警示 {idWarnings} 筆</span>
          </span>
          <span>只提醒，不影響匯入。</span>
        </p>
      )}

      {preview.identicalRows.length > 0 && (
        <div className="msg msg-warn" role="group" aria-label="整列相同的列">
          <div className="msg-h">
            <Icon name="warn" />
            <strong>整列相同 {preview.identicalRows.length} 筆</strong>
          </div>
          <div className="msg-b">
            <ul className="same">
              {preview.identicalRows.map((n) => {
                const row = preview.rows.find((r) => r.fileRow === n)
                const to = row?.identicalTo
                return (
                  <li key={n}>
                    檔案第 {n} 列：{to?.source === 'FILE' ? `與檔案第 ${to.fileRow} 列整列相同` : '與既有資料整列相同'}
                  </li>
                )
              })}
            </ul>
            <p>這些列不論選擇「略過重複」或「照樣匯入」都不會匯入。</p>
          </div>
        </div>
      )}

      <div className="cats">
        <CategoryTable title={`格式錯誤明細（${counts.formatError} 筆）`} rows={byCategory('FORMAT_ERROR')} open />
        <CategoryTable title={`與既有資料重複明細（${counts.dupExisting} 筆）`} rows={byCategory('DUP_EXISTING')} open />
        <CategoryTable title={`檔內重複明細（${counts.dupInFile} 筆）`} rows={byCategory('DUP_IN_FILE')} open />
        <CategoryTable title={`可新增明細（${counts.new} 筆）`} rows={byCategory('NEW')} open={false} />
      </div>

      {(
        <div role="radiogroup" aria-labelledby={`${uid}-mode`} className="opts">
          <p id={`${uid}-mode`} className="sublabel">
            選擇匯入方式
          </p>
          {(
            [
              ['SKIP_DUPLICATES', '略過重複', '只匯入「可新增」的列；與既有資料重複、檔內重複的列都略過。'],
              ['IMPORT_ALL', '照樣匯入', '同車頭、同車尾、同身分證不同姓名的列也匯入（匯入後會在名單上標示）；整列相同的列一律不匯入。'],
            ] as const
          ).map(([value, label, desc]) => (
            <label key={value} className="opt">
              <input
                type="radio"
                name={`${uid}-import-mode`}
                value={value}
                checked={mode === value}
                onChange={() => onMode(value)}
                aria-labelledby={`${uid}-${value}-t`}
                aria-describedby={`${uid}-${value}-d`}
              />
              <span className="ot">
                <b id={`${uid}-${value}-t`}>{label}</b>
                <span id={`${uid}-${value}-d`}>
                  {desc}格式錯誤的列不會匯入。<em>預計匯入 {expectedImports(preview, value)} 筆</em>
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

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
          disabled={committing}
          // 還不能確認時用 aria-disabled 而不是 disabled：按鈕仍可用鍵盤聚焦，才讀得到下方的原因說明
          aria-disabled={!chosen || expected === 0 || undefined}
          aria-describedby={hint ? `${uid}-hint` : undefined}
          onClick={() => chosen && expected > 0 && onConfirm(chosen)}
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
