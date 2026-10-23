/**
 * 種別・カテゴリのプリセットと収支フォームの入力検証。
 * プリセットは docs/requirements.md 4.3（api/Models/Presets.cs と同じ値）に従い、
 * ユーザーによる追加・編集・削除はしない。
 */

export const TYPES = ['収入', '支出'] as const
export type EntryType = (typeof TYPES)[number]

/** 支出用カテゴリプリセット。 */
export const EXPENSE_CATEGORIES = [
  '外食費',
  '食費',
  '日用品',
  '交通費',
  '住居費',
  '光熱費',
  '通信費',
  '趣味・娯楽',
  '医療・健康',
  'その他',
] as const

/** 収入用カテゴリプリセット。 */
export const INCOME_CATEGORIES = ['給与', '副収入', 'その他'] as const

/** 種別に対応するカテゴリプリセットを返す。 */
export function categoriesFor(type: string): readonly string[] {
  return type === '収入' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
}

/** 種別に対応するカテゴリかどうか。 */
export function isKnownCategory(type: string, category: string): boolean {
  return (categoriesFor(type) as readonly string[]).includes(category)
}

/**
 * フォームの項目別検証エラー。キーはフォーム項目、値は日本語メッセージ。
 */
export type EntryFieldErrors = Partial<Record<'date' | 'type' | 'amount' | 'category', readonly string[]>>

/** フォーム送信時にバックエンドへ渡す収支の入力。 */
export interface EntryInput {
  date: string
  type: string
  amount: number
  category: string
  memo: string
}

/** フォーム画面の入力値（金額は文字列のまま扱う）。 */
export interface EntryFormValues {
  date: string
  type: string
  amount: string
  category: string
}

/** APIが扱える金額の上限（32bit整数の最大値、api/Models/Entry.csのAmount=int）。 */
export const MAX_AMOUNT = 2147483647

/**
 * YYYY-MM-DD形式を厳密に検証する。うるう年を含む実在日のみtrue。
 * UTCの内部値だけで計算するため、実行環境のタイムゾーンに依存しない。
 */
export function isValidDateString(value: string): boolean {
  const parsed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (parsed === null) {
    return false
  }

  const year = Number(parsed[1])
  const month = Number(parsed[2])
  const day = Number(parsed[3])
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysInMonth[month - 1]!
}

/**
 * 登録・編集フォームの入力を検証する。エラーがあれば項目ごとの日本語メッセージを返す。
 * 実装に依存しない純関数として、境界値をテストから直接検証できる。
 */
export function validateEntry(values: EntryFormValues): EntryFieldErrors {
  const errors: EntryFieldErrors = {}

  if (values.date === '') {
    errors.date = ['日付は必須です。']
  } else if (!isValidDateString(values.date)) {
    errors.date = ['正しい日付を入力してください。']
  }

  if (values.type === '') {
    errors.type = ['種別を選択してください。']
  }

  const trimmedAmount = values.amount.trim()
  if (trimmedAmount === '') {
    errors.amount = ['金額を入力してください。']
  } else if (!/^\d+$/.test(trimmedAmount)) {
    // マイナス・小数・非数値はいずれも1以上の整数ではない
    errors.amount = ['金額は1以上の整数（円）で入力してください。']
  } else if (Number(trimmedAmount) === 0) {
    errors.amount = ['金額は1円以上で入力してください。']
  } else if (Number(trimmedAmount) > MAX_AMOUNT) {
    errors.amount = [`2,147,483,647円を超える金額は登録できません。`]
  }

  // 種別が正しい場合のみ、カテゴリとの対応を検証する（種別が空のときは種別エラーだけを出す）
  if (values.type !== '' && isKnownType(values.type)) {
    if (values.category === '') {
      errors.category = ['カテゴリを選択してください。']
    } else if (!isKnownCategory(values.type, values.category)) {
      errors.category = ['カテゴリは種別に対応するプリセットから選択してください。']
    }
  }

  return errors
}

/** 種別がプリセットの値かどうか。 */
function isKnownType(type: string): type is EntryType {
  return (TYPES as readonly string[]).includes(type)
}

/** フォーム値からAPIリクエストの入力を作る。検証済みであること。 */
export function toEntryInput(values: EntryFormValues, memo: string): EntryInput {
  return {
    date: values.date,
    type: values.type,
    amount: Number(values.amount.trim()),
    category: values.category,
    memo: memo.trim(),
  }
}
