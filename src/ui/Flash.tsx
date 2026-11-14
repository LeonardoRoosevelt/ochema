import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from './icons'

export interface FlashData {
  id: number
  body: ReactNode
  /** L1 落款蓋章：存檔成功時蓋一枚「存」字印 */
  seal?: boolean
  /** 失敗類訊息（例如無法複製）改用警示樣式，不可沿用成功的勾勾 */
  tone?: 'warn'
}

const VISIBLE_MS = 8000

/**
 * C3 操作結果訊息。live region 常駐（先存在再填內容，讀屏才會播報）；停留 8 秒（IA 要求 ≥5 秒）。
 * 游標停在訊息上或焦點在訊息內時暫停計時（WCAG 2.2.1），也可按「關閉」立即收起。
 * 訊息固定在可視區內（見 styles.css 的 .flash），長名單捲到中段也看得到。
 */
export function Flash({ flash, onExpire }: { flash: FlashData | undefined; onExpire: (id: number) => void }) {
  const [hover, setHover] = useState(false)
  const [focusWithin, setFocusWithin] = useState(false)
  const paused = hover || focusWithin

  useEffect(() => {
    if (!flash || paused) return
    const t = window.setTimeout(() => onExpire(flash.id), VISIBLE_MS)
    return () => window.clearTimeout(t)
  }, [flash, paused, onExpire])

  // 訊息被收掉（元素卸載不會觸發 mouseleave／blur），把暫停狀態歸零，下一則才會正常計時
  useEffect(() => {
    if (!flash) {
      setHover(false)
      setFocusWithin(false)
    }
  }, [flash])

  return (
    <div
      className={`flash${flash?.seal ? ' has-seal' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
      }}
    >
      <div role="status" aria-label="操作結果">
        {flash && (
          <div key={flash.id} className={`msg ${flash.tone === 'warn' ? 'msg-warn' : 'msg-ok'} compact${flash.seal ? '' : ' nosel'}`}>
            <div className="msg-h">
              <Icon name={flash.tone === 'warn' ? 'warn' : 'ok'} />
              <span>{flash.body}</span>
            </div>
            {flash.seal && (
              <span className="seal" aria-hidden="true">
                存
              </span>
            )}
          </div>
        )}
      </div>
      {/* 關閉鈕放在 live 容器外，讀屏播報訊息時不會多念一個「關閉」 */}
      {flash && (
        <button type="button" className="btn btn-ghost flash-close" onClick={() => onExpire(flash.id)}>
          關閉
        </button>
      )}
    </div>
  )
}
