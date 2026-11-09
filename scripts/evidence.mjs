#!/usr/bin/env node
/**
 * ochema 證據收集腳本（階段 4 測試部 A）。
 * 沙箱內 Chromium 無法啟動（Mach port），請在沙箱外執行：
 *   ! bash ~/Project/ochema/scripts/evidence.sh
 *
 * 流程：pnpm build → vite preview（固定埠，結束必關）→ Playwright Chromium 走過關鍵情境
 * → 截圖／axe／離線驗證／console 收集 → .studio/evidence/evidence-summary.md
 * 任何一步失敗都繼續下一步並在摘要標記；有失敗則以非零碼結束。
 *
 * 參數：--dry-run  只驗證路徑、產生測試檔、確認 Chromium 與預覽伺服器可用，不啟動瀏覽器（沙箱內可跑）。
 *       --skip-build  沿用現有 dist/（除錯用）。
 */
import { spawn, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const EVI = join(ROOT, '.studio/evidence')
const SHOTS = join(EVI, 'screens')
const DOWNLOADS = join(EVI, 'downloads')
const FIXTURES = join(EVI, 'fixtures')
const PORT = 4173
const ORIGIN = `http://127.0.0.1:${PORT}`
const BASE = `${ORIGIN}/ochema/`
const DRY = process.argv.includes('--dry-run')
const SKIP_BUILD = process.argv.includes('--skip-build')
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

for (const d of [EVI, SHOTS, DOWNLOADS, FIXTURES]) mkdirSync(d, { recursive: true })

// ───────────────────────── 結果收集 ─────────────────────────
const steps = [] // { id, name, ok, shots[], note, error }
const consoleErrors = [] // { phase, kind, text }
const externalRequests = [] // { phase, url }
const axeResults = {} // screen -> { violations, incomplete, passes }
const notes = [] // 額外紀錄（環境、離線、動畫）
let phase = 'init'
const failures = []

const log = (m) => console.log(m)
function must(cond, msg) {
  if (!cond) throw new Error(msg)
}

// ───────────────────────── 測試資料 ─────────────────────────
const LETTER = { A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18, K: 19, L: 20, M: 21, N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27, U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33 }
/** 依與 src/data/validation.ts 相同的檢查碼規則補出第 10 碼，得到一組檢查碼正確的駕駛身分證。 */
function validId(letter, eight) {
  const n = LETTER[letter]
  const w = [8, 7, 6, 5, 4, 3, 2, 1]
  let sum = Math.floor(n / 10) + (n % 10) * 9
  eight.split('').forEach((c, i) => (sum += Number(c) * w[i]))
  for (let d = 0; d < 10; d++) if ((sum + d) % 10 === 0) return `${letter}${eight}${d}`
  throw new Error('no check digit')
}
const R1 = { head: '929-X2', tail: '20-9A', name: '王小明', id: validId('A', '12345678') }
const R2 = { head: '929-X2', tail: '30-1B', name: '李大華', id: validId('B', '23456789') }
const R3 = { head: '111-AA', tail: '22-BB', name: '陳小美', id: 'A123456788' } // 檢查碼不符 → 警示
const R4 = { head: '555-ZZ', tail: '66-Y', name: '趙刪除', id: validId('C', '34567890') }
const R5 = { head: '888-QQ', tail: '12-AB', name: '離線新增', id: validId('D', '45678901') }

const HEADER = ['車頭車號', '車斗車號', '駕駛姓名', '駕駛身分證']
const IMPORT_ROWS = [
  [R1.head, R1.tail, R1.name, R1.id], // 檔案第 2 列：與既有資料整列相同
  ['777-N1', '88-M2', '新甲', validId('E', '56789012')], // 第 3 列：可新增
  ['777-N1', '88-M2', '新甲', validId('E', '56789012')], // 第 4 列：與第 3 列整列相同
  [R1.head, '99-Q9', '同車頭車號乙', validId('F', '67890123')], // 第 5 列：與既有重複（同車頭車號，非整列相同）
  ['bad-plate', '12-3', '格式錯誤', validId('G', '78901234')], // 第 6 列：車牌格式錯
  ['700-P1', '71-R2', '新丙', 'A123456788'], // 第 7 列：可新增，駕駛身分證警示
]

function writeFixtures() {
  const XLSX = require('xlsx')
  const aoa = [HEADER, ...IMPORT_ROWS]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '名單')
  const out = {}
  for (const [ext, type] of [['xlsx', 'xlsx'], ['xls', 'biff8']]) {
    const p = join(FIXTURES, `import-sample.${ext}`)
    writeFileSync(p, XLSX.write(wb, { type: 'buffer', bookType: type }))
    out[ext] = p
  }
  const csv = '﻿' + aoa.map((r) => r.join(',')).join('\r\n') + '\r\n'
  out.csv = join(FIXTURES, 'import-sample.csv')
  writeFileSync(out.csv, csv, 'utf8')
  // 讀回驗證：三個檔都能被 SheetJS 讀成 7 列（含標題）
  for (const [ext, p] of Object.entries(out)) {
    const rows = XLSX.utils.sheet_to_json(XLSX.read(readFileSync(p)).Sheets[XLSX.read(readFileSync(p)).SheetNames[0]], { header: 1 })
    must(rows.length === 7, `${ext} 測試檔讀回列數應為 7，實得 ${rows.length}`)
  }
  return out
}

