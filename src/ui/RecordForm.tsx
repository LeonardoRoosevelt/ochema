import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createRecord, updateRecord } from '../data/records'
import { checkIdNumber, validateRecordInput } from '../data/validation'
import {
  COLUMN_TITLES,
  FIELD_ORDER,
  type FieldKey,
  type RecordFields,
  type RecordValidation,
  type SaveSuccess,
  type VehicleRecord,
} from '../data/types'
import { Icon } from './icons'
import { ID_WARNING_TEXT, fieldErrorText } from './labels'
import { Modal } from './Modal'

type Errors = RecordValidation['errors']

const EMPTY: RecordFields = { headPlate: '', tailPlate: '', ownerName: '', idNumber: '' }
const trimAll = (v: RecordFields): RecordFields => ({
  headPlate: v.headPlate.trim(),
  tailPlate: v.tailPlate.trim(),
  ownerName: v.ownerName.trim(),
  idNumber: v.idNumber.trim(),
})
const HELP: Record<FieldKey, string> = {
  headPlate: '大寫英文或數字，以單一連字號相連，例如 929-X2',
  tailPlate: '大寫英文或數字，以單一連字號相連，例如 20-9A',
  ownerName: '無格式限制',
  idNumber: '10 碼；格式或檢查碼不符時仍可儲存，但會被標示',
}
const MONO: Record<FieldKey, boolean> = { headPlate: true, tailPlate: true, ownerName: false, idNumber: true }

interface RecordFormProps {
  /** 有值＝編輯該筆；沒有＝新增 */
  record?: VehicleRecord
  onClose: () => void
  /** 存檔成功後由外層重新載入名單並關閉表單 */
  onSaved: (result: SaveSuccess, previous: VehicleRecord | undefined) => Promise<void> | void
}

