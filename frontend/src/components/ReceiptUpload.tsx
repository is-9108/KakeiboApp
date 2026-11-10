import { useEffect, useRef, useState } from 'react'
import { AccessTokenRefreshError, requestReceiptUploadUrl, uploadReceiptToS3 } from '../api/client'
import { RECEIPT_CONTENT_TYPES, validateReceiptFile } from '../domain/receipts'

interface Props { onSessionExpired: () => void | Promise<void> }

export default function ReceiptUpload({ onSessionExpired }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const mounted = useRef(false)
  const sending = useRef(false)
  const [state, setState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function upload(file: File) {
    if (sending.current) return
    const validation = validateReceiptFile(file)
    if (validation) {
      setError(validation)
      setState('error')
      return
    }
    sending.current = true
    setState('uploading')
    try {
      const target = await requestReceiptUploadUrl(file)
      if (!mounted.current) return
      await uploadReceiptToS3(target, file)
      if (mounted.current) setState('success')
    } catch (cause) {
      if (!mounted.current) return
      setError('アップロードに失敗しました。通信状況を確認して再試行してください。')
      setState('error')
      if (cause instanceof AccessTokenRefreshError) await onSessionExpired()
    } finally {
      sending.current = false
    }
  }

  return (
    <section className="receipt-upload" aria-label="レシートのアップロード">
      <input ref={input} type="file" hidden aria-label="レシート画像"
        accept={RECEIPT_CONTENT_TYPES.join(',')} capture="environment" disabled={state === 'uploading'}
        onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void upload(file)
        }} />
      <button type="button" disabled={state === 'uploading'} onClick={() => input.current?.click()}>
        レシートから登録
      </button>
      {state === 'uploading' && <p role="status">アップロード中…</p>}
      {state === 'success' && <p role="status">レシート画像をアップロードしました。</p>}
      {state === 'error' && <p role="alert">{error}</p>}
    </section>
  )
}
