import { useEffect, useRef, type SyntheticEvent } from 'react'
import type { ApiSubscription } from '../api/client'
import { formatYen } from '../domain/month'

export interface DeleteSubscriptionDialogProps {
  subscription: ApiSubscription | null
  error: string | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
  /** 通信断で結果不明のときに、GETのみで一覧を再読み込みする。 */
  onReload?: () => void
}

/** 削除確認ダイアログ。キャンセル・EscではDELETEしない。 */
export default function DeleteSubscriptionDialog({
  subscription,
  error,
  busy,
  onCancel,
  onConfirm,
  onReload,
}: DeleteSubscriptionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const confirmingRef = useRef(false)

  useEffect(() => {
    if (!busy) confirmingRef.current = false
  }, [busy])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (subscription !== null) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (typeof dialog.showModal === 'function') {
        dialog.showModal()
      } else {
        // jsdomなどshowModal未実装の環境ではopen属性で表示する。
        dialog.setAttribute('open', '')
      }
      cancelRef.current?.focus()
    } else {
      if (typeof dialog.close === 'function') {
        dialog.close()
      } else {
        dialog.removeAttribute('open')
      }
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [subscription])

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    if (busy) return
    onCancel()
  }

  const handleConfirm = () => {
    if (busy || confirmingRef.current) return
    confirmingRef.current = true
    onConfirm()
  }

  const summary =
    subscription !== null
      ? `${subscription.name} ${formatYen(subscription.amount)}`
      : ''

  return (
    <dialog className="delete-subscription-dialog" ref={dialogRef} aria-labelledby="delete-subscription-dialog-title" onCancel={handleCancel}>
      <h2 id="delete-subscription-dialog-title" className="delete-subscription-dialog__title">
        このサブスクを削除しますか？
      </h2>
      {subscription !== null && (
        <div className="delete-subscription-dialog__target">
          <p className="delete-subscription-dialog__summary">{summary}</p>
          {subscription.memo !== '' && <p className="delete-subscription-dialog__memo">{subscription.memo}</p>}
        </div>
      )}
      {error !== null && (
        <div className="delete-subscription-dialog__error" role="alert">
          <p>{error}</p>
          {onReload !== undefined && (
            <button type="button" onClick={onReload} disabled={busy}>
              一覧を再読み込み
            </button>
          )}
        </div>
      )}
      <div className="delete-subscription-dialog__actions">
        <button type="button" ref={cancelRef} onClick={onCancel} disabled={busy}>
          キャンセル
        </button>
        <button type="button" className="delete-subscription-dialog__confirm" onClick={handleConfirm} disabled={busy}>
          {busy ? '削除中…' : '削除する'}
        </button>
      </div>
    </dialog>
  )
}
