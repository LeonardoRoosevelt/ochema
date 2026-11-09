// 外觀主題：跟隨系統／亮色／暗色。偏好存本機；首繪前的套用由 index.html 的內嵌小腳本負責（避免閃白）。
export type ThemeChoice = 'system' | 'light' | 'dark'
const KEY = 'ochema-theme'

export function loadTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* 無痕模式或被封鎖：當作沒有偏好 */
  }
  return 'system'
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    /* 存不進去就只在這次生效 */
  }
}
