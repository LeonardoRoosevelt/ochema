/**
 * App 根：載入名單、持有查詢關鍵字／對話框／通知狀態，依 hash 路由切換 S1、S5、S6、S4。
 * 畫面的可及名稱契約（step definitions 依此操作與斷言）寫在 tests/support/ui.ts 檔頭。
 * 名單、重複、警示全是「由目前名單即時計算」的衍生資料，不另存，所以不會與資料庫不同步。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectDuplicates } from './data/duplicates'
import { listRecords, buildOverview } from './data/records'
import { filterRecords } from './data/search'
import type { DuplicateKind, IdWarning, SaveSuccess, VehicleRecord } from './data/types'
import { DataView } from './ui/DataView'
import { DeleteDialog } from './ui/DeleteDialog'
import { browserDownload, type DownloadFn } from './ui/download'
import { Flash, type FlashData } from './ui/Flash'
import { Icon, IconSprite } from './ui/icons'
import { ImportView } from './ui/ImportView'
import { ListView, type LoadStatus } from './ui/ListView'
import type { NoticeData } from './ui/Notice'
import { OverviewView } from './ui/OverviewView'
import { RecordForm } from './ui/RecordForm'
import { Link, RouterProvider, useRouterState } from './ui/router'
import { applyTheme, loadTheme, type ThemeChoice } from './ui/theme'
import { useKeyword } from './ui/useKeyword'
import './ui/styles.css'

export type { DownloadedFile, DownloadFn } from './ui/download'

export interface AppProps {
  /** 預設實作：Blob + <a download>。測試注入以攔截。 */
  download?: DownloadFn
}

const ROUTE_TITLE = { list: '名單', overview: '總覽', data: '資料', import: '匯入' } as const

type FormTarget = { mode: 'add' } | { mode: 'edit'; record: VehicleRecord }

