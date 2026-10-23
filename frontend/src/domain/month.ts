/** JST（UTC+9）のオフセット（ミリ秒）。要件3によりタイムゾーンはJST固定。 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 月をYYYY-MM形式にする。 */
function formatYearMonth(year: number, month1to12: number): string {
  return `${String(year).padStart(4, '0')}-${String(month1to12).padStart(2, '0')}`
}

/**
 * 現在時刻が属するJSTの月をYYYY-MMで返す。
 * 実行環境のタイムゾーンに依存しないよう、UTCの内部値だけで計算する。
 */
export function currentMonth(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + JST_OFFSET_MS)
  return formatYearMonth(jst.getUTCFullYear(), jst.getUTCMonth() + 1)
}

/**
 * YYYY-MM形式の年月をdeltaか月ずらす。日の概念を持たないため月末補正は発生しない。
 * 形式が不正な場合はErrorを投げる。
 */
export function addMonths(month: string, delta: number): string {
  const parsed = /^(\d{4})-(\d{2})$/.exec(month)
  if (parsed === null || Number(parsed[2]) < 1 || Number(parsed[2]) > 12) {
    throw new Error(`月の形式が正しくありません: ${month}`)
  }

  const totalMonths = Number(parsed[1]) * 12 + (Number(parsed[2]) - 1) + delta
  const year = Math.floor(totalMonths / 12)
  const month1to12 = totalMonths - year * 12 + 1
  return formatYearMonth(year, month1to12)
}

/** YYYY-MMを「YYYY年M月」の日本語表記にする。 */
export function formatMonth(month: string): string {
  const parsed = /^(\d{4})-(\d{2})$/.exec(month)
  if (parsed === null || Number(parsed[2]) < 1 || Number(parsed[2]) > 12) {
    throw new Error(`月の形式が正しくありません: ${month}`)
  }
  return `${parsed[1]}年${Number(parsed[2])}月`
}
