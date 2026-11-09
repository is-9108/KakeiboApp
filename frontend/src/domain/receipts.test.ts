import { validateReceiptFile } from './receipts'

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
