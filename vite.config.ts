import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * GitHub Pages 沒有伺服器端的 SPA fallback，直接開深層網址會回 404。
 * Service Worker 裝好之後由 navigateFallback 接手，但「第一次」造訪深層網址
 * （書籤、分享連結、清過快取）會落空。GitHub Pages 會把 404 導向 404.html，
 * 因此放一份 index.html 的複本即可讓路由自己接手。
 */
function spaFallback(): Plugin {
  return {
    name: 'spa-404-fallback',
    apply: 'build',
    closeBundle() {
      const out = resolve('dist')
      copyFileSync(resolve(out, 'index.html'), resolve(out, '404.html'))
    },
  }
}

export default defineConfig({
  // GitHub Pages 專案頁：站台位於 <user>.github.io/ochema/。
  // 這個值會流進 import.meta.env.BASE_URL，路由與資源路徑都由它推導。
  base: '/ochema/',
  plugins: [
    react(),
    spaFallback(),
    VitePWA({
      // prompt：新版本下載完成後「等待」而不是直接接管。
      // offline-use.feature 要求更新期間不得自動重新載入正在使用的頁面（使用者可能正在填表單）。
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: '土方車輛',
        short_name: '土方車輛',
        description: '車頭、車尾、姓名、身分證的離線查詢名單。資料僅存於本機。',
        lang: 'zh-Hant',
        dir: 'ltr',
        start_url: '/ochema/',
        scope: '/ochema/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#8E2418',
        background_color: '#F3EDDD',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // 單機 App：所有資源都預先快取，執行期不需任何網路請求。
        navigateFallback: '/ochema/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