export function App({ download = browserDownload }: AppProps) {
  const [records, setRecords] = useState<VehicleRecord[]>([])
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [form, setForm] = useState<FormTarget | undefined>()
  const [deleting, setDeleting] = useState<VehicleRecord | undefined>()
  const [notice, setNotice] = useState<NoticeData | undefined>()
  const [flash, setFlash] = useState<FlashData | undefined>()
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme)
  const keyword = useKeyword()

  /** 重新讀取名單。首次載入失敗顯示錯誤面板（不可顯示成空名單）；已有資料時重新整理失敗則維持畫面。 */
  const refresh = useCallback(async () => {
    try {
      setRecords(await listRecords())
      setStatus('ready')
    } catch {
      setStatus((s) => (s === 'ready' ? s : 'error'))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 每次切換畫面都重讀一次，確保看到的是資料庫當下的內容
  const router = useRouterState(() => void refresh())
  const { route, navigate } = router

  // 單頁應用切換畫面時瀏覽器不會自己做的事：更新標題，並把焦點移到新畫面的標題（讀屏因此會念出新畫面）。首次載入不搶焦點。
  const firstRoute = useRef(true)
  useEffect(() => {
    document.title = `${ROUTE_TITLE[route]} — 土方車輛`
    if (firstRoute.current) {
      firstRoute.current = false
      return
    }
    const target = document.querySelector<HTMLElement>('[data-view-heading]') ?? document.getElementById('main')
    target?.focus()
  }, [route])

  const isDark = () => theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const toggleTheme = () => chooseTheme(isDark() ? 'light' : 'dark')
  const chooseTheme = (t: ThemeChoice) => {
    setTheme(t)
    applyTheme(t)
  }

  const duplicates = useMemo(() => (status === 'ready' ? detectDuplicates(records) : undefined), [records, status])
  const overview = useMemo(() => (status === 'ready' ? buildOverview(records) : undefined), [records, status])
  const idWarningById = useMemo(() => {
    const m = new Map<number, IdWarning>()
    for (const w of overview?.idWarnings ?? []) m.set(w.record.id, w.code)
    return m
  }, [overview])
  const kindsById: ReadonlyMap<number, readonly DuplicateKind[]> = duplicates?.byRecordId ?? new Map()
  const shown = useMemo(() => filterRecords(records, keyword.applied), [records, keyword.applied])
  const problems = overview ? overview.duplicateGroups.length + overview.idWarnings.length : 0

  const say = useCallback((body: FlashData['body'], seal = false) => {
    setFlash((f) => ({ id: (f?.id ?? 0) + 1, body, seal }))
  }, [])
  const expire = useCallback((id: number) => setFlash((f) => (f?.id === id ? undefined : f)), [])

  async function onSaved(result: SaveSuccess, previous: VehicleRecord | undefined) {
    await refresh()
    const { record } = result
    setNotice(result.notices.length > 0 || result.idWarning ? { record, notices: result.notices, ...(result.idWarning ? { idWarning: result.idWarning } : {}) } : undefined)
    const hidden = previous && filterRecords([record], keyword.applied).length === 0
    say(`已儲存：${record.headPlate}／${record.tailPlate}／${record.ownerName}${hidden ? '（目前不在篩選結果中）' : ''}`, true)
    setForm(undefined)
  }

  async function onDeleted(record: VehicleRecord) {
    await refresh()
    say(
      <>
        <strong>已刪除</strong>{' '}
        <span className="strike">
          {record.headPlate}／{record.tailPlate}／{record.ownerName}
        </span>{' '}
        <span className="stamp-word">已劃除</span>
      </>,
    )
    setDeleting(undefined)
  }

  return (
    <RouterProvider value={router}>
      <IconSprite />
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        跳到主要內容
      </a>
      <header className="appbar">
        <div className="wrap bar">
          <div className="brand">
            <span className="logo" aria-hidden="true">
              №
            </span>
            <h1>
              土方車輛
            </h1>
          </div>
          <nav className="mainnav" aria-label="主要導覽">
            <Link to="list" aria-current={route === 'list' ? 'page' : undefined}>
              <Icon name="list" />
              <span>名單</span>
            </Link>
            <Link to="overview" aria-current={route === 'overview' ? 'page' : undefined}>
              <Icon name="overview" />
              <span>總覽</span>
              {problems > 0 && (
                <>
                  <span className="badge" aria-hidden="true">
                    {problems}
                  </span>
                  <span className="sr"> 有 {problems} 個問題</span>
                </>
              )}
            </Link>
            <Link to="data" aria-current={route === 'data' || route === 'import' ? 'page' : undefined}>
              <Icon name="data" />
              <span>資料</span>
            </Link>
          </nav>
          <button type="button" className="btn btn-ghost themebtn" aria-label="暗色主題" aria-pressed={isDark()} onClick={toggleTheme}>
            <Icon name="theme" />
            <span className="thlabel">主題</span>
          </button>
        </div>
      </header>

      <main id="main" className="wrap" tabIndex={-1}>
        <Flash flash={flash} onExpire={expire} />

        {route === 'list' && (
          <ListView
            status={status}
            total={records.length}
            shown={shown}
            keyword={keyword}
            kindsById={kindsById}
            idWarningById={idWarningById}
            notice={notice}
            onDismissNotice={() => setNotice(undefined)}
            onAdd={() => setForm({ mode: 'add' })}
            onEdit={(record) => setForm({ mode: 'edit', record })}
            onDelete={setDeleting}
            onImport={() => navigate('import')}
            onRetry={() => void refresh()}
          />
        )}
        {route === 'overview' && overview && (
          <OverviewView
            overview={overview}
            total={records.length}
            onEdit={(record) => setForm({ mode: 'edit', record })}
            onDelete={setDeleting}
          />
        )}
        {route === 'data' && (
          <DataView
            count={records.length}
            download={download}
            onImport={() => navigate('import')}
            onResult={(m) => say(m)}
            theme={theme}
            onTheme={chooseTheme}
          />
        )}
        {route === 'import' && <ImportView onCommitted={async () => { setNotice(undefined); setFlash(undefined); await refresh() }} onCancel={() => navigate('data')} download={download} />}
      </main>

      {form && (
        <RecordForm
          key={form.mode === 'edit' ? form.record.id : 'new'}
          {...(form.mode === 'edit' ? { record: form.record } : {})}
          onClose={() => setForm(undefined)}
          onSaved={onSaved}
        />
      )}
      {deleting && <DeleteDialog record={deleting} onCancel={() => setDeleting(undefined)} onDeleted={onDeleted} />}
    </RouterProvider>
  )
}
