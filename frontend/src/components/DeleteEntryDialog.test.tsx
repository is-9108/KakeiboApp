import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import DeleteEntryDialog from './DeleteEntryDialog'
import type { ApiEntry } from '../api/client'

const entry: ApiEntry = {
  id: 3,
  date: '2026-10-05',
  type: '支出',
  amount: 1200,
  category: '外食費',
  memo: '昼食',
}

function renderDialog({
  busy = false,
  error = null as string | null,
  onCancel = vi.fn(),
  onConfirm = vi.fn(),
} = {}) {
  function Harness() {
    const [target, setTarget] = useState<ApiEntry | null>(null)
    return (
      <>
        <button type="button" onClick={() => setTarget(entry)}>
          削除を開く
        </button>
        <DeleteEntryDialog
          entry={target}
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

describe('DeleteEntryDialog', () => {
  it('shows a Japanese confirmation with the entry summary（T14）', () => {
    renderDialog()
    openDialog()

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('open')
    expect(screen.getByRole('heading', { name: 'この収支を削除しますか？' })).toBeInTheDocument()
    expect(screen.getByText('2026年10月5日 支出 1,200円 外食費')).toBeInTheDocument()
    expect(screen.getByText('昼食')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '削除する' })).toBeInTheDocument()
  })

  it('does not confirm on cancel and returns focus to the trigger（T14）', () => {
    const { onCancel, onConfirm } = renderDialog()
    const trigger = openDialog()

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('does not confirm on Escape（T14）', () => {
    const { onCancel, onConfirm } = renderDialog()
    openDialog()

    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('confirms deletion only once（T14）', () => {
    const { onConfirm } = renderDialog()
    openDialog()

    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('disables both actions while deleting（T16）', () => {
    renderDialog({ busy: true })
    openDialog()

    expect(screen.getByRole('button', { name: '削除中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled()
  })

  it('shows an error inside the dialog and keeps it open（T17）', () => {
    renderDialog({ error: '削除に失敗しました。' })
    openDialog()

    expect(screen.getByRole('alert')).toHaveTextContent('削除に失敗しました。')
    expect(screen.getByRole('dialog')).toHaveAttribute('open')
  })
})
