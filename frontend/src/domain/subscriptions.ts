import { MAX_AMOUNT } from './entries'

/** 月額サブスクの入力値。金額は検証まで文字列で保持する。 */
export interface SubscriptionFormValues { name: string; amount: string; memo: string }
export interface SubscriptionInput { name: string; amount: number; memo: string }
export type SubscriptionField = keyof SubscriptionFormValues
export type SubscriptionErrors = Partial<Record<SubscriptionField, string>>
export const blankSubscription = (): SubscriptionFormValues => ({ name: '', amount: '', memo: '' })
const messages: Record<SubscriptionField, string> = {
  name: '名前は1〜100文字で入力してください。',
  amount: '金額は1円以上2,147,483,647円以下の整数で入力してください。',
  memo: 'メモは500文字以内で入力してください。',
}
export function validateSubscriptionForm(values: SubscriptionFormValues): SubscriptionErrors {
  const errors: SubscriptionErrors = {}
  if (values.name.trim() === '' || values.name.length > 100) errors.name = messages.name
  if (!/^\d+$/.test(values.amount) || Number(values.amount) < 1 || Number(values.amount) > MAX_AMOUNT) errors.amount = messages.amount
  if (values.memo.length > 500) errors.memo = messages.memo
  return errors
}
export function toSubscriptionInput(values: SubscriptionFormValues): SubscriptionInput {
  return { ...values, amount: Number(values.amount) }
}
/** サーバーの本文を直接表示せず、既知の項目だけを表示用メッセージにする。 */
export function translateSubscriptionErrors(errors: Record<string, string[]>): SubscriptionErrors {
  const result: SubscriptionErrors = {}
  for (const key of Object.keys(errors)) {
    const field = key.trim().toLowerCase()
    if (field === 'name' || field === 'amount' || field === 'memo') result[field] = messages[field]
  }
  return result
}
