import { defineConfig } from 'vitest/config'

// 刻意不沿用 vite.config.ts：測試不需要 PWA plugin。
// 全部在 jsdom + fake-indexeddb 下執行：@api 情境直接呼叫資料層，@ui 情境 render <App/>，
// 建置情境（@table:none）讀 dist/ 產物（建置在測試中只做一次，見 tests/support/build.ts）。
export default defineConfig({
  // 元件測試（.tsx）用 React 17+ 的自動 JSX 轉換
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.steps.ts', 'tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['tests/support/setupDom.ts'],
    // 建置情境需要跑一次 vite build，遠超過預設 5 秒
    // 大檔匯入／匯出測試（5,000～65,535 列）是 CPU 密集；檔案平行過多或同機有其他建置時會逾時（偶發失敗的原因）
    testTimeout: 60_000,
    maxWorkers: 4,
    hookTimeout: 120_000,
  },
})
