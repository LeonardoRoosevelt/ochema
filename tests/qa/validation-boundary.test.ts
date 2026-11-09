/**
 * QA（API 測試員）：欄位檢查的邊界。依據 docs/data-contract.md §1.1（優先序與條件）。
 * 只斷言契約已寫明的行為；契約沒寫的用 it.todo 或標 [特性紀錄]（記錄實際行為，不代表核可）。
 */
import { describe, expect, it } from 'vitest'
import { checkIdNumber, checkPlate, validateRecordInput } from '../../src/data/validation'

describe('車牌邊界 checkPlate', () => {
  it.each([
    ['A-1', true], // 單字元段
    ['0-0', true],
    ['Z-9', true],
    ['929-X2', true],
    ['0012-007', true], // 前導 0 保留
  ])('合格：%s', (raw) => {
    expect(checkPlate(raw)).toEqual({ ok: true, value: raw })
  })

  it.each([
    ['', 'REQUIRED'],
    ['   ', 'REQUIRED'],
    ['\u3000\u00A0 ', 'REQUIRED'], // 全形空白＋NBSP＋空白都被 trim
    ['A B-1', 'PLATE_INNER_WHITESPACE'],
    ['A\u00A0B-1', 'PLATE_INNER_WHITESPACE'], // 內部 NBSP
    ['A\u3000B-1', 'PLATE_INNER_WHITESPACE'], // 內部全形空白
    ['A\tB-1', 'PLATE_INNER_WHITESPACE'],
    ['A\n-1', 'PLATE_INNER_WHITESPACE'],
    ['A－1', 'PLATE_FULLWIDTH'], // 全形連字號 U+FF0D
    ['ＡＢＣ-123', 'PLATE_FULLWIDTH'],
    ['ABC-１２３', 'PLATE_FULLWIDTH'],
    ['ａ-1', 'PLATE_FULLWIDTH'], // 全形小寫：優先序 3 先於 4
    ['a-1', 'PLATE_LOWERCASE'],
    ['AB-c1', 'PLATE_LOWERCASE'],
    ['A_1', 'PLATE_INVALID_CHAR'],
    ['A.B-1', 'PLATE_INVALID_CHAR'],
    ['A–1', 'PLATE_INVALID_CHAR'], // en dash U+2013 不是連字號
    ['A–1', 'PLATE_INVALID_CHAR'],
    ['A−-1', 'PLATE_INVALID_CHAR'], // minus sign U+2212
    ['A\u200B-1', 'PLATE_INVALID_CHAR'], // 零寬空格不是 \s，也不是全形
    ['\u200BA-1', 'PLATE_INVALID_CHAR'], // 位於邊緣的零寬字元不會被 trim 吃掉
    ['A\uFEFF-1', 'PLATE_INNER_WHITESPACE'], // U+FEFF 在 JS 屬於 \s：內部算空白、邊緣被 trim
    ['Á-1', 'PLATE_INVALID_CHAR'], // 組合字（A＋重音）
    ['Á-1', 'PLATE_INVALID_CHAR'], // 預組字
    ['😀-1', 'PLATE_INVALID_CHAR'], // emoji（代理對）
    ['A-😀', 'PLATE_INVALID_CHAR'],
    ['ｱ-1', 'PLATE_INVALID_CHAR'], // 半形片假名 U+FF71，超出契約全形範圍 → 走第 5 條
    ['車-1', 'PLATE_INVALID_CHAR'],
    ['ABC123', 'PLATE_NO_HYPHEN'],
    ['A--1', 'PLATE_MULTI_HYPHEN'],
    ['A-1-2', 'PLATE_MULTI_HYPHEN'],
    ['---', 'PLATE_MULTI_HYPHEN'],
    ['-A', 'PLATE_EMPTY_PART'],
    ['A-', 'PLATE_EMPTY_PART'],
    ['-', 'PLATE_EMPTY_PART'],
  ] as const)('擋下：%j → %s', (raw, code) => {
    const r = checkPlate(raw)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe(code)
  })

  it('優先序：同時符合多個條件時取編號最小者', () => {
    expect((checkPlate('a b') as { code: string }).code).toBe('PLATE_INNER_WHITESPACE') // 2 先於 4
    expect((checkPlate('a_') as { code: string }).code).toBe('PLATE_LOWERCASE') // 4 先於 5
    expect((checkPlate('_') as { code: string }).code).toBe('PLATE_INVALID_CHAR') // 5 先於 6
    expect((checkPlate('A--') as { code: string }).code).toBe('PLATE_MULTI_HYPHEN') // 7 先於 8
  })

  it('邊緣空白（含 NBSP、全形空白）被 trim，回傳 value 為 trim 後；不轉大寫', () => {
    expect(checkPlate('\u00A0\u3000 929-X2 \u3000\u00A0')).toEqual({ ok: true, value: '929-X2' })
    expect(checkPlate(' ab-1 ')).toEqual({ ok: false, code: 'PLATE_LOWERCASE', value: 'ab-1' })
  })

  it('超長字串：契約沒有長度規則，所以 10 萬字元的合法車牌也合格，且在合理時間內判完', () => {
    const long = 'A'.repeat(100_000) + '-' + '9'.repeat(100_000)
    const t0 = performance.now()
    expect(checkPlate(long)).toEqual({ ok: true, value: long })
    expect(performance.now() - t0).toBeLessThan(500)
  })

  it('超長的不合格字串不會造成災難性正規表達式回溯', () => {
    const t0 = performance.now()
    expect(checkPlate('A'.repeat(200_000) + '!').ok).toBe(false)
    expect(checkPlate(' '.repeat(200_000) + 'A-1' + ' '.repeat(200_000))).toEqual({ ok: true, value: 'A-1' })
    expect(performance.now() - t0).toBeLessThan(1000)
  })

  it.todo('[未定義] 車牌長度上限：契約與 DBML 皆無長度規則，是否應限制（例如 20 字元）待製片人決定')
})

