import { useId, useState } from 'react'
import { exportRecords } from '../data/excelWrite'
import type { DownloadFn } from './download'
import { Icon } from './icons'
import { Modal } from './Modal'

interface ReplaceDialogProps {
  /** 將刪除的筆數（預覽當下的名單筆數；0 也要確認） */
  willDelete: number
  willImport: number
  merged: number
  download: DownloadFn
  /** 替換進行中：鎖住所有按鈕 */
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

type ExportState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; count: number } | { kind: 'failed' }

/**
 * 匯入的二次確認。原生 <dialog>；預設焦點在「取消」；
 * 「先匯出目前資料」＝匯出全部、預設 .xlsx，匯出後對話框仍開著，名單不變。
 */
export function ReplaceDialog({ willDelete, willImport, merged, download, busy, onCancel, onConfirm }: ReplaceDialogProps) {
  const titleId = useId()
  const [exported, setExported] = useState<ExportState>({ kind: 'idle' })

  async function exportFirst() {
    if (exported.kind === 'busy') return
    setExported({ kind: 'busy' })
    try {
      const result = await exportRecords('xlsx')
      await download({ fileName: result.fileName, mimeType: result.mimeType, bytes: result.bytes })
      setExported({ kind: 'done', count: result.count })
    } catch {
      setExported({ kind: 'failed' })
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
        確認替換整份名單？
      </h2>
      <p>
        {willDelete > 0
          ? `將刪除目前 ${willDelete} 筆資料，改為檔案裡的 ${willImport} 筆。`
          : `目前名單是空的，沒有資料會被刪除；檔案裡的 ${willImport} 筆會寫入。`}
      </p>
      {merged > 0 && <p>另有 {merged} 筆整列相同的列會合併，只保留第一次出現的那一列。</p>}
      {willDelete > 0 && <p className="warnline">替換後無法復原。建議先匯出目前資料備份。</p>}

      {/* 常駐的 live 容器：匯出完成的訊息才會被讀屏播報 */}
      <div aria-live="polite" data-live="replace-export">
        {exported.kind === 'done' && (
          <p className="hint check-hint">
            <Icon name="ok" />
            <span>已匯出 {exported.count} 筆資料（名單沒有變動）</span>
          </p>
        )}
      </div>
      {exported.kind === 'failed' && (
        <div className="msg msg-block compact" role="alert">
          <div className="msg-h">
            <Icon name="block" />
            <strong>匯出失敗，名單沒有變動</strong>
          </div>
          <div className="msg-b">
            <p>可以再試一次，或取消後改用「資料」頁匯出。</p>
          </div>
        </div>
      )}

      <p className="acts">
        <button type="button" className="btn btn-ghost" onClick={() => void exportFirst()} disabled={busy || exported.kind === 'busy'}>
          <Icon name="file" />
          先匯出目前資料
        </button>
        <button type="button" className="btn btn-ghost" data-cancel onClick={onCancel} disabled={busy}>
          取消
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          確認替換
        </button>
      </p>
    </Modal>
  )
}
