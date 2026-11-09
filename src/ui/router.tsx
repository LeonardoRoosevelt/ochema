// 極簡 hash 路由：GitHub Pages 沒有伺服器端 fallback，用 hash 就不會有「重新整理 404」的問題。
// 表單與刪除確認是畫面上的對話框（不是路由）；查詢條件存在 App 的狀態裡，所以跨頁會保留。
import { createContext, useCallback, useContext, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'

export type Route = 'list' | 'overview' | 'data' | 'import'

const HASH: Record<Route, string> = { list: '#/', overview: '#/overview', data: '#/data', import: '#/data/import' }

export function parseHash(hash: string): Route {
  if (hash === HASH.overview) return 'overview'
  if (hash === HASH.data) return 'data'
  if (hash === HASH.import) return 'import'
  return 'list'
}

interface RouterValue {
  route: Route
  navigate: (to: Route) => void
}
const RouterContext = createContext<RouterValue>({ route: 'list', navigate: () => {} })

export function useRouterState(onNavigate: () => void): RouterValue {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  useEffect(() => {
    const onPop = () => {
      setRoute(parseHash(window.location.hash))
      onNavigate()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [onNavigate])

  const navigate = useCallback(
    (to: Route) => {
      if (window.location.hash !== HASH[to]) window.history.pushState(null, '', HASH[to])
      setRoute(to)
      onNavigate()
    },
    [onNavigate],
  )
  return { route, navigate }
}

export function RouterProvider({ value, children }: { value: RouterValue; children: ReactNode }) {
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export const useRouter = () => useContext(RouterContext)

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: Route
}

export function Link({ to, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouter()
  return (
    <a
      {...rest}
      href={HASH[to]}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
