/** 內嵌 SVG 圖示（沒有外部資源）。整份 sprite 在 App 根部放一次，其餘地方用 <Icon name> 引用。 */
export type IconName =
  | 'dup' | 'warn' | 'block' | 'ok' | 'list' | 'overview' | 'data' | 'plus' | 'x' | 'search' | 'theme' | 'file'

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const

export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="i-dup" viewBox="0 0 24 24">
          <rect x="3" y="3" width="12" height="12" rx="1.5" {...S} />
          <rect x="9" y="9" width="12" height="12" rx="1.5" {...S} />
        </symbol>
        <symbol id="i-warn" viewBox="0 0 24 24">
          <path d="M12 3 22 20H2z" {...S} strokeLinejoin="round" />
          <path d="M12 9.5v5" {...S} strokeLinecap="round" />
          <circle cx="12" cy="17.2" r="1.2" fill="currentColor" />
        </symbol>
        <symbol id="i-block" viewBox="0 0 24 24">
          <path d="M8 2.5h8L21.5 8v8L16 21.5H8L2.5 16V8z" {...S} strokeLinejoin="round" />
          <path d="M7.5 12h9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </symbol>
        <symbol id="i-ok" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9.5" {...S} />
          <path d="m7.5 12.5 3 3 6-6.5" {...S} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </symbol>
        <symbol id="i-list" viewBox="0 0 24 24">
          <path d="M8 6h13M8 12h13M8 18h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="3.5" cy="6" r="1.3" fill="currentColor" />
          <circle cx="3.5" cy="12" r="1.3" fill="currentColor" />
          <circle cx="3.5" cy="18" r="1.3" fill="currentColor" />
        </symbol>
        <symbol id="i-overview" viewBox="0 0 24 24">
          <rect x="3" y="3" width="8" height="8" rx="1.5" {...S} />
          <rect x="13" y="3" width="8" height="8" rx="1.5" {...S} />
          <rect x="3" y="13" width="8" height="8" rx="1.5" {...S} />
          <path d="M13 17h8M17 13v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-data" viewBox="0 0 24 24">
          <ellipse cx="12" cy="5.5" rx="8" ry="3" {...S} />
          <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" {...S} />
        </symbol>
        <symbol id="i-plus" viewBox="0 0 24 24">
          <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </symbol>
        <symbol id="i-x" viewBox="0 0 24 24">
          <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-search" viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="6.5" {...S} />
          <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </symbol>
        <symbol id="i-theme" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" {...S} />
          <path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" />
        </symbol>
        <symbol id="i-file" viewBox="0 0 24 24">
          <path d="M6 2.5h8l5 5v14H6z" {...S} strokeLinejoin="round" />
          <path d="M14 2.5v5h5" {...S} />
        </symbol>
      </defs>
    </svg>
  )
}

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="i" aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  )
}
