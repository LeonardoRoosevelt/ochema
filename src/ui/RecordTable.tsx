import { useState, type ReactNode } from 'react'
import type { DuplicateKind, IdWarning, VehicleRecord } from '../data/types'
import { Icon } from './icons'
import { ID_WARNING_TEXT, KIND_LABEL } from './labels'

/** 一次最多畫出的列數：名單可能有數千筆，不一次渲染全部（IA 3.1「資料量」）。其餘由「顯示更多」漸進載入。 */
export const PAGE_SIZE = 200
const KIND_ORDER: readonly DuplicateKind[] = ['SAME_HEAD', 'SAME_TAIL', 'SAME_ID_DIFF_NAME']

/** 查詢命中處用粗體＋底線標示（<mark>），不只靠顏色。 */
function Hl({ text, keyword }: { text: string; keyword: string }): ReactNode {
  if (!keyword) return text
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'i'))
  return parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))
}

export function KindTag({ kind }: { kind: keyof typeof KIND_LABEL }) {
  return (
    <span className="tag tag-dup">
      <Icon name="dup" />
      <span>{KIND_LABEL[kind]}</span>
    </span>
  )
}

export function IdWarningTag({ code }: { code: IdWarning }) {
  return (
    <span className="tag tag-warn">
      <Icon name="warn" />
      <span>駕駛身分證警示：{ID_WARNING_TEXT[code]}</span>
    </span>
  )
}

interface RecordTableProps {
  /** 已套用查詢的名單 */
  records: readonly VehicleRecord[]
  kindsById: ReadonlyMap<number, readonly DuplicateKind[]>
  idWarningById: ReadonlyMap<number, IdWarning>
  keyword: string
  onEdit: (record: VehicleRecord) => void
  onDelete: (record: VehicleRecord) => void
}

/**
 * S1 名單。桌面為表格、手機為卡片，共用同一份 DOM（由 CSS 轉換）；
 * 因此明確標上 ARIA 角色，避免 CSS 把 display 改成 grid／block 之後瀏覽器丟掉表格語意。
 * 前四格的文字就是值（無任何前綴）；重複種類與駕駛身分證警示都放在「標示」格。
 */
export function RecordTable({ records, kindsById, idWarningById, keyword, onEdit, onDelete }: RecordTableProps) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const shown = records.slice(0, limit)

  return (
    <div className="tablewrap">
      <table className="grid main" role="table" aria-label="車輛所屬名單" aria-rowcount={records.length + 1}>
        <thead role="rowgroup">
          <tr role="row" aria-rowindex={1}>
            {['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證', '標示', '操作'].map((h) => (
              <th key={h} role="columnheader" scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {shown.map((r, index) => {
            const kinds = KIND_ORDER.filter((k) => kindsById.get(r.id)?.includes(k))
            const warning = idWarningById.get(r.id)
            const label = `${r.headPlate}（${r.ownerName}）`
            return (
              <tr key={r.id} role="row" aria-rowindex={index + 2} className={`${kinds.length ? 'has-dup' : ''} ${warning ? 'has-warn' : ''}`.trim()}>
                <td role="cell" data-label="車頭車號" className="c-head">
                  <span className="plate plate-head">
                    <Hl text={r.headPlate} keyword={keyword} />
                  </span>
                </td>
                <td role="cell" data-label="車斗車號" className="c-tail">
                  <span className="plate plate-tail">
                    <Hl text={r.tailPlate} keyword={keyword} />
                  </span>
                </td>
                <td role="cell" data-label="駕駛姓名" className="c-name">
                  <Hl text={r.ownerName} keyword={keyword} />
                </td>
                <td role="cell" data-label="駕駛身分證" className="c-id">
                  <span className="idv">
                    <Hl text={r.idNumber} keyword={keyword} />
                  </span>
                </td>
                <td role="cell" data-label="標示" className="c-flags">
                  {kinds.map((k) => (
                    <KindTag key={k} kind={k} />
                  ))}
                  {warning && <IdWarningTag code={warning} />}
                  {kinds.length === 0 && !warning && (
                    <>
                      <span className="none" aria-hidden="true">
                        —
                      </span>
                      <span className="sr">無標示</span>
                    </>
                  )}
                </td>
                <td role="cell" data-label="操作" className="c-ops">
                  <button type="button" className="btn btn-ghost" aria-label={`編輯 ${label}`} onClick={() => onEdit(r)}>
                    編輯
                  </button>
                  <button type="button" className="btn btn-ghost btn-del" aria-label={`刪除 ${label}`} onClick={() => onDelete(r)}>
                    刪除
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {records.length > shown.length && (
        <p className="more">
          <button type="button" className="btn btn-ghost" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
            顯示更多（還有 {records.length - shown.length} 筆）
          </button>
        </p>
      )}
    </div>
  )
}
