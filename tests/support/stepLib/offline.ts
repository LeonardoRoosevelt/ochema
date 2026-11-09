import { expect } from 'vitest'
import { listRecords } from '../../../src/data/records'
import { FIELD_ORDER } from '../../../src/data/types'
import { readExportedSheet, buildFileBytes } from '../workbook'
import { fields, type World } from '../world'
import { distFiles, distText, ensureBuilt, isServiceWorkerFile, precacheUrls } from '../build'
import { makeFile } from '../ui'
import type { Reg } from './reg'

// ── 建置產物檢查用的小工具 ─────────────────────────────

/** 從建置產物裡抓出「會被載入的資源網址」：HTML 的 src／href、CSS 的 url()／@import、manifest 的圖示與範圍。 */
function resourceReferences(): Array<{ from: string; url: string }> {
  const refs: Array<{ from: string; url: string }> = []
  for (const file of distFiles()) {
    if (/\.html$/.test(file)) {
      for (const m of distText(file).matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) refs.push({ from: file, url: m[1]! })
    } else if (/\.css$/.test(file)) {
      for (const m of distText(file).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) refs.push({ from: file, url: m[1]! })
      for (const m of distText(file).matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)/g)) refs.push({ from: file, url: m[1]! })
    } else if (file === 'manifest.webmanifest') {
      const mf = JSON.parse(distText(file)) as { start_url?: string; scope?: string; icons?: Array<{ src: string }> }
      for (const icon of mf.icons ?? []) refs.push({ from: file, url: icon.src })
      for (const u of [mf.start_url, mf.scope]) if (u) refs.push({ from: file, url: u })
    }
  }
  return refs.filter((x) => !/^(#|data:|mailto:|tel:)/.test(x.url))
}
const isExternal = (url: string) => /^(https?:)?\/\//i.test(url)
/** JS 內以字面值載入外部資源的寫法，以及常見 CDN／字型主機（React 錯誤訊息裡的 react.dev 說明網址不是載入資源，不在此列） */
const EXTERNAL_LOAD_IN_JS =
  /(?:fetch|import|importScripts|new Worker)\(\s*["'`]https?:\/\/|\.src\s*=\s*["']https?:|fonts\.(?:googleapis|gstatic)\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|cdn\.sheetjs\.com|use\.typekit\.net|bootstrapcdn|fontawesome\.com/

function swIssues(sw: string) {
  const claims = /clientsClaim\s*\(/.test(sw)
  // skipWaiting 只能出現在「收到 SKIP_WAITING 訊息」的處理器裡（前方 120 字元內要有 SKIP_WAITING）
  const unguarded = [...sw.matchAll(/skipWaiting/g)].filter((m) => !sw.slice(Math.max(0, m.index! - 120), m.index!).includes('SKIP_WAITING'))
  return { claims, unguardedSkipWaiting: unguarded.length }
}

export function registerOffline(r: Reg) {
  // ════ 建置產物（@table:none）════
  r.step('已完成正式建置', async () => {
    await ensureBuilt()
  })

  r.when('我檢查建置產物的預先快取清單', (w) => {
    w.scratch.precache = precacheUrls()
  })
  r.step('清單包含入口頁面', (w) => {
    expect(w.scratch.precache).toContain('index.html')
  })
  r.step('清單包含建置產物中所有的 JS 與 CSS 檔', (w) => {
    const assets = distFiles().filter((f) => /\.(js|css)$/.test(f) && !isServiceWorkerFile(f))
    expect(assets.length, '建置產物應至少有一個 JS').toBeGreaterThan(0)
    for (const f of assets) expect(w.scratch.precache, `預先快取清單缺少 ${f}`).toContain(f)
  })
  r.step('清單包含 App 圖示', (w) => {
    const mf = JSON.parse(distText('manifest.webmanifest')) as { icons: Array<{ src: string }> }
    expect(mf.icons.length).toBeGreaterThan(0)
    for (const icon of mf.icons) {
      expect(distFiles(), `圖示檔 ${icon.src} 不存在於 dist`).toContain(icon.src)
      expect(w.scratch.precache, `預先快取清單缺少圖示 ${icon.src}`).toContain(icon.src)
    }
  })

  r.when('我檢查建置產物中引用的資源網址', (w) => {
    w.scratch.refs = resourceReferences()
  })
  r.step('沒有任何資源指向外部網域（例如 CDN 或外部字型）', () => {
    const refs = resourceReferences()
    expect(refs.length, '應至少找到入口頁面引用的 JS 與圖示，否則掃描沒有意義').toBeGreaterThan(2)
    expect(refs.filter((x) => isExternal(x.url)), '指向外部網域的資源').toEqual([])
    for (const file of distFiles().filter((f) => /\.(js|css|html)$/.test(f))) {
      expect(distText(file), `${file} 內有載入外部資源的寫法`).not.toMatch(EXTERNAL_LOAD_IN_JS)
    }
  })

  r.when('我檢查 Web App manifest', (w) => {
    w.scratch.manifest = JSON.parse(distText('manifest.webmanifest'))
  })
  r.step('manifest 有名稱、獨立視窗顯示模式與至少一個圖示', (w) => {
    const mf = w.scratch.manifest as { name?: string; display?: string; icons?: unknown[] }
    expect(mf.name?.trim().length ?? 0).toBeGreaterThan(0)
    expect(mf.display).toBe('standalone')
    expect(mf.icons?.length ?? 0).toBeGreaterThan(0)
  })
  r.step('建置產物包含 service worker 並會在啟動時註冊', () => {
    const files = distFiles()
    expect(files).toContain('sw.js')
    const html = distText('index.html')
    const registerScript = html.match(/<script[^>]+src=["']([^"']*registerSW\.js)["']/)
    const registers = (src: string) => /serviceWorker\s*\.\s*register\(/.test(src)
    // 註冊程式碼在 registerSW.js，或打包進入口 JS 皆可，但入口頁面必須載入它
    if (registerScript) {
      expect(registers(distText('registerSW.js')), 'registerSW.js 應呼叫 serviceWorker.register').toBe(true)
    } else {
      const entry = html.match(/<script[^>]+type=["']module["'][^>]+src=["']\/ochema\/([^"']+)["']/)?.[1]
      expect(entry, '入口頁面沒有載入註冊 service worker 的腳本').toBeDefined()
      expect(registers(distText(entry!))).toBe(true)
    }
    expect(distText('registerSW.js')).toContain('/ochema/sw.js')
  })

  r.when('我檢查 service worker 的更新設定', (w) => {
    w.scratch.sw = distText('sw.js')
  })
  r.step('新版本取得後不會自動重新載入正在使用的頁面', (w) => {
    const issues = swIssues(w.scratch.sw as string)
    expect(issues.claims, 'sw.js 不該 clientsClaim（新版本會立刻接管正在使用的頁面）').toBe(false)
    expect(issues.unguardedSkipWaiting, 'sw.js 不該在 install 時無條件 skipWaiting').toBe(0)
    expect(w.scratch.sw as string, '應有等待使用者同意的 SKIP_WAITING 訊息處理').toContain('SKIP_WAITING')
    expect(distText('registerSW.js'), '註冊腳本不該自動 reload').not.toMatch(/reload/)
  })
  r.step('更新機制不會清除或重建本機資料庫', async (w) => {
    // 靜態：service worker 完全不碰 IndexedDB
    expect(w.scratch.sw as string).not.toMatch(/indexedDB|deleteDatabase/)
    // 動態：資料庫連線重新開啟（等同載入新版 App）後，資料原封不動
    await w.freshDb()
    await w.seed([fields('929-X2', '20-9A', '王小明', 'A123456789')])
    await w.reopenDb()
    expect((await listRecords()).map((x) => x.ownerName)).toEqual(['王小明'])
  })

  // ════ 離線 UI ════
  r.step('裝置沒有網路連線', (w) => {
    w.ui.network.goOffline()
    expect(navigator.onLine).toBe(false)
  })
  r.step('整個過程沒有任何對外的網路請求', (w) => {
    expect(w.ui.mounted, '操作過程中應已開啟 App').toBe(true)
    expect(w.ui.network.calls).toEqual([])
  })
  // 一趟完整的操作，每一步都檢查結果，避免「什麼都沒做所以沒有網路請求」的假綠燈
  r.when('我新增、編輯、查詢、匯入、匯出並刪除資料', async (w: World) => {
    const ui = w.ui
    await ui.open()
    await ui.addRecord(fields('929-X2', '20-9A', '王小明', 'A123456789'))
    await ui.goList()
    await ui.expectRowCount(1)

    await ui.editRow(ui.rowBy('ownerName', '王小明'), { ownerName: '王大明' })
    await ui.goList()
    expect(ui.allRowValues().map((v) => v.ownerName)).toEqual(['王大明'])

    await ui.search('王大明')
    await ui.expectRowCount(1)
    await ui.clearSearch()

    const bytes = buildFileBytes({
      kind: 'xlsx',
      headers: ['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證'],
      rows: [['KLP-7988', 'OL-02', '李美玲', 'F131104093']],
    })
    await ui.chooseImportFile(makeFile(bytes, 'journey.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
    await ui.chooseImportMode('略過重複')
    await ui.confirmImport()
    await ui.goList()
    await ui.expectRowCount(2)

    await ui.exportAll()
    expect(ui.downloads, '應取得一個匯出檔').toHaveLength(1)
    const exported = readExportedSheet(ui.downloads[0]!.bytes, 'xlsx')
    expect(exported.rows.map((row) => row[FIELD_ORDER.indexOf('ownerName')])).toEqual(['王大明', '李美玲'])

    await ui.goList()
    const dialog = await ui.requestDelete(ui.rowBy('ownerName', '王大明'))
    await ui.confirmDelete(dialog)
    await ui.expectRowCount(1)
    expect(ui.allRowValues().map((v) => v.ownerName)).toEqual(['李美玲'])
  })
}
