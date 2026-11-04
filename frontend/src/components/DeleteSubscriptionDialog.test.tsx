import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import DeleteSubscriptionDialog from './DeleteSubscriptionDialog'
import type { ApiSubscription } from '../api/client'

const subscription: ApiSubscription = {
  id: 3,
  name: '動画',
  amount: 1200,
  memo: '昼食',
}

function renderDialog({
  busy = false,
  error = null as string | null,
  onCancel = vi.fn(),
  onConfirm = vi.fn(),
} = {}) {
  function Harness() {
    const [target, setTarget] = useState<ApiSubscription | null>(null)
    return (
      <>
        <button type="button" onClick={() => setTarget(subscription)}>
          削除を開く
        </button>
        <DeleteSubscriptionDialog
          subscription={target}
          error={error}
          busy={busy}
          onCancel={() => {
            onCancel()
            setTarget(null)
          }}
          onConfirm={onConfirm}
        />
      </>
    )
  }
  render(<Harness />)
  return { onCancel, onConfirm }
}

function openDialog() {
  const trigger = screen.getByRole('button', { name: '削除を開く' })
  trigger.focus()
  fireEvent.click(trigger)
  return trigger
}

describe('DeleteSubscriptionDialog', () => {
  it('対象の名前と金額を表示する（T14）', () => {
    renderDialog()
    openDialog()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('open')
    expect(screen.getByRole('heading', { name: 'このサブスクを削除しますか？' })).toBeInTheDocument()
    expect(screen.getByText('動画 1,200円')).toBeInTheDocument()
    expect(screen.getByText('昼食')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '削除する' })).toBeInTheDocument()
  })

  it('キャンセルでは削除せず元のボタンへフォーカスを戻す（T14）', () => {
    const { onCancel, onConfirm } = renderDialog()
    const trigger = openDialog()

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('Escでは削除しない（T14）', () => {
    const { onCancel, onConfirm } = renderDialog()
    openDialog()

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('削除を一回だけ確定する（T14）', () => {
    const { onConfirm } = renderDialog()
    openDialog()

    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('削除中は操作を無効にする（T16）', () => {
    renderDialog({ busy: true })
    openDialog()

    expect(screen.getByRole('button', { name: '削除中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled()
  })

  it('エラーをダイアログ内に表示する（T17）', () => {
    renderDialog({ error: '削除に失敗しました。' })
    openDialog()

    expect(screen.getByRole('alert')).toHaveTextContent('削除に失敗しました。')
    expect(screen.getByRole('dialog')).toHaveAttribute('open')
  })
})