/** S2 新增／編輯表單。擋下（資料沒存）的訊息集中在 role="alert" 的摘要；欄位底下再各放一份並以 aria-describedby 關聯。 */
export function RecordForm({ record, onClose, onSaved }: RecordFormProps) {
  const title = record ? '編輯資料' : '新增資料'
  const uid = useId()
  const titleId = `${uid}-title`
  const initial: RecordFields = record
    ? { headPlate: record.headPlate, tailPlate: record.tailPlate, ownerName: record.ownerName, idNumber: record.idNumber }
    : EMPTY

  const [values, setValues] = useState<RecordFields>(initial)
  const [attempted, setAttempted] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  /** 摘要用的錯誤快照：只在送出時更新，輸入中不變動，避免 role=alert 每打一個字就重念（欄位底下的錯誤仍即時更新） */
  const [summaryErrors, setSummaryErrors] = useState<Errors>({})
  const [identical, setIdentical] = useState<VehicleRecord | undefined>()
  const [systemError, setSystemError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [idTouched, setIdTouched] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)
  const [blockedCount, setBlockedCount] = useState(0)

  const summaryFields = FIELD_ORDER.filter((k) => summaryErrors[k] !== undefined)

  // 送出失敗後把焦點移到錯誤摘要，讀屏才會朗讀原因
  useEffect(() => {
    if (blockedCount > 0) summaryRef.current?.focus()
  }, [blockedCount])

  function change(key: FieldKey, value: string) {
    const next = { ...values, [key]: value }
    setValues(next)
    setIdentical(undefined)
    // 已嘗試送出後，內容一改就即時重驗（尚未送出前不跳紅字）
    if (attempted) {
      const live = validateRecordInput(trimAll(next)).errors
      setErrors(live)
      // 全部改正後摘要收起（移除不會被播報）；還有錯時摘要維持上次送出的內容
      if (Object.keys(live).length === 0) setSummaryErrors({})
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setSystemError(undefined)
    setIdentical(undefined)
    const input = trimAll(values)
    try {
      const result = record ? await updateRecord(record.id, input) : await createRecord(input)
      if (result.ok) {
        await onSaved(result, record)
        return
      }
      setAttempted(true)
      if (result.reason === 'INVALID') {
        setErrors(result.errors)
        setSummaryErrors(result.errors)
      } else {
        setErrors({})
        setSummaryErrors({})
        if (result.reason === 'IDENTICAL_ROW') setIdentical(result.existing)
        else setSystemError('這筆資料已不存在（可能已被刪除），無法儲存。')
      }
      setBlockedCount((n) => n + 1)
    } catch {
      setSystemError('儲存失敗，資料未變更。請再按一次「儲存」。')
      setBlockedCount((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }

  function onEscape(event: Event) {
    // 與「取消」一致：直接放棄修改並關閉（儲存中不關）
    event.preventDefault()
    if (!saving) onClose()
  }

  const idCheck = idTouched || attempted ? checkIdNumber(values.idNumber.trim()) : undefined
  const idWarning = idCheck?.status === 'warn' ? ID_WARNING_TEXT[idCheck.code] : undefined
  const hasSummary = summaryFields.length > 0 || identical !== undefined || systemError !== undefined

  return (
    <Modal labelledBy={titleId} className="formdlg" onEscape={onEscape} initialFocus="input">
      <form className="form" noValidate aria-labelledby={titleId} onSubmit={submit}>
        <h2 id={titleId} className="dlg-title">
          {title}
        </h2>

        {hasSummary && (
          <div className="msg msg-block summary" role="alert" tabIndex={-1} ref={summaryRef}>
            <div className="msg-h">
              <Icon name="block" />
              <strong>
                {identical
                  ? '與既有資料整列相同，未儲存'
                  : systemError
                    ? '儲存失敗'
                    : `未儲存：請修正 ${summaryFields.length} 個欄位`}
              </strong>
            </div>
            <div className="msg-b">
              {summaryFields.length > 0 && (
                <ul className="errs">
                  {summaryFields.map((k) => (
                    <li key={k}>
                      <a
                        href={`#${uid}-${k}`}
                        onClick={(e) => {
                          e.preventDefault()
                          document.getElementById(`${uid}-${k}`)?.focus()
                        }}
                      >
                        {fieldErrorText(k, summaryErrors[k]!)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {identical && (
                <>
                  <p>下面是已存在的那一筆。四欄完全相同的資料不會重複存入；輸入的內容仍保留在表單中。</p>
                  <dl className="four existing">
                    {FIELD_ORDER.map((k) => (
                      <div key={k}>
                        <dt>{COLUMN_TITLES[k]}</dt>
                        <dd className={MONO[k] ? 'mono' : undefined}>{identical[k]}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              {systemError && <p>{systemError}</p>}
            </div>
          </div>
        )}

        {FIELD_ORDER.map((k, i) => {
          const id = `${uid}-${k}`
          const error = errors[k]
          const describedBy = [`${id}-h`, error ? `${id}-e` : '', k === 'idNumber' && idWarning ? `${id}-w` : '']
            .filter(Boolean)
            .join(' ')
          return (
            <div key={k} className={`field${error ? ' has-error' : ''}`}>
              <label htmlFor={id}>
                {COLUMN_TITLES[k]} <span className="req">必填</span>
              </label>
              <input
                id={id}
                type="text"
                className={MONO[k] ? 'mono' : undefined}
                value={values[k]}
                onChange={(e) => change(k, e.target.value)}
                onBlur={k === 'idNumber' ? () => setIdTouched(true) : undefined}
                autoComplete="off"
                autoCapitalize={k === 'headPlate' || k === 'tailPlate' ? 'characters' : 'off'}
                spellCheck={false}
                autoFocus={i === 0}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
              />
              <p id={`${id}-h`} className="help">
                {HELP[k]}
              </p>
              {error && (
                <p id={`${id}-e`} className="err">
                  <Icon name="block" />
                  <span>{fieldErrorText(k, error)}</span>
                </p>
              )}
              {k === 'idNumber' && (
                // 常駐的 live 容器：離開欄位後才出現的警示才會被讀屏播報
                <div aria-live="polite">
                  {idWarning && (
                    <p id={`${id}-w`} className="hint">
                      <Icon name="warn" />
                      <span>{idWarning}，仍可儲存</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        <div className="formacts">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            儲存
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </Modal>
  )
}
