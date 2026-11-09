import { FIELD_ORDER } from './types'
import type { FieldKey, IdCheck, PlateCheck, PlateReason, RecordFields, RecordValidation } from './types'

// 全形字元：U+FF01–FF5E（全形英數、標點含全形連字號）、U+FFE0–FFE6
const FULLWIDTH = /[！-～￠-￦]/

/** 車牌檢查：先 trim，再依契約 §1.1 的優先序取第一個成立者。不自動轉大寫、不正規化。 */
export function checkPlate(raw: string): PlateCheck {
  const value = raw.trim()
  const fail = (code: PlateReason): PlateCheck => ({ ok: false, code, value })
  if (value.length === 0) return fail('REQUIRED')
  if (/\s/.test(value)) return fail('PLATE_INNER_WHITESPACE')
  if (FULLWIDTH.test(value)) return fail('PLATE_FULLWIDTH')
  if (/[a-z]/.test(value)) return fail('PLATE_LOWERCASE')
  if (/[^A-Z0-9-]/.test(value)) return fail('PLATE_INVALID_CHAR')
  if (!value.includes('-')) return fail('PLATE_NO_HYPHEN')
  const parts = value.split('-')
  if (parts.length > 2) return fail('PLATE_MULTI_HYPHEN')
  if (parts[0] === '' || parts[1] === '') return fail('PLATE_EMPTY_PART')
  return { ok: true, value }
}

// 首碼字母對應 n（注意 I=34、O=35、W=32、X=30、Y=31、Z=33 不是依字母順序）
const LETTER_VALUE: Record<string, number> = {
  A: 10, B: 11, C: 12, D: 13, E: 14, F: 15, G: 16, H: 17, I: 34, J: 18, K: 19, L: 20, M: 21,
  N: 22, O: 35, P: 23, Q: 24, R: 25, S: 26, T: 27, U: 28, V: 29, W: 32, X: 30, Y: 31, Z: 33,
}
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 1, 1]

function checksumOk(id: string): boolean {
  const n = LETTER_VALUE[id.charAt(0)] ?? 0
  let sum = Math.floor(n / 10) + (n % 10) * 9
  WEIGHTS.forEach((w, i) => {
    sum += Number(id.charAt(i + 1)) * w
  })
  return sum % 10 === 0
}

/** 駕駛身分證檢查：只警示不阻擋；空字串回 required。 */
export function checkIdNumber(raw: string): IdCheck {
  const value = raw.trim()
  if (value.length === 0) return { status: 'required', code: 'REQUIRED', value: '' }
  const warn = (code: Extract<IdCheck, { status: 'warn' }>['code']): IdCheck => ({ status: 'warn', code, value })
  if (value.length !== 10) return warn('ID_LENGTH')
  if (/^[a-z]/.test(value)) return warn('ID_LOWERCASE')
  if (!/^[A-Z]/.test(value)) return warn('ID_FIRST_NOT_ALPHA')
  if (/^.[A-Za-z]/.test(value)) return warn('ID_LEGACY_RESIDENCE')
  if (/[^0-9]/.test(value.slice(1))) return warn('ID_NON_DIGIT')
  if (!checksumOk(value)) return warn('ID_CHECKSUM')
  return { status: 'ok', value }
}

/** 四欄一次檢查。輸入會先 trim；回傳的 fields 即將存入的值。 */
export function validateRecordInput(input: RecordFields): RecordValidation {
  const fields: RecordFields = {
    headPlate: input.headPlate.trim(),
    tailPlate: input.tailPlate.trim(),
    ownerName: input.ownerName.trim(),
    idNumber: input.idNumber.trim(),
  }
  const errors: RecordValidation['errors'] = {}
  const head = checkPlate(fields.headPlate)
  if (!head.ok) errors.headPlate = head.code
  const tail = checkPlate(fields.tailPlate)
  if (!tail.ok) errors.tailPlate = tail.code
  if (fields.ownerName === '') errors.ownerName = 'REQUIRED'
  const id = checkIdNumber(fields.idNumber)
  if (id.status === 'required') errors.idNumber = 'REQUIRED'

  const result: RecordValidation = { fields, errors }
  const first = FIELD_ORDER.find((k: FieldKey) => errors[k] !== undefined)
  if (first) result.firstError = { field: first, code: errors[first]! }
  if (id.status === 'warn') result.idWarning = id.code
  return result
}