// ───────────────────────── 建置與預覽伺服器 ─────────────────────────
let preview
function stopPreview() {
  if (preview && !preview.killed) {
    try {
      preview.kill('SIGTERM')
    } catch {
      /* 已結束 */
    }
  }
}
process.on('exit', stopPreview)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopPreview(); process.exit(130) })

function build() {
  log('› pnpm build')
  execFileSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit' })
}

async function startPreview() {
  const bin = join(ROOT, 'node_modules/.bin/vite')
  must(existsSync(bin), '找不到 node_modules/.bin/vite，請先 pnpm install')
  preview = spawn(bin, ['preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  preview.stdout.on('data', (d) => (out += d))
  preview.stderr.on('data', (d) => (out += d))
  const exited = new Promise((_, rej) => preview.once('exit', (c) => rej(new Error(`vite preview 提前結束（code ${c}）：${out.trim()}`))))
  const ready = (async () => {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(BASE)
        if (r.ok) return
      } catch {
        /* 尚未就緒 */
      }
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error(`預覽伺服器 30 秒內未就緒：${out.trim()}`)
  })()
  await Promise.race([ready, exited])
}

// ───────────────────────── 通用輔助 ─────────────────────────
const slug = (s) => s.replace(/[^\w一-龥-]+/g, '-')
let animMode = 'disabled'

/** 同一個畫面狀態各截桌面 1440 與手機 390，回傳相對於專案根的路徑。 */
async function shoot(page, id, name, tag = '') {
  const paths = []
  for (const [label, vp] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
    await page.setViewportSize(vp)
    await page.waitForTimeout(250)
    const p = join(SHOTS, `${id}-${slug(name)}${tag}-${label}.png`)
    await page.screenshot({ path: p, fullPage: true, animations: animMode })
    paths.push(p.replace(ROOT + '/', ''))
  }
  await page.setViewportSize(DESKTOP)
  await page.waitForTimeout(150)
  return paths
}

async function axe(page, screen) {
  const { default: AxeBuilder } = await import('@axe-core/playwright')
  const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  axeResults[screen] = {
    violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.map((n) => ({ target: n.target, html: n.html.slice(0, 200), summary: n.failureSummary })) })),
    incomplete: r.incomplete.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })),
    passes: r.passes.length,
  }
}

/** 執行一個步驟；失敗只記錄、不中斷後續。 */
async function step(id, name, page, fn) {
  const rec = { id, name, ok: true, shots: [], note: '' }
  steps.push(rec)
  phase = `${id} ${name}`
  const ctx = {
    shoot: async (n = name, tag = '') => rec.shots.push(...(await shoot(page, id, n, tag))),
    axe: (screen) => axe(page, `${id}-${screen ?? name}`),
    note: (t) => (rec.note += (rec.note ? '；' : '') + t),
  }
  try {
    await closeDialogs(page)
    await fn(ctx)
    log(`  ✓ ${id} ${name}`)
  } catch (e) {
    rec.ok = false
    rec.error = String(e?.message ?? e).split('\n')[0]
    failures.push(`${id} ${name}: ${rec.error}`)
    log(`  ✗ ${id} ${name}: ${rec.error}`)
    try {
      const p = join(SHOTS, `${id}-${slug(name)}-FAILED.png`)
      await page.screenshot({ path: p, fullPage: true })
      rec.shots.push(p.replace(ROOT + '/', ''))
    } catch {
      /* 頁面已不可用 */
    }
    await recover(page)
  }
}

