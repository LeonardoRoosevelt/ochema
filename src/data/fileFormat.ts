import type { FormatResult } from './types'

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x)

/** 依內容判定檔案格式（副檔名完全不看）。判定順序見契約 §3.5.1。 */
export function detectFormat(bytes: Uint8Array): FormatResult {
  if (bytes.length === 0) return { ok: false, code: 'EMPTY_FILE' }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return { ok: true, format: 'xlsx' }
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return { ok: true, format: 'xls' }
  const body = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? bytes.subarray(3) : bytes
  if (body.length === 0) return { ok: false, code: 'EMPTY_FILE' }
  if (body.includes(0x00)) return { ok: false, code: 'UNREADABLE' }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    return { ok: false, code: 'UNREADABLE', hint: 'SAVE_AS_CSV_UTF8' }
  }
  return { ok: true, format: 'csv' }
}
