// 畫面文案對照（design/ia.md 第 5 節）。原因代碼 → 使用者看得懂的句子；全站共用同一份，名單、通知、總覽、匯入預覽才會用詞一致。
import { COLUMN_TITLES, type FieldKey, type IdWarning, type PlateReason, type RowConflictKind } from '../data/types'

export const KIND_LABEL: Record<RowConflictKind, string> = {
  IDENTICAL_ROW: '整列相同',
  SAME_HEAD: '同車頭車號',
  SAME_TAIL: '同車斗車號',
  SAME_ID_DIFF_NAME: '同駕駛身分證不同姓名',
}

const PLATE_REASON: Record<Exclude<PlateReason, 'REQUIRED'>, string> = {
  PLATE_INNER_WHITESPACE: '中間不可有空白',
  PLATE_FULLWIDTH: '含全形字元，請改用半形',
  PLATE_LOWERCASE: '含小寫英文，請改用大寫（不會自動轉換）',
  PLATE_INVALID_CHAR: '含不允許的符號',
  PLATE_NO_HYPHEN: '缺少連字號',
  PLATE_MULTI_HYPHEN: '連字號只能有一個',
  PLATE_EMPTY_PART: '連字號前後都要有字元',
}

export const ID_WARNING_TEXT: Record<IdWarning, string> = {
  ID_CHECKSUM: '檢查碼不符',
  ID_LENGTH: '長度不是 10 碼',
  ID_LOWERCASE: '開頭英文字母為小寫',
  ID_FIRST_NOT_ALPHA: '第一碼不是英文字母',
  ID_NON_DIGIT: '後 9 碼含非數字',
  ID_LEGACY_RESIDENCE: '舊式居留證格式',
}

export const PLATE_RULE = '只接受大寫英文或數字、以單一連字號相連'

/** 擋下（資料沒存）的欄位訊息。車牌：首句固定說明規則，再補具體原因。 */
export function fieldErrorText(field: FieldKey, code: PlateReason | 'REQUIRED'): string {
  const title = COLUMN_TITLES[field]
  if (code === 'REQUIRED') return `「${title}」為必填`
  return `${title} 格式不合：${PLATE_RULE}。${PLATE_REASON[code]}。`
}
