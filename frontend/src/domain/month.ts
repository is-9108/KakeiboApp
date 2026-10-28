/**
 * 月・日付の表示とJST基準の現在日時。
 * 日付値は `YYYY-MM-DD` の文字列のまま扱い、UTCへの日時変換による日付ずれを避ける。
 */

export const MIN_MONTH = '0001-01'
export const MAX_MONTH = '9999-12'

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/

/** JSTの現在月を `YYYY-MM` で返す。端末のローカルタイムゾーンに依存しない。 */
export function currentMonthJst(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + JST_OFFSET_MS)
  return `${String(jst.getUTCFullYear()).padStart(4, '0')}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}`
}

/** JSTの今日を `YYYY-MM-DD` で返す。 */
export function currentDateJst(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + JST_OFFSET_MS)
  return `${String(jst.getUTCFullYear()).padStart(4, '0')}-${String(jst.getUTCMonth() + 1).padStart(2, '0')}-${String(
    jst.getUTCDate(),
  ).padStart(2, '0')}`
}

/**
 * 新規フォームの日付初期値。
 * 表示月が現在月ならJSTの今日、それ以外は表示月の1日。
 */
export function initialEntryDate(month: string, now: Date = new Date()): string {
  return month === currentMonthJst(now) ? currentDateJst(now) : `${month}-01`
}

function parseMonth(month: string): { year: number; index: number } | null {
  const match = MONTH_PATTERN.exec(month)
  if (!match) return null
  const year = Number(match[1])
  const index = Number(match[2]) - 1
  if (year < 1 || year > 9999 || index < 0 || index > 11) return null
  return { year, index }
}

/** 月を指定数だけ加減算する。APIの対応年範囲（0001-01〜9999-12）を超えない。 */
export function shiftMonth(month: string, delta: number): string {
  const parsed = parseMonth(month)
  if (!parsed) return month
  const total = parsed.year * 12 + parsed.index + delta
  const year = Math.floor(total / 12)
  if (year < 1) return MIN_MONTH
  if (year > 9999) return MAX_MONTH
  const index = total - year * 12
  return `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}`
}

/** 加減算した月が対応年範囲内に収まるか。 */
export function canShiftMonth(month: string, delta: number): boolean {
  const shifted = shiftMonth(month, delta)
  return shifted !== month || delta === 0
}

/** 「2026年10月」形式の月見出し。 */
export function formatMonthLabel(month: string): string {
  const parsed = parseMonth(month)
  if (!parsed) return month
  return `${parsed.year}年${parsed.index + 1}月`
}

/** 「2026年10月28日」形式の日付表示。日時への変換は行わない。 */
export function formatDateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return date
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`
}

/** 「1,700円」形式の金額表示。負号はそのまま残す。 */
export function formatYen(amount: number): string {
  return `${new Intl.NumberFormat('ja-JP').format(amount)}円`
}

/** 「70.6%」形式の構成比表示。API値を再計算しない。 */
export function formatPercent(percentage: number): string {
  return `${new Intl.NumberFormat('ja-JP', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(percentage)}%`
}
