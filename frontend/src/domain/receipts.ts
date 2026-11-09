export const RECEIPT_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

export function validateReceiptFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!RECEIPT_CONTENT_TYPES.includes(file.type)) return 'JPEG、PNG、WebPの画像を選択してください。'
  if (file.size < 1 || file.size > MAX_RECEIPT_BYTES) return '画像は1バイト以上10 MiB以下にしてください。'
  return null
}
