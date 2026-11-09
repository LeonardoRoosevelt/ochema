import { useId, useState } from 'react'
import { deleteRecord } from '../data/records'
import { COLUMN_TITLES, FIELD_ORDER, type VehicleRecord } from '../data/types'
import { Icon } from './icons'
import { Modal } from './Modal'

interface DeleteDialogProps {
  record: VehicleRecord
  onCancel: () => void
  /** 刪除成功後由外層重新載入名單並關閉對話框 */
  onDeleted: (record: VehicleRecord) => Promise<void> | void
}

/** S3 刪除確認。顯示被刪那筆的四欄；預設焦點在「取消」；刪除後無法復原。 */
export function DeleteDialog({ record, onCancel, onDeleted }: DeleteDialogProps) {
  const titleId = useId()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function confirm() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    try {
      await deleteRecord(record.id)
      await onDeleted(record)
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <Modal
      labelledBy={titleId}
      className="dialog-sm"
      initialFocus="[data-cancel]"
      onEscape={(e) => {
        e.preventDefault()
        if (!busy) onCancel()
      }}
    >
      <h2 id={titleId} className="dlg-title">
        刪除這筆資料？
      </h2>
      <dl className="four">
        {FIELD_ORDER.map((k) => (
          <div key={k}>
            <dt>{COLUMN_TITLES[k]}</dt>
            <dd className={k === 'ownerName' ? undefined : 'mono'}>{record[k]}</dd>
          </div>
        ))}
      </dl>
      <p className="warnline">刪除後無法復原。</p>
      {failed && (
        <div className="msg msg-block compact" role="alert">
          <div className="msg-h">
            <Icon name="block" />
            <strong>刪除失敗，資料仍在</strong>
          </div>
          <div className="msg-b">
            <p>請再按一次「刪除」重試。</p>
          </div>
        </div>
      )}
      <p className="acts">
        <button type="button" className="btn btn-ghost" data-cancel onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy}>
          <Icon name="x" />
          刪除
        </button>
      </p>
    </Modal>
  )
}
