import { useRef } from 'react'
import type { DuplicateKind, IdWarning, VehicleRecord } from '../data/types'
import { Icon } from './icons'
import { Notice, type NoticeData } from './Notice'
import { RecordTable } from './RecordTable'
import { Link } from './router'
import type { KeywordState } from './useKeyword'

export type LoadStatus = 'loading' | 'ready' | 'error'

interface ListViewProps {
  status: LoadStatus
  total: number
  shown: readonly VehicleRecord[]
  keyword: KeywordState
  kindsById: ReadonlyMap<number, readonly DuplicateKind[]>
  idWarningById: ReadonlyMap<number, IdWarning>
  notice: NoticeData | undefined
  onDismissNotice: () => void
  onAdd: () => void
  onEdit: (record: VehicleRecord) => void
  onDelete: (record: VehicleRecord) => void
  onCopy: (field: string, value: string) => void
  onImport: () => void
  onRetry: () => void
}

/** S1 名單：查詢區、C2 本機資料提示、C1 存檔後通知、名單（含載入／空／無結果／系統錯誤四種狀態）。 */
export function ListView(p: ListViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { keyword } = p
  const needle = keyword.applied.trim()
  const loaded = p.status === 'ready'
  const empty = loaded && p.total === 0 && needle === ''
  const noResults = loaded && p.shown.length === 0 && !empty

  const clear = () => {
    keyword.clear()
    inputRef.current?.focus()
  }

  return (
    <section aria-labelledby="list-h">
      <h2 id="list-h" className="stitle" tabIndex={-1} data-view-heading>
        名單
      </h2>

      <div className="search" role="search">
        <label htmlFor="q" className="lbl">
          查詢
        </label>
        <div className="search-box">
          <Icon name="search" />
          <input
            id="q"
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-describedby="q-h"
            value={keyword.query}
            onChange={(e) => keyword.onChange(e.target.value)}
            onCompositionStart={keyword.onCompositionStart}
            onCompositionEnd={(e) => keyword.onCompositionEnd(e.currentTarget.value)}
          />
          {keyword.query !== '' && !noResults && (
            <button type="button" className="clear" aria-label="清除關鍵字" onClick={clear}>
              <Icon name="x" />
            </button>
          )}
        </div>
        <p id="q-h" className="help">
          車頭車號、車斗車號、駕駛姓名、駕駛身分證皆可
        </p>
        <p className="count" aria-live="polite">
          {!loaded ? '' : needle ? `符合 ${p.shown.length} 筆／共 ${p.total} 筆` : `共 ${p.total} 筆`}
        </p>
      </div>

      <p className="c2">
        <Icon name="data" />
        <span>
          資料只存在這台裝置上。請定期匯出 Excel 備份。 <Link to="data">前往匯出</Link>
        </span>
      </p>

      <p className="addrow">
        <button type="button" className="btn btn-primary btn-add" onClick={p.onAdd}>
          <Icon name="plus" />
          新增資料
        </button>
      </p>

      {/* 常駐的 live 容器，通知之後才放進來，讀屏才會播報（Notice 本身若連同容器一起插入，多數讀屏不會讀） */}
      <div aria-live="polite" data-live="notice">
        {p.notice && <Notice data={p.notice} onDismiss={p.onDismissNotice} />}
      </div>

      <p className="sr" role="status">
        {p.status === 'loading' ? '載入中' : ''}
      </p>

      {p.status === 'loading' && (
        <div className="state state-load" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div className="skel" key={i}>
              <span />
              <span />
              <span />
            </div>
          ))}
          <p className="help">載入本機資料中…（查詢框可先輸入）</p>
        </div>
      )}

      {p.status === 'error' && (
        <div className="msg msg-block" role="alert">
          <div className="msg-h">
            <Icon name="block" />
            <strong>無法讀取本機資料</strong>
          </div>
          <div className="msg-b">
            <p>
              瀏覽器可能封鎖了網站儲存空間（例如無痕模式），或儲存空間已損毀。你的資料沒有被清除，但目前無法顯示。
            </p>
            <p className="acts">
              <button type="button" className="btn btn-primary" onClick={p.onRetry}>
                重試
              </button>
            </p>
          </div>
        </div>
      )}

      {empty && (
        <div className="state state-empty">
          <h3>名單目前沒有資料</h3>
          <p>資料會存在這台裝置上。你可以手動新增，或從 Excel 匯入。</p>
          <p className="acts">
            <button type="button" className="btn btn-primary" onClick={p.onAdd}>
              新增第一筆
            </button>
            <button type="button" className="btn btn-ghost" onClick={p.onImport}>
              匯入 Excel
            </button>
          </p>
        </div>
      )}

      {noResults && (
        <div className="state state-none">
          <h3>查無符合的資料</h3>
          <p>
            沒有符合「<span className="kw">{needle}</span>」的車頭車號、車斗車號、駕駛姓名或駕駛身分證。
          </p>
          <p className="acts">
            <button type="button" className="btn btn-ghost" onClick={clear}>
              清除關鍵字
            </button>
          </p>
        </div>
      )}

      {loaded && p.shown.length > 0 && (
        <RecordTable
          records={p.shown}
          kindsById={p.kindsById}
          idWarningById={p.idWarningById}
          keyword={needle}
          onEdit={p.onEdit}
          onDelete={p.onDelete}
          onCopy={p.onCopy}
        />
      )}
    </section>
  )
}
