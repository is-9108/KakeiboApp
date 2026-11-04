import { MAX_AMOUNT } from './entries'

export const MAX_SUBSCRIPTION_NAME_LENGTH = 100
export const MAX_SUBSCRIPTION_MEMO_LENGTH = 500

export interface SubscriptionFormValues {
  name: string
  amount: string
  memo: string
}

export interface SubscriptionInput {
  name: string
  amount: number
  memo: string
}

export type SubscriptionField = 'name' | 'amount' | 'memo'
export type SubscriptionFieldErrors = Partial<Record<SubscriptionField, string>>

/** 登録と編集で共用する送信前検証。文字数はUTF-16単位で数える。 */
export function validateSubscriptionForm(values: SubscriptionFormValues): SubscriptionFieldErrors {
  const errors: SubscriptionFieldErrors = {}
  if (values.name.trim() === '') {
    errors.name = '名前を入力してください。'
  } else if (values.name.length > MAX_SUBSCRIPTION_NAME_LENGTH) {
    errors.name = '名前は100文字以内で入力してください。'
  }
  if (values.amount === '') {
    errors.amount = '金額を入力してください。'
  } else if (!/^\d+$/.test(values.amount)) {
    errors.amount = '金額は1円以上の整数で入力してください。'
  } else if (Number(values.amount) > MAX_AMOUNT) {
    errors.amount = '金額は2,147,483,647円以下で入力してください。'
  } else if (Number(values.amount) < 1) {
    errors.amount = '金額は1円以上の整数で入力してください。'
  }
  if (values.memo.length > MAX_SUBSCRIPTION_MEMO_LENGTH) {
    errors.memo = 'メモは500文字以内で入力してください。'
  }
  return errors
}

export function toSubscriptionInput(values: SubscriptionFormValues): SubscriptionInput {
  return { ...values, amount: Number(values.amount) }
}

const API_FIELD_MESSAGES: Record<string, string> = {
  name: '名前は1〜100文字で入力してください。',
  amount: '金額は1円以上2,147,483,647円以下で入力してください。',
  memo: 'メモは500文字以内で入力してください。',
}

/** API本文は表示せず、項目に対応する固定の日本語を返す。 */
export function translateSubscriptionValidationErrors(errors: Record<string, string[]>): string[] {
  const messages = Object.keys(errors)
    .map((key) => API_FIELD_MESSAGES[key.trim().toLowerCase()])
    .filter((message): message is string => message !== undefined)
  return messages.length > 0 ? Array.from(new Set(messages)) : ['入力内容を確認してください。']
}
