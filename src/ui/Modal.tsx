import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  /** 對話框標題元素的 id（作為可及名稱） */
  labelledBy: string
  className?: string
  /** 使用者按 Esc 時呼叫；可呼叫 event.preventDefault() 擋下關閉 */
  onEscape: (event: Event) => void
  /** 開啟後要先聚焦的元素選擇器；找不到就讓瀏覽器決定 */
  initialFocus?: string
  children: ReactNode
}

/**
 * 原生 <dialog> + showModal()：焦點陷阱、背景惰性化與 Esc 都由瀏覽器處理。
 * 只補兩件瀏覽器不會做的事：開啟時聚焦指定元素、關閉（卸載）後把焦點還給原本的觸發點（觸發點不在了就還給畫面標題）。
 */
export function Modal({ labelledBy, className, onEscape, initialFocus, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // Safari 點按鈕不會讓按鈕取得焦點，此時 activeElement 是 <body>，不能當成「要還回去的觸發點」
    const active = document.activeElement
    const trigger = active instanceof HTMLElement && active !== document.body ? active : null
    if (!dialog.open) dialog.showModal()
    if (initialFocus) dialog.querySelector<HTMLElement>(initialFocus)?.focus()
    return () => {
      // 觸發點已消失（例如刪除後那一列不見了）時，改把焦點送到目前畫面的標題，避免掉到 <body>
      if (trigger?.isConnected) trigger.focus()
      else document.querySelector<HTMLElement>('[data-view-heading]')?.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className={`dialog ${className ?? ''}`.trim()}
      aria-labelledby={labelledBy}
      onCancel={(e) => onEscape(e.nativeEvent)}
    >
      {children}
    </dialog>
  )
}
