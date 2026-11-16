import { receiptAnalysisToFormValues, validateReceiptFile } from './receipts'

describe('レシート画像の検証', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('対応形式 %s を受け付ける', type => {
    expect(validateReceiptFile({ type, size: 1 })).toBeNull()
    expect(validateReceiptFile({ type, size: 10 * 1024 * 1024 })).toBeNull()
  })
  it.each(['image/gif', 'image/heic', '', 'IMAGE/JPEG'])('未対応形式 %s を拒否する', type => {
    expect(validateReceiptFile({ type, size: 1 })).toBeTruthy()
  })
  it.each([0, -1, 10 * 1024 * 1024 + 1])('サイズ %s を拒否する', size => {
    expect(validateReceiptFile({ type: 'image/jpeg', size })).toBeTruthy()
  })
})

const analysis = { date: '2026-10-20', amount: 1200, storeName: 'お店', category: '食費' }
it('解析結果を支出の新規フォームへ変換する', () => {
  expect(receiptAnalysisToFormValues(analysis)).toEqual({ date: '2026-10-20', amount: '1200', memo: 'お店', category: '食費', type: '支出' })
})
it.each(['date', 'amount', 'storeName', 'category'] as const)('%sの未読取項目だけ空欄にする', field => {
  const key = field === 'storeName' ? 'memo' : field
  expect(receiptAnalysisToFormValues({ ...analysis, [field]: null })).toEqual({ ...receiptAnalysisToFormValues(analysis), [key]: '' })
})
it('全項目が未読取でも既定値を入れない', () => {
  expect(receiptAnalysisToFormValues({ date: null, amount: null, storeName: null, category: null })).toEqual({ date: '', amount: '', memo: '', category: '', type: '支出' })
})
it.each(['給与', '不明'])('支出プリセット外のカテゴリ%sは空欄にする', category => {
  expect(receiptAnalysisToFormValues({ ...analysis, category }).category).toBe('')
})
