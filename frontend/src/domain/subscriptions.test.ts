import { MAX_AMOUNT } from './entries'
import {
  MAX_SUBSCRIPTION_NAME_LENGTH, MAX_SUBSCRIPTION_MEMO_LENGTH,
  validateSubscriptionForm, toSubscriptionInput, translateSubscriptionValidationErrors,
} from './subscriptions'

const valid = { name: '動画', amount: '1000', memo: '' }

describe('サブスクの入力検証（F3〜F6）', () => {
  it.each(['', '   ', '名'.repeat(101), '😀'.repeat(51)])('不正な名前を拒否する: %s', (name) => {
    expect(validateSubscriptionForm({ ...valid, name }).name).toBeDefined()
  })
  it.each(['名', '名'.repeat(100), ' 動画 '])('有効な名前を受け入れる: %s', (name) => {
    expect(validateSubscriptionForm({ ...valid, name })).toEqual({})
  })
  it.each(['', '1.5', '-1', '１００', '0', String(MAX_AMOUNT + 1)])('不正な金額を拒否する: %s', (amount) => {
    expect(validateSubscriptionForm({ ...valid, amount }).amount).toBeDefined()
  })
  it.each(['1', String(MAX_AMOUNT)])('境界の金額を受け入れる: %s', (amount) => {
    expect(validateSubscriptionForm({ ...valid, amount })).toEqual({})
  })
  it('名前とメモの上限および変換時の値を守る', () => {
    expect(MAX_SUBSCRIPTION_NAME_LENGTH).toBe(100)
    expect(MAX_SUBSCRIPTION_MEMO_LENGTH).toBe(500)
    expect(validateSubscriptionForm({ ...valid, memo: 'メ'.repeat(500) })).toEqual({})
    expect(validateSubscriptionForm({ ...valid, memo: 'メ'.repeat(501) }).memo).toBe('メモは500文字以内で入力してください。')
    expect(toSubscriptionInput({ name: ' 動画 ', amount: '0001', memo: ' メモ ' })).toEqual({ name: ' 動画 ', amount: 1, memo: ' メモ ' })
  })
  it('空と長すぎる名前および金額を日本語で案内する', () => {
    expect(validateSubscriptionForm({ ...valid, name: '' }).name).toBe('名前を入力してください。')
    expect(validateSubscriptionForm({ ...valid, name: '名'.repeat(101) }).name).toBe('名前は100文字以内で入力してください。')
    expect(validateSubscriptionForm({ ...valid, amount: '' }).amount).toBe('金額を入力してください。')
    expect(validateSubscriptionForm({ ...valid, amount: '1.5' }).amount).toBe('金額は1円以上の整数で入力してください。')
    expect(validateSubscriptionForm({ ...valid, amount: String(MAX_AMOUNT + 1) }).amount).toBe('金額は2,147,483,647円以下で入力してください。')
  })
  it('APIのキーの揺れを吸収して固定メッセージに変換する', () => {
    expect(translateSubscriptionValidationErrors({ name: ['秘密'], Name: ['秘密'], ' AMOUNT ': ['秘密'], memo: ['秘密'] })).toEqual([
      '名前は1〜100文字で入力してください。', '金額は1円以上2,147,483,647円以下で入力してください。', 'メモは500文字以内で入力してください。',
    ])
    expect(translateSubscriptionValidationErrors({ unknown: ['秘密'] })).toEqual(['入力内容を確認してください。'])
    expect(translateSubscriptionValidationErrors({})).toEqual(['入力内容を確認してください。'])
  })
})
