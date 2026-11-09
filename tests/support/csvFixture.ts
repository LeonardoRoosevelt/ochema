/**
 * 測試端的 CSV 工具（獨立於 src/data/csv.ts）。
 * 用途：造 CSV fixture、讀回匯出的 CSV 驗證。刻意不重用 src 的 parseCsv／serializeCsv，
 * 否則「匯出的 CSV 對不對」會拿被測物自己當尺。契約允許 tests/support 直接用 TextEncoder 與手寫位元組。
 */

export const BOM = [0xef, 0xbb, 0xbf] as const

export function csvSerialize(rows: readonly (readonly string[])[]): string {
  const cell = (v: string) => (/[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v)
  return rows.map((r) => r.map(cell).join(',') + '\r\n').join('')
}

/** 最小 RFC 4180 解析：引號欄、"" 跳脫、\r\n／\n 記錄分隔；檔尾換行不產生空記錄。 */
export function csvParse(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  let pending = false
  for (; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === '') {
      quoted = true
      pending = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
      pending = true
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      pending = false
    } else {
      field += ch
      pending = true
    }
  }
  if (pending || field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function utf8(text: string, withBom = false): Uint8Array {
  const body = new TextEncoder().encode(text)
  if (!withBom) return body
  const out = new Uint8Array(body.length + 3)
  out.set(BOM, 0)
  out.set(body, 3)
  return out
}

export function startsWithBom(bytes: Uint8Array): boolean {
  return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
}

export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return true
  } catch {
    return false
  }
}

let big5Map: Map<string, [number, number]> | undefined
/** 以 ICU 的 big5 解碼器反查出 Big5 雙位元組碼（只在需要編碼中文字時才建表）。 */
function big5Table(): Map<string, [number, number]> {
  if (big5Map) return big5Map
  const dec = new TextDecoder('big5')
  const map = new Map<string, [number, number]>()
  for (let hi = 0xa1; hi <= 0xf9; hi++) {
    for (let lo = 0x40; lo <= 0xfe; lo++) {
      if (lo > 0x7e && lo < 0xa1) continue
      const ch = dec.decode(new Uint8Array([hi, lo]))
      if (ch.length === 1 && ch !== '�' && !map.has(ch)) map.set(ch, [hi, lo])
    }
  }
  big5Map = map
  return map
}

/** Big5 編碼（ASCII 直通，中文字查表）。找不到對應碼就丟錯，不默默換成問號。 */
export function encodeBig5(text: string): Uint8Array {
  const table = big5Table()
  const out: number[] = []
  for (const ch of text) {
    if (ch.charCodeAt(0) < 0x80) out.push(ch.charCodeAt(0))
    else {
      const code = table.get(ch)
      if (!code) throw new Error(`Big5 fixture：無法編碼 "${ch}"`)
      out.push(code[0], code[1])
    }
  }
  return Uint8Array.from(out)
}