// ── 身分證 ────────────────────────────────────────────────

/** 契約 §1.1 的檢查碼公式，在測試端獨立再實作一次（交叉驗證 src 的實作） */
const N: Record<string, number> = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18, K: 19, L: 20, M: 21,
  N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27, U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
}
function withCheckDigit(letter: string, second: string, middle7: string): string {
  const n = N[letter]
  const body = second + middle7 // 後 9 碼的前 8 碼
  const w = [8, 7, 6, 5, 4, 3, 2, 1]
  let sum = Math.floor(n / 10) + (n % 10) * 9
  body.split('').forEach((d, i) => (sum += Number(d) * w[i]))
  const check = (10 - (sum % 10)) % 10
  return `${letter}${body}${check}`
}

describe('身分證邊界 checkIdNumber', () => {
  it.each(['A123456789', 'F131104093', 'A800000014', 'B900000017'])('已實測合格：%s', (id) => {
    expect(checkIdNumber(id)).toEqual({ status: 'ok', value: id })
  })

  it('26 個首碼字母 × 性別碼 1/2/8/9：用獨立公式造出的合法號碼都合格，檢查碼 +1 都是 ID_CHECKSUM', () => {
    for (const letter of Object.keys(N)) {
      for (const second of ['1', '2', '8', '9']) {
        const id = withCheckDigit(letter, second, '2345678')
        expect(checkIdNumber(id), id).toEqual({ status: 'ok', value: id })
        const bad = id.slice(0, 9) + String((Number(id[9]) + 1) % 10)
        expect(checkIdNumber(bad), bad).toEqual({ status: 'warn', code: 'ID_CHECKSUM', value: bad })
      }
    }
  })

  it.each([
    ['a123456789', 'ID_LOWERCASE'], // 小寫字母開頭
    ['f131104093', 'ID_LOWERCASE'],
    ['1123456789', 'ID_FIRST_NOT_ALPHA'],
    ['_123456789', 'ID_FIRST_NOT_ALPHA'],
    ['Ａ123456789', 'ID_FIRST_NOT_ALPHA'], // 全形 A
    ['AB12345678', 'ID_LEGACY_RESIDENCE'], // 舊式居留證：兩碼英文
    ['Ab12345678', 'ID_LEGACY_RESIDENCE'],
    ['A12345678X', 'ID_NON_DIGIT'],
    ['A1234 6789', 'ID_NON_DIGIT'], // 中間空白
    ['A12345678１', 'ID_NON_DIGIT'], // 全形數字
    ['A123456788', 'ID_CHECKSUM'],
    ['A800000015', 'ID_CHECKSUM'], // 新式居留證檢查碼錯
    ['B900000018', 'ID_CHECKSUM'],
  ] as const)('警示：%j → %s', (raw, code) => {
    expect(checkIdNumber(raw)).toEqual({ status: 'warn', code, value: raw })
  })

  it.each([
    ['A12345678', 9],
    ['A1234567890', 11],
    ['A', 1],
    ['A'.repeat(1000), 1000],
  ])('長度 ≠ 10 → ID_LENGTH（%j，%i 字元）', (raw) => {
    expect(checkIdNumber(raw)).toEqual({ status: 'warn', code: 'ID_LENGTH', value: raw })
  })

  it('優先序：長度先於一切；小寫首碼先於「首碼非英文」；首碼非英文先於居留證／非數字', () => {
    expect((checkIdNumber('a12345678') as { code: string }).code).toBe('ID_LENGTH') // 9 碼且小寫
    expect((checkIdNumber('aB12345678') as { code: string }).code).toBe('ID_LOWERCASE') // 小寫＋居留證形式
    expect((checkIdNumber('1B12345678') as { code: string }).code).toBe('ID_FIRST_NOT_ALPHA')
    expect((checkIdNumber('AB1234567X') as { code: string }).code).toBe('ID_LEGACY_RESIDENCE') // 居留證先於非數字
  })

  it('邊緣空白（含 NBSP、全形空白）被 trim 後才檢查；空白＝required', () => {
    expect(checkIdNumber('\u00A0A123456789\u3000')).toEqual({ status: 'ok', value: 'A123456789' })
    expect(checkIdNumber('')).toEqual({ status: 'required', code: 'REQUIRED', value: '' })
    expect(checkIdNumber(' \u00A0\u3000 ')).toEqual({ status: 'required', code: 'REQUIRED', value: '' })
  })

  it('零寬字元不被 trim：夾在尾端會讓長度變 11 而警示（只警示、不阻擋）', () => {
    expect(checkIdNumber('A123456789\u200B')).toEqual({ status: 'warn', code: 'ID_LENGTH', value: 'A123456789\u200B' })
  })

  it('[特性紀錄] 長度以 UTF-16 code unit 計：emoji（代理對）算 2 個字元', () => {
    // 契約只說「長度 ≠ 10」，沒說 code point 或 code unit。實際行為：'😀' 佔 2。
    expect(checkIdNumber('😀12345678').status).toBe('warn') // 2+8=10 個 code unit → 不是 ID_LENGTH
    expect((checkIdNumber('😀12345678') as { code: string }).code).toBe('ID_FIRST_NOT_ALPHA')
    expect((checkIdNumber('A1234567😀') as { code: string }).code).toBe('ID_NON_DIGIT')
  })
  it.todo('[未定義] 身分證長度應以 code point 還是 UTF-16 code unit 計算（目前為後者）')
})

