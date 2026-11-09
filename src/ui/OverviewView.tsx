import type { Overview, VehicleRecord } from '../data/types'
import { Icon } from './icons'
import { KIND_LABEL } from './labels'
import { IdWarningTag, KindTag } from './RecordTable'

interface OverviewViewProps {
  overview: Overview
  total: number
  onEdit: (record: VehicleRecord) => void
  onDelete: (record: VehicleRecord) => void
}

function Member({ record, onEdit, onDelete }: { record: VehicleRecord; onEdit: () => void; onDelete?: (() => void) | undefined }) {
  const label = `${record.headPlate}（${record.ownerName}）`
  return (
    <>
      <span className="plate plate-head">
        <span className="sr">車頭車號 </span>
        {record.headPlate}
      </span>
      <span className="plate plate-tail">
        <span className="sr">車斗車號 </span>
        {record.tailPlate}
      </span>
      <span className="who">{record.ownerName}</span>
      <span className="idv">{record.idNumber}</span>
      <span className="ops">
        <button type="button" className="btn btn-ghost" aria-label={`編輯 ${label}`} onClick={onEdit}>
          編輯
        </button>
        {onDelete && (
          <button type="button" className="btn btn-ghost btn-del" aria-label={`刪除 ${label}`} onClick={onDelete}>
            刪除
          </button>
        )}
      </span>
    </>
  )
}

/** S5 重複與警示總覽：集中顯示所有重複組與駕駛身分證警示，並可直接編輯／刪除。 */
export function OverviewView({ overview, total, onEdit, onDelete }: OverviewViewProps) {
  const problems = overview.duplicateGroups.length + overview.idWarnings.length
  return (
    <section aria-labelledby="ov-h">
      <h2 id="ov-h" className="stitle" tabIndex={-1} data-view-heading>
        重複與警示總覽
      </h2>

      <div aria-live="polite" data-live="overview">
        {overview.isClean && (
          <div className="msg msg-ok ov-clean">
            <div className="msg-h">
              <Icon name="ok" />
              <strong>目前沒有重複與警示</strong>
            </div>
            <div className="msg-b">
              <p>{total === 0 ? '目前沒有任何資料，所以沒有需要處理的項目。' : `名單中的 ${total} 筆資料沒有任何需要處理的項目。`}</p>
            </div>
          </div>
        )}
      </div>

      {!overview.isClean && (
        <>
          <p className="total">
            <strong>共 {problems} 個問題</strong>（重複 {overview.duplicateGroups.length} 組＋駕駛身分證警示 {overview.idWarnings.length} 筆）
          </p>
          <div className="cols2">
            {overview.duplicateGroups.length > 0 && (
              <div>
                <h3>重複</h3>
                {overview.duplicateGroups.map((g) => (
                  <div key={`${g.kind}:${g.value}`} role="group" aria-label={`${KIND_LABEL[g.kind]} ${g.value}`} className="grp">
                    <div className="grp-h">
                      <KindTag kind={g.kind} />
                      <span className="gv">{g.value}</span>
                      <span className="gc">涉及 {g.records.length} 筆資料</span>
                    </div>
                    <ul className="members">
                      {g.records.map((r) => (
                        <li key={r.id}>
                          <Member record={r} onEdit={() => onEdit(r)} onDelete={() => onDelete(r)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {overview.idWarnings.length > 0 && (
              <div>
                <h3>駕駛身分證警示</h3>
                {overview.idWarnings.map(({ record, code }) => (
                  <div key={record.id} role="group" aria-label={`駕駛身分證警示 ${record.ownerName}`} className="grp">
                    <div className="grp-h">
                      <IdWarningTag code={code} />
                    </div>
                    <ul className="warnlist">
                      <li>
                        <Member record={record} onEdit={() => onEdit(record)} />
                      </li>
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