/** 每個步驟開始前確保沒有開著的對話框。 */
async function closeDialogs(page) {
  for (let i = 0; i < 3 && (await page.locator('dialog[open]').count()) > 0; i++) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }
}

/** 失敗後回到可操作狀態：關對話框、回名單。 */
async function recover(page) {
  try {
    for (let i = 0; i < 3 && (await page.locator('dialog[open]').count()) > 0; i++) await page.keyboard.press('Escape')
    await page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: /^名單/ }).click({ timeout: 3000 })
  } catch {
    /* 盡力而為 */
  }
}

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push({ phase: `${label}｜${phase}`, kind: 'console.error', text: m.text().slice(0, 300) })
  })
  page.on('pageerror', (e) => consoleErrors.push({ phase: `${label}｜${phase}`, kind: 'pageerror', text: String(e).slice(0, 300) }))
}
function watchRequests(context, label) {
  context.on('request', (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:')) return
    externalRequests.push({ phase: `${label}｜${phase}`, url: u })
  })
}

const nav = (page, name) => page.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: new RegExp(`^${name}`) }).click()
const dialog = (page, name) => page.getByRole('dialog', { name })

async function openAdd(page) {
  await page.getByRole('button', { name: /^(新增資料|新增第一筆)$/ }).first().click()
  const dlg = dialog(page, '新增資料')
  await dlg.waitFor({ state: 'visible' })
  return dlg
}
async function fillForm(dlg, r) {
  await dlg.getByRole('textbox', { name: /^車頭車號/ }).fill(r.head)
  await dlg.getByRole('textbox', { name: /^車斗車號/ }).fill(r.tail)
  await dlg.getByRole('textbox', { name: /^駕駛姓名/ }).fill(r.name)
  await dlg.getByRole('textbox', { name: /^駕駛身分證/ }).fill(r.id)
}
async function saveAdd(page, r) {
  const dlg = await openAdd(page)
  await fillForm(dlg, r)
  await dlg.getByRole('button', { name: '儲存' }).click()
  await dlg.waitFor({ state: 'detached' })
}
async function gotoApp(page) {
  await page.goto(BASE, { waitUntil: 'load' })
  await page.getByRole('heading', { level: 1 }).waitFor()
}
const rowCount = (page) => page.locator('table tbody tr').count()

// ───────────────────────── 主流程（四組，各自新 context＝全新資料庫，彼此不連鎖） ─────────────────────────
async function newGroup(browser, label, seed = []) {
  const context = await browser.newContext({ viewport: DESKTOP, acceptDownloads: true, serviceWorkers: 'allow' })
  watchRequests(context, label)
  const page = await context.newPage()
  watch(page, label)
  animMode = 'disabled'
  phase = `${label} 準備`
  await gotoApp(page)
  for (const r of seed) await saveAdd(page, r)
  if (seed.length) await page.getByText(new RegExp(`共 ${seed.length} 筆`)).waitFor()
  return { context, page }
}
const SEED3 = [R1, R2, R3]

/** 前往匯入頁並選檔，等預覽出現。不依賴目前停在哪一頁。 */
async function toPreview(page, file) {
  await nav(page, '資料')
  await page.getByRole('button', { name: '匯入 Excel' }).click()
  await page.locator('input[type=file]').setInputFiles(file)
  await page.getByRole('group', { name: '預覽統計' }).waitFor({ timeout: 15000 })
}
const isAriaDisabled = async (loc) => (await loc.getAttribute('aria-disabled')) === 'true'

