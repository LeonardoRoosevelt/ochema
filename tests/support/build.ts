/**
 * 建置情境（@table:none）用：在測試中只建置一次並共用（同一個 worker 內 memoize）。
 * 這裡跑的是 `vite build`（產出 dist/ 與 service worker）；tsc 型別檢查由 `pnpm build` 另外負責。
 */
import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = process.cwd()
export const DIST = resolve(ROOT, 'dist')

let built: Promise<void> | undefined

/** vitest 會把 NODE_ENV 設成 test，vite-plugin-pwa 因此會產出未壓縮的 sw.js；建置子行程必須回到 production。 */
function productionEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: 'production', CI: '1' }
  for (const key of Object.keys(env)) if (key.startsWith('VITEST')) delete env[key]
  return env
}

export function ensureBuilt(): Promise<void> {
  built ??= new Promise<void>((ok, fail) => {
    execFile(
      process.execPath,
      [resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'build'],
      { cwd: ROOT, env: productionEnv(), maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) fail(new Error(`vite build 失敗：${err.message}\n${stdout}\n${stderr}`))
        else ok()
      },
    )
  })
  return built
}

/** dist/ 下所有檔案（相對於 dist 的 POSIX 路徑） */
export function distFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else out.push(relative(DIST, full).split('\\').join('/'))
    }
  }
  if (existsSync(DIST)) walk(DIST)
  return out.sort()
}

export const distText = (path: string): string => readFileSync(join(DIST, path), 'utf8')

/** 從 sw.js 取出 precacheAndRoute 的網址清單（相對於 service worker 的 scope） */
export function precacheUrls(): string[] {
  const sw = distText('sw.js')
  const start = sw.indexOf('precacheAndRoute(')
  if (start < 0) throw new Error('sw.js 沒有 precacheAndRoute')
  const end = sw.indexOf(']', start)
  return [...sw.slice(start, end).matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]!)
}

/** 不是「資源」的檔案：service worker 本身與 workbox 執行階段 */
export const isServiceWorkerFile = (f: string) => f === 'sw.js' || /^workbox-.*\.js$/.test(f)
