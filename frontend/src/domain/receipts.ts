import type { ApiReceiptAnalysis } from '../api/client'
import { categoriesForType, type EntryFormValues } from './entries'

export const RECEIPT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

export function validateReceiptFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!RECEIPT_CONTENT_TYPES.includes(file.type)) return 'JPEG、PNG、WebPの画像を選択してください。'
  if (file.size < 1 || file.size > MAX_RECEIPT_BYTES) return '画像は1バイト以上10 MiB以下にしてください。'
  return null
}

export const RECEIPT_STATUSES = { pending: '待機中', completed: '完了', failed: '失敗' } as const
export const RECEIPT_POLL_INTERVAL_MS = 2000
export const RECEIPT_TIMEOUT_MS = 60000

/** 未読取項目には既定値を入れず、登録前の確認用に変換する。 */
export function receiptAnalysisToFormValues(
  analysis: Pick<ApiReceiptAnalysis, 'date' | 'amount' | 'storeName' | 'category'>,
): EntryFormValues {
  return {
    date: analysis.date ?? '',
    amount: analysis.amount === null ? '' : String(analysis.amount),
    memo: analysis.storeName ?? '',
    category: analysis.category !== null && categoriesForType('支出').includes(analysis.category) ? analysis.category : '',
    type: '支出',
  }
}