async function groupList(browser) {
  const { context, page } = await newGroup(browser, '名單流程')
  let rowsBeforeDelete = 0
  await step('01', '空狀態', page, async (s) => {
    await gotoApp(page)
    await page.getByText('名單目前沒有資料').waitFor()
    await s.shoot()
    await s.axe('empty')
  })

  await step('02', '新增表單-空白', page, async (s) => {
    const dlg = await openAdd(page)
    await s.shoot()
    await s.axe('add-form')
    await dlg.getByRole('button', { name: '取消' }).click()
    await dlg.waitFor({ state: 'detached' })
  })

  await step('03', '新增成功', page, async (s) => {
    await saveAdd(page, R1)
    await page.getByRole('status', { name: '操作結果' }).getByText('已儲存').waitFor()
    s.note(`seal 動畫：${await page.locator('.flash .seal').evaluate((e) => getComputedStyle(e).animationName + ' ' + getComputedStyle(e).animationDuration).catch(() => '（找不到 .seal）')}`)
    await s.shoot()
    await s.axe('list-1record')
  })

  await step('04', '擋下-欄位錯誤', page, async (s) => {
    const dlg = await openAdd(page)
    await dlg.getByRole('textbox', { name: /^車頭車號/ }).fill('abc-1')
    await dlg.getByRole('button', { name: '儲存' }).click()
    const alert = dlg.getByRole('alert')
    await alert.waitFor()
    const text = await alert.innerText()
    must(text.includes('未儲存'), `錯誤摘要缺「未儲存」：${text}`)
    must((await rowCount(page)) === 1, '被擋下時名單不應新增資料')
    await s.shoot()
    await s.axe('add-form-blocked')
    await dlg.getByRole('button', { name: '取消' }).click()
    await dlg.waitFor({ state: 'detached' })
  })

  await step('05', '擋下-整列相同', page, async (s) => {
    const dlg = await openAdd(page)
    await fillForm(dlg, R1)
    await dlg.getByRole('button', { name: '儲存' }).click()
    await dlg.getByRole('alert').getByText('與既有資料整列相同，未儲存').waitFor()
    must((await rowCount(page)) === 1, '整列相同被擋下，名單應仍為 1 筆')
    await s.shoot()
    await dlg.getByRole('button', { name: '取消' }).click()
    await dlg.waitFor({ state: 'detached' })
  })

  await step('06', '重複標示-同車頭車號通知', page, async (s) => {
    await saveAdd(page, R2)
    await page.getByRole('status', { name: '重複與警示通知' }).waitFor()
    await s.shoot()
    await s.axe('list-notice')
  })

  await step('07', '駕駛身分證警示-表單與通知', page, async (s) => {
    const dlg = await openAdd(page)
    await fillForm(dlg, R3)
    await dlg.getByRole('textbox', { name: /^駕駛身分證/ }).blur()
    await dlg.locator('.hint').filter({ hasText: '檢查碼' }).waitFor()
    await s.shoot('駕駛身分證警示-表單', '')
    await dlg.getByRole('button', { name: '儲存' }).click()
    await dlg.waitFor({ state: 'detached' })
    const notice = page.getByRole('status', { name: '重複與警示通知' })
    await notice.waitFor()
    must((await notice.innerText()).includes('檢查碼'), '通知應含「檢查碼不符」原因')
    await s.shoot('駕駛身分證警示-通知', '-notice')
  })

  await step('08', '總覽', page, async (s) => {
    await saveAdd(page, R4) // 供稍後刪除
    await nav(page, '總覽')
    await page.getByRole('group', { name: /^同車頭車號 929-X2/ }).waitFor()
    await page.getByRole('group', { name: '駕駛身分證警示 陳小美' }).waitFor()
    await s.shoot()
    await s.axe('overview')
  })

  await step('09', '查詢-命中', page, async (s) => {
    await nav(page, '名單')
    await page.getByRole('textbox', { name: '查詢' }).fill('929')
    await page.getByText(/符合 2 筆／共 4 筆/).waitFor()
    await s.shoot()
    await s.axe('search-hit')
  })

  await step('10', '查詢-無結果', page, async (s) => {
    await page.getByRole('textbox', { name: '查詢' }).fill('ZZZZ-不存在')
    await page.getByText('查無符合的資料').waitFor()
    await s.shoot()
    await page.getByRole('button', { name: '清除關鍵字' }).first().click()
  })

  await step('11', '刪除確認', page, async (s) => {
    await page.getByRole('button', { name: new RegExp(`^刪除 .*${R4.name}`) }).first().click()
    rowsBeforeDelete = await rowCount(page)
    const dlg = dialog(page, '刪除這筆資料？')
    await dlg.waitFor()
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim())
    must(focused === '取消', `刪除確認預設焦點應在「取消」，實得「${focused}」`)
    s.note('預設焦點＝取消')
    await s.shoot()
    await s.axe('delete-dialog')
  })

  await step('12', '刪除完成', page, async (s) => {
    // 每步開始前 closeDialogs() 會關掉 11 開的確認框，故在此重新開啟
    await page.getByRole('button', { name: new RegExp(`^刪除 .*${R4.name}`) }).first().click()
    await dialog(page, '刪除這筆資料？').getByRole('button', { name: '刪除' }).click()
    await page.getByRole('status', { name: '操作結果' }).getByText('已刪除').waitFor()
    must((await rowCount(page)) === rowsBeforeDelete - 1, `刪除後應剩 ${rowsBeforeDelete - 1} 筆，實得 ${await rowCount(page)}`)
    const ae = await page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}${a.className ? '.' + String(a.className).split(' ')[0] : ''}（${(a.textContent || '').trim().slice(0, 20)}）` : 'null' })
    s.note(`刪除後 activeElement=${ae}`)
    notes.push(`刪除一筆後 document.activeElement：${ae}`)
    must(!ae.startsWith('body'), `刪除後焦點掉回 body（${ae}）`)
    await s.shoot()
  })

  await context.close()
}

async function groupExport(browser) {
  const { context, page } = await newGroup(browser, '匯出', SEED3)

  await step('13', '資料頁', page, async (s) => {
    await nav(page, '資料')
    await page.getByRole('heading', { name: '匯出 Excel' }).waitFor()
    await s.shoot()
    await s.axe('data')
  })

  await step('13a', '分頁標題', page, async (s) => {
    const titles = {}
    for (const name of ['名單', '總覽', '資料']) {
      await nav(page, name)
      await page.waitForTimeout(300)
      titles[name] = await page.title()
    }
    const same = new Set(Object.values(titles)).size === 1
    const t = `document.title：${JSON.stringify(titles)}（切換分頁後${same ? '未改變' : '有改變'}）`
    s.note(t)
    notes.push(t)
  })

  for (const [n, label, ext] of [['14', '.xlsx', 'xlsx'], ['15', '.xls', 'xls'], ['16', 'CSV', 'csv']]) {
    await step(n, `匯出-${ext}`, page, async (s) => {
      await nav(page, '資料')
      await page.getByRole('radio', { name: label, exact: true }).check()
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: /^匯出全部/ }).click()])
      const dest = join(DOWNLOADS, dl.suggestedFilename())
      await dl.saveAs(dest)
      const size = statSync(dest).size
      must(size > 0, `${dl.suggestedFilename()} 為空檔`)
      must(dl.suggestedFilename().toLowerCase().endsWith(`.${ext}`), `副檔名不符：${dl.suggestedFilename()}`)
      s.note(`${dl.suggestedFilename()}（${size} bytes）`)
      await page.getByRole('status', { name: '操作結果' }).getByText('已匯出 3 筆資料').waitFor()
      await s.shoot()
    })
  }
  await context.close()
}

async function groupImport(browser, files) {
  const { context, page } = await newGroup(browser, '匯入', SEED3)
  const expect2211 = (ext, stats) =>
    // 第 7 列駕駛身分證 A123456788 與預建 R3（陳小美）相同但駕駛姓名不同 → 同駕駛身分證不同姓名，歸「與既有重複」
    must(/可新增 1 筆/.test(stats) && /與既有資料重複 3 筆/.test(stats) && /檔內重複 1 筆/.test(stats) && /格式錯誤 1 筆/.test(stats), `${ext} 預覽統計與預期（1/3/1/1）不符：${stats}`)

  await step('17', '匯入-選擇檔案', page, async (s) => {
    await nav(page, '資料')
    await page.getByRole('button', { name: '匯入 Excel' }).click()
    await page.getByRole('heading', { name: '匯入 Excel' }).waitFor()
    await s.shoot()
    await s.axe('import-select')
  })

  for (const [n, ext] of [['18', 'xls'], ['19', 'csv']]) {
    await step(n, `匯入預覽-${ext}`, page, async (s) => {
      await toPreview(page, files[ext])
      const stats = await page.getByRole('group', { name: '預覽統計' }).innerText()
      s.note(stats.replace(/\s+/g, ' '))
      expect2211(ext, stats)
      await s.shoot()
    })
  }

  await step('20', '匯入預覽-xlsx', page, async (s) => {
    await toPreview(page, files.xlsx)
    const stats = await page.getByRole('group', { name: '預覽統計' }).innerText()
    s.note(stats.replace(/\s+/g, ' '))
    expect2211('xlsx', stats)
    await page.getByRole('group', { name: '整列相同的列' }).waitFor()
    const confirm = page.getByRole('button', { name: '確認匯入' })
    must(await isAriaDisabled(confirm), '有重複且尚未選匯入方式時「確認匯入」應為 aria-disabled=true')
    s.note('未選方式時「確認匯入」aria-disabled＝true')
    await s.shoot()
    await s.axe('import-preview')
  })

  await step('21', '匯入預覽-選照樣匯入', page, async (s) => {
    await toPreview(page, files.xlsx)
    await page.getByRole('radio', { name: '照樣匯入' }).check()
    must(!(await isAriaDisabled(page.getByRole('button', { name: '確認匯入' }))), '選擇方式後「確認匯入」不應為 aria-disabled')
    await s.shoot()
  })

  await step('22', '匯入結果', page, async (s) => {
    await toPreview(page, files.xlsx)
    await page.getByRole('radio', { name: '照樣匯入' }).check()
    await page.getByRole('button', { name: '確認匯入' }).click()
    // a11y 修正後結果放在常駐 aria-live 容器（非 role=status）
    const res = page.getByText(/匯入完成/).first()
    await res.waitFor()
    const text = (await res.innerText()).replace(/\s+/g, ' ')
    s.note(text)
    must(/已匯入 3 筆/.test(text) && /略過 2 筆/.test(text), `預期照樣匯入 3 筆（第 3 列新增＋第 5 列同車頭車號＋第 7 列同駕駛身分證不同姓名）、略過 2 筆（整列相同 2 列），實得：${text}`)
    await s.shoot()
    await s.axe('import-result')
  })

  await step('23', '匯入後名單', page, async (s) => {
    await nav(page, '名單')
    await page.getByText(/共 6 筆/).waitFor()
    await s.shoot()
  })
  await context.close()
}

async function groupOffline(browser) {
  const { context, page } = await newGroup(browser, '離線', SEED3)
  await offlineFlow(context, page)
  await context.close()
}

async function mainFlow(browser, files) {
  await groupList(browser)
  await groupExport(browser)
  await groupImport(browser, files)
  await groupOffline(browser)
}

// ───────────────────────── 離線 ─────────────────────────
async function offlineFlow(context, page) {
  const base = externalRequests.length
  await step('24', '離線-首次載入後 SW 就緒', page, async (s) => {
    await gotoApp(page)
    const info = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      let cached = 0
      for (let i = 0; i < 40 && cached === 0; i++) {
        cached = 0
        for (const k of await caches.keys()) cached += (await (await caches.open(k)).keys()).length
        if (cached === 0) await new Promise((r) => setTimeout(r, 250))
      }
      return { scope: reg.scope, state: reg.active?.state, cached }
    })
    must(info.state === 'activated' && info.cached > 0, `SW 未就緒：${JSON.stringify(info)}`)
    s.note(`SW scope=${info.scope}，預快取 ${info.cached} 項`)
    await page.reload({ waitUntil: 'load' }) // 重新載入後頁面才受 SW 控制
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller)
    must(controlled, '重新載入後頁面仍未受 SW 控制')
  })

  await step('25', '離線-重新載入可開啟並查詢', page, async (s) => {
    await context.setOffline(true)
    try {
      await page.reload({ waitUntil: 'load' })
      await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 10000 })
      await page.getByText(/共 3 筆/).waitFor()
      await page.getByRole('textbox', { name: '查詢' }).fill('929')
      await page.getByText(/符合 \d+ 筆／共 3 筆/).waitFor()
      await s.shoot('離線-查詢', '')
      await page.getByRole('button', { name: '清除關鍵字' }).first().click()
    } finally {
      // 先不恢復網路，下一步還要在離線下新增
    }
  })

  await step('26', '離線-新增', page, async (s) => {
    await saveAdd(page, R5)
    await page.getByText(/共 4 筆/).waitFor()
    await s.shoot('離線-新增後', '')
    await page.reload({ waitUntil: 'load' })
    await page.getByText(/共 4 筆/).waitFor() // 離線重載後資料仍在
    s.note('離線新增並重載後共 4 筆')
  })
  await context.setOffline(false)
  const ext = externalRequests.length - base
  notes.push(`離線流程期間對外（非 ${ORIGIN}）請求：${ext}`)
}

// ───────────────────────── 暗色／reduced-motion 組 ─────────────────────────
async function themedGroup(browser, key, label, opts) {
  const context = await browser.newContext({ viewport: DESKTOP, ...opts })
  watchRequests(context, label)
  const page = await context.newPage()
  watch(page, label)
  animMode = key === 'rm' ? 'allow' : 'disabled'
  const id = (n) => `${key}${n}`

  await step(id('0'), `${label}-建立資料`, page, async () => {
    await gotoApp(page)
    for (const r of [R1, R2, R3]) await saveAdd(page, r)
  })
  await step(id('1'), `${label}-名單`, page, async (s) => {
    await nav(page, '名單')
    await page.getByText(/共 3 筆/).waitFor()
    if (key === 'rm') {
      const d = await page.evaluate(() => {
        const q = (sel) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return `${c.animationName} ${c.animationDuration} / transition ${c.transitionDuration}` }
        return { seal: q('.flash .seal'), btn: q('.btn-primary'), mq: matchMedia('(prefers-reduced-motion: reduce)').matches }
      })
      s.note(`reduce 命中=${d.mq}；.seal=${d.seal}；.btn-primary=${d.btn}`)
      notes.push(`reduced-motion 計算樣式：${JSON.stringify(d)}`)
    } else {
      const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      s.note(`body 背景=${dark}`)
    }
    await s.shoot()
    await s.axe(`list-${key}`)
  })
  await step(id('2'), `${label}-總覽`, page, async (s) => {
    await nav(page, '總覽')
    await page.getByRole('group', { name: '駕駛身分證警示 陳小美' }).waitFor()
    await s.shoot()
    await s.axe(`overview-${key}`)
  })
  await step(id('3'), `${label}-新增表單擋下`, page, async (s) => {
    await nav(page, '名單')
    const dlg = await openAdd(page)
    await dlg.getByRole('button', { name: '儲存' }).click()
    await dlg.getByRole('alert').waitFor()
    await s.shoot()
    await s.axe(`add-blocked-${key}`)
    await dlg.getByRole('button', { name: '取消' }).click()
  })
  await step(id('4'), `${label}-刪除確認`, page, async (s) => {
    await page.getByRole('button', { name: /^刪除 / }).first().click()
    await dialog(page, '刪除這筆資料？').waitFor()
    await s.shoot()
    await dialog(page, '刪除這筆資料？').getByRole('button', { name: '取消' }).click()
  })
  await step(id('5'), `${label}-資料頁`, page, async (s) => {
    await nav(page, '資料')
    await page.getByRole('heading', { name: '匯出 Excel' }).waitFor()
    await s.shoot()
    await s.axe(`data-${key}`)
  })
  await context.close()
}

// ───────────────────────── 摘要 ─────────────────────────
function writeSummary(env, fatal) {
  const ok = steps.filter((s) => s.ok).length
  const violationCount = Object.values(axeResults).reduce((n, r) => n + r.violations.length, 0)
  const L = []
  L.push('# ochema 證據摘要', '')
  L.push(`- 產生時間：${new Date().toISOString()}`)
  L.push(`- 步驟：${ok} 通過／${steps.length - ok} 失敗（共 ${steps.length}）`)
  L.push(`- console error／pageerror：${consoleErrors.length}`)
  L.push(`- 對外請求（非 ${ORIGIN}）：${externalRequests.length}（預期 0）`)
  L.push(`- axe（WCAG 2.1 A／AA）違規規則數（各畫面加總）：${violationCount}`)
  if (fatal) L.push(`- **致命錯誤**：${fatal}`)
  L.push('', '## 環境', '', ...Object.entries(env).map(([k, v]) => `- ${k}：${v}`))
  L.push('', '## 步驟', '', '| 編號 | 步驟 | 結果 | 截圖 | 備註 |', '|---|---|---|---|---|')
  for (const s of steps) {
    const shots = s.shots.map((p) => `[${p.split('/').pop()}](../../${p})`).join('<br>')
    L.push(`| ${s.id} | ${s.name} | ${s.ok ? '通過' : '**失敗**'} | ${shots || '—'} | ${(s.ok ? s.note : `${s.error ?? ''} ${s.note}`).replace(/\|/g, '／')} |`)
  }
  L.push('', '## 離線與對外請求', '', ...(notes.length ? notes.map((n) => `- ${n}`) : ['- （無）']))
  L.push('', externalRequests.length ? '對外請求清單：' : '對外請求：0 筆。', ...externalRequests.map((r) => `- [${r.phase}] ${r.url}`))
  L.push('', '## console error／pageerror', '', ...(consoleErrors.length ? consoleErrors.map((c) => `- [${c.phase}] ${c.kind}：${c.text}`) : ['- 無']))
  L.push('', '## axe（完整結果見 `axe.json`）', '', '| 畫面 | 違規 | 需人工確認 | 通過規則 | 違規規則 |', '|---|---|---|---|---|')
  for (const [k, r] of Object.entries(axeResults)) L.push(`| ${k} | ${r.violations.length} | ${r.incomplete.length} | ${r.passes} | ${r.violations.map((v) => `${v.id}(${v.impact})`).join('、') || '—'} |`)
  if (!Object.keys(axeResults).length) L.push('| （未執行） | | | | |')
  writeFileSync(join(EVI, 'evidence-summary.md'), L.join('\n') + '\n')
  writeFileSync(join(EVI, 'axe.json'), JSON.stringify({ tags: AXE_TAGS, screens: axeResults }, null, 2))
}

// ───────────────────────── 進入點 ─────────────────────────
async function main() {
  const env = { Node: process.version, 平台: `${process.platform}/${process.arch}` }
  let fatal
  try {
    const { chromium } = await import('playwright')
    env.playwright = require('playwright/package.json').version
    const exe = chromium.executablePath()
    env['Chromium 執行檔'] = `${exe}（${existsSync(exe) ? '存在，沿用既有' : '不存在！請見下方錯誤'}）`
    must(existsSync(exe), `Playwright ${env.playwright} 需要的 Chromium 不在 ${exe}；請 \`npx playwright install chromium\` 或改用相容版本`)

    const files = writeFixtures()
    log(`› 測試檔已產生：${Object.values(files).map((p) => p.replace(ROOT + '/', '')).join(', ')}`)

    if (!SKIP_BUILD) build()
    must(existsSync(join(ROOT, 'dist/index.html')), 'dist/index.html 不存在，build 失敗')
    await startPreview()
    log(`› vite preview 已就緒 ${BASE}`)

    if (DRY) {
      const sw = await fetch(`${BASE}sw.js`)
      must(sw.ok, `sw.js 無法取得（${sw.status}）`)
      log('› --dry-run：路徑、測試檔、Chromium、預覽伺服器、sw.js 皆正常；未啟動瀏覽器')
      return 0
    }

    const browser = await chromium.launch()
    env['Chromium 版本'] = browser.version()
    try {
      await mainFlow(browser, files)
      await themedGroup(browser, 'dk', '暗色主題', { colorScheme: 'dark' })
      await themedGroup(browser, 'rm', 'reduced-motion', { reducedMotion: 'reduce' })
    } finally {
      await browser.close()
    }
  } catch (e) {
    fatal = String(e?.message ?? e)
    failures.push(`致命：${fatal}`)
    console.error(e)
  } finally {
    stopPreview()
    if (!DRY) writeSummary(env, fatal)
  }
  const bad = failures.length > 0 || consoleErrors.length > 0 || externalRequests.length > 0
  if (!DRY) log(`\n摘要：${join(EVI, 'evidence-summary.md')}\n步驟失敗 ${failures.length}、console 錯誤 ${consoleErrors.length}、對外請求 ${externalRequests.length}`)
  return DRY ? (failures.length ? 1 : 0) : bad ? 1 : 0
}

process.exitCode = await main()
