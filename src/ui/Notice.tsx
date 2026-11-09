import { Fragment } from 'react'
import { COLUMN_TITLES, FIELD_ORDER, type DuplicateConflict, type DuplicateKind, type IdWarning, type VehicleRecord } from '../data/types'
import { Icon } from './icons'
import { Link } from './router'
import { IdWarningTag, KindTag } from './RecordTable'

export interface NoticeData {
  record: VehicleRecord
  idWarning?: IdWarning
  notices: DuplicateConflict[]
}

const VALUE_LABEL: Record<DuplicateKind, string> = {
  SAME_HEAD: COLUMN_TITLES.headPlate,
  SAME_TAIL: COLUMN_TITLES.tailPlate,
  SAME_ID_DIFF_NAME: COLUMN_TITLES.idNumber,
}

/** C1 存檔後通知：資料已存、但有需要留意的地方。含需閱讀的資料，所以不自動消失，由使用者關閉。 */
export function Notice({ data, onDismiss }: { data: NoticeData; onDismiss: () => void }) {
  const { record, idWarning, notices } = data
  return (
    // 外層（ListView）有一個常駐的 aria-live 容器負責播報「新插入」的通知；這裡關掉自己的 live，避免重複朗讀
    <div className="msg msg-warn c1" role="status" aria-live="off" aria-label="重複與警示通知">
      <div className="msg-h">
        <Icon name="warn" />
        <strong>已儲存「{record.ownerName}」，但有需要留意的地方</strong>
      </div>
      <div className="msg-b">
        {notices.length > 0 && (
          <ul className="kinds">
            {notices.map((n) => (
              <li key={`${n.kind}:${n.value}`}>
                <KindTag kind={n.kind} />
                <span>
                  {VALUE_LABEL[n.kind]} <span className="mono">{n.value}</span> 與下列既有資料重複：
                </span>
                <ul className="conf" style={{ flexBasis: '100%' }}>
                  {n.records.map((c) => (
                    <li key={c.id}>
                      {FIELD_ORDER.map((k, i) => (
                        <Fragment key={k}>
                          {i > 0 && ' ／ '}
                          <span className={k === 'ownerName' ? undefined : 'mono'}>{c[k]}</span>
                        </Fragment>
                      ))}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {idWarning && (
          <p className="idwarn">
            <IdWarningTag code={idWarning} />
            <span>
              身分證 <span className="mono">{record.idNumber}</span> 已存入，請再核對一次。
            </span>
          </p>
        )}
        <p className="acts">
          <Link to="overview" className="btn btn-ghost">
            到總覽查看
          </Link>
          <button type="button" className="btn btn-ghost dismiss" onClick={onDismiss}>
            關閉通知
          </button>
        </p>
      </div>
    </div>
  )
}
