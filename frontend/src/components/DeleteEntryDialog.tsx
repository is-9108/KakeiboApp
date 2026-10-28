import { useEffect, useRef, type SyntheticEvent } from 'react'
import type { ApiEntry } from '../api/client'
import { formatDateLabel, formatYen } from '../domain/month'

export interface DeleteEntryDialogProps {
  entry: ApiEntry | null
  error: string | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
  /** 通信断で結果不明のときに、GETのみで一覧を再読み込みする。 */
  onReload?: () => void
}

/** 削除確認ダイアログ。キャンセル・EscではDELETEしない。 */
export default function DeleteEntryDialog({
  entry,
  error,
  busy,
  onCancel,
  onConfirm,
  onReload,
}: DeleteEntryDialogProps) {
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

    if (entry !== null) {
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
  }, [entry])

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
    entry !== null
      ? `${formatDateLabel(entry.date)} ${entry.type} ${formatYen(entry.amount)} ${entry.category}`
      : ''

  return (
    <dialog className="delete-dialog" ref={dialogRef} aria-labelledby="delete-dialog-title" onCancel={handleCancel}>
      <h2 id="delete-dialog-title" className="delete-dialog__title">
        この収支を削除しますか？
      </h2>
      {entry !== null && (
        <div className="delete-dialog__target">
          <p className="delete-dialog__summary">{summary}</p>
          {entry.memo !== '' && <p className="delete-dialog__memo">{entry.memo}</p>}
        </div>
      )}
      {error !== null && (
        <div className="delete-dialog__error" role="alert">
          <p>{error}</p>
          {onReload !== undefined && (
            <button type="button" onClick={onReload} disabled={busy}>
              一覧を再読み込み
            </button>
          )}
        </div>
      )}
      <div className="delete-dialog__actions">
        <button type="button" ref={cancelRef} onClick={onCancel} disabled={busy}>
          キャンセル
        </button>
        <button type="button" className="delete-dialog__confirm" onClick={handleConfirm} disabled={busy}>
          {busy ? '削除中…' : '削除する'}
        </button>
      </div>
    </dialog>
  )
}