describe('validateRecordInput 的組合邊界', () => {
  const ok = { headPlate: 'A-1', tailPlate: 'B-2', ownerName: '王小明', idNumber: 'A123456789' }

  it('四欄皆不合時，firstError 依 FIELD_ORDER 取車頭', () => {
    const v = validateRecordInput({ headPlate: '', tailPlate: '', ownerName: '', idNumber: '' })
    expect(v.errors).toEqual({ headPlate: 'REQUIRED', tailPlate: 'REQUIRED', ownerName: 'REQUIRED', idNumber: 'REQUIRED' })
    expect(v.firstError).toEqual({ field: 'headPlate', code: 'REQUIRED' })
    expect(v.idWarning).toBeUndefined() // 身分證為空時不給警示
  })

  it('身分證格式不合只警示：errors 為空、仍可存', () => {
    const v = validateRecordInput({ ...ok, idNumber: 'a12345678' })
    expect(v.errors).toEqual({})
    expect(v.firstError).toBeUndefined()
    expect(v.idWarning).toBe('ID_LENGTH')
  })

  it('姓名只有空白（含 NBSP、全形空白）→ REQUIRED', () => {
    const v = validateRecordInput({ ...ok, ownerName: '\u00A0\u3000  ' })
    expect(v.errors).toEqual({ ownerName: 'REQUIRED' })
  })

  it('姓名無格式規則：emoji、組合字、全形、零寬、超長皆可；只 trim 邊緣', () => {
    for (const name of ['😀', '👨‍👩‍👧‍👦', 'é', 'Ａ１', '王\u200B小明', '王'.repeat(50_000)]) {
      const v = validateRecordInput({ ...ok, ownerName: name })
      expect(v.errors, name.slice(0, 5)).toEqual({})
      expect(v.fields.ownerName).toBe(name)
    }
    expect(validateRecordInput({ ...ok, ownerName: '\u00A0王小明\u3000' }).fields.ownerName).toBe('王小明')
  })

  it.todo('[未定義] 姓名只有零寬字元（U+200B）：trim 不會移除，目前視為有值而存入（看起來是空白）')
})
