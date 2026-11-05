import { validateSubscriptionForm, toSubscriptionInput, translateSubscriptionErrors } from './subscriptions'

const valid = { name: '動画', amount: '1000', memo: '' }
describe('サブスク入力検証', () => {
  it.each(['', ' ', '　\t', 'あ'.repeat(101)])('不正な名前を拒否する: %s', (name) => {
    expect(validateSubscriptionForm({ ...valid, name })).toHaveProperty('name')
  })
  it.each(['', '0', '-1', '1.5', '1e3', '１００', '2147483648', 'NaN'])('不正な金額を拒否する: %s', (amount) => {
    expect(validateSubscriptionForm({ ...valid, amount })).toHaveProperty('amount')
  })
  it('名前・金額・メモの境界を受理し、超過を拒否する', () => {
    expect(validateSubscriptionForm({ name: 'あ', amount: '1', memo: '' })).toEqual({})
    expect(validateSubscriptionForm({ name: 'あ'.repeat(100), amount: '2147483647', memo: 'め'.repeat(500) })).toEqual({})
    expect(validateSubscriptionForm({ ...valid, memo: 'め'.repeat(501) })).toHaveProperty('memo')
  })
  it('入力を勝手に切り詰めず金額だけ数値に変換する', () => {
    expect(toSubscriptionInput({ ...valid, name: ' 動画 ' })).toEqual({ name: ' 動画 ', amount: 1000, memo: '' })
  })
  it('APIの項目を日本語へ対応付け、生の本文や未知の項目を表示しない', () => {
    expect(translateSubscriptionErrors({ ' Name ': ['秘密'], AMOUNT: ['秘密'], memo: ['秘密'] })).toEqual({
      name: '名前は1〜100文字で入力してください。', amount: '金額は1円以上2,147,483,647円以下の整数で入力してください。', memo: 'メモは500文字以内で入力してください。',
    })
    expect(translateSubscriptionErrors({ unknown: ['秘密'] })).toEqual({})
  })
})
