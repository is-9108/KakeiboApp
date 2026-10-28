/**
 * 収支のプリセット・入力型・登録／編集で共用する送信前検証。
 */

export const ENTRY_TYPES = ['収入', '支出'] as const
export type EntryType = (typeof ENTRY_TYPES)[number]

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

export const INCOME_CATEGORIES = ['給与', '副収入', 'その他'] as const

/** 金額のAPI上限（int の最大値）。 */
export const MAX_AMOUNT = 2147483647

/** フォームが保持する入力値。金額は文字列のまま保持する。 */
export interface EntryFormValues {
  date: string
  type: string
  amount: string
  category: string
  memo: string
}

/** 送信する収支の値。金額は数値化済み。 */
export interface EntryInput {
  date: string
  type: string
  amount: number
  category: string
  memo: string
}

export type EntryField = 'date' | 'type' | 'amount' | 'category'
export type EntryFieldErrors = Partial<Record<EntryField, string>>

/** 種別に対応するカテゴリのプリセット。未選択・不正な種別では空。 */
export function categoriesForType(type: string): readonly string[] {
  if (type === '支出') return EXPENSE_CATEGORIES
  if (type === '収入') return INCOME_CATEGORIES
  return []
}

function parseDateParts(date: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

/** 実在する `YYYY-MM-DD`（年は0001〜9999）か。 */
export function isValidEntryDate(date: string): boolean {
  const parts = parseDateParts(date)
  if (!parts) return false
  if (parts.year < 1 || parts.year > 9999) return false
  const candidate = new Date(0)
  candidate.setUTCFullYear(parts.year, parts.month - 1, parts.day)
  return (
    candidate.getUTCFullYear() === parts.year &&
    candidate.getUTCMonth() === parts.month - 1 &&
    candidate.getUTCDate() === parts.day
  )
}

const AMOUNT_PATTERN = /^\d+$/

/**
 * 送信前の一括検証。登録・編集で同じ関数を使う。
 * 金額は半角数字のみを許可し、小数の切捨てや指数変換は行わない。
 */
export function validateEntryForm(values: EntryFormValues): EntryFieldErrors {
  const errors: EntryFieldErrors = {}

  if (values.date === '') {
    errors.date = '日付を入力してください。'
  } else if (!isValidEntryDate(values.date)) {
    errors.date = '日付を正しく入力してください。'
  }

  if (values.type === '' || !ENTRY_TYPES.includes(values.type as EntryType)) {
    errors.type = '種別を選択してください。'
  }

  if (values.amount === '') {
    errors.amount = '金額を入力してください。'
  } else if (!AMOUNT_PATTERN.test(values.amount)) {
    errors.amount = '金額は1円以上の整数で入力してください。'
  } else {
    const amount = Number(values.amount)
    if (amount > MAX_AMOUNT) {
      errors.amount = '金額は2,147,483,647円以下で入力してください。'
    } else if (amount < 1) {
      errors.amount = '金額は1円以上の整数で入力してください。'
    }
  }

  if (
    values.category === '' ||
    !categoriesForType(values.type).includes(values.category)
  ) {
    errors.category = 'カテゴリを選択してください。'
  }

  return errors
}

/** 検証済みの入力値をAPIへ送る形へ変換する。 */
export function toEntryInput(values: EntryFormValues): EntryInput {
  return {
    date: values.date,
    type: values.type,
    amount: Number(values.amount),
    category: values.category,
    memo: values.memo,
  }
}

const API_FIELD_MESSAGES: Record<string, string> = {
  date: '日付を正しく入力してください。',
  type: '種別を選択してください。',
  amount: '金額は1円以上2,147,483,647円以下で入力してください。',
  category: 'カテゴリを選択してください。',
  memo: 'メモの入力内容を確認してください。',
  month: '対象の月を確認してください。',
}

/**
 * APIの400項目別エラーを、アプリ側で固定した日本語メッセージへ対応付ける。
 * キーはcamelCase・PascalCase・大文字・前後空白の揺れを吸収する。
 * 未知の項目・ProblemDetails本文・例外本文は表示しない。
 */
export function translateValidationErrors(errors: Record<string, string[]>): string[] {
  const messages = Object.keys(errors)
    .map((key) => {
      const trimmed = key.trim()
      if (trimmed === '') return undefined
      const camelCaseKey = trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
      return API_FIELD_MESSAGES[camelCaseKey] ?? API_FIELD_MESSAGES[trimmed.toLowerCase()]
    })
    .filter((message): message is string => message !== undefined)
  return messages.length > 0 ? Array.from(new Set(messages)) : ['入力内容を確認してください。']
}
