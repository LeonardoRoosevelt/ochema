import { useCallback, useEffect, useRef, useState } from 'react'

/** 輸入後多久套用篩選（IA：≤150ms） */
const DELAY_MS = 100

/**
 * 查詢關鍵字：query 是輸入框當下的值，applied 是真正拿去篩選的值。
 * 中文輸入法組字期間（composition）不套用，組字結束才套用，避免注音未選字時結果亂跳。
 * 放在 App 層級，所以切到其他頁再回來關鍵字還在。
 */
export function useKeyword() {
  const [query, setQuery] = useState('')
  const [applied, setApplied] = useState('')
  const composing = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  const schedule = useCallback((value: string) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setApplied(value), DELAY_MS)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return {
    query,
    applied,
    onChange(value: string) {
      setQuery(value)
      if (!composing.current) schedule(value)
    },
    onCompositionStart() {
      composing.current = true
    },
    onCompositionEnd(value: string) {
      composing.current = false
      setQuery(value)
      schedule(value)
    },
    clear() {
      window.clearTimeout(timer.current)
      setQuery('')
      setApplied('')
    },
  }
}
export type KeywordState = ReturnType<typeof useKeyword>
