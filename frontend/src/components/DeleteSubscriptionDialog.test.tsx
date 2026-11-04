import { fireEvent, render, screen } from '@testing-library/react'
import DeleteSubscriptionDialog from './DeleteSubscriptionDialog'

const target = { id: 1, name: '動画サービス', amount: 1000, memo: '月額' }
const props = () => ({ subscription: target as typeof target | null, error: null, busy: false, onCancel: vi.fn(), onConfirm: vi.fn() })
it('対象を表示しキャンセルにフォーカスする', () => {
  const p = props()
  render(<DeleteSubscriptionDialog {...p} />)
  expect(screen.getByText(/動画サービス/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  expect(p.onCancel).toHaveBeenCalledTimes(1)
  expect(p.onConfirm).not.toHaveBeenCalled()
})
it('Escでキャンセルし、確定の連打でも要求は一度だけ', () => {
  const p = props()
  render(<DeleteSubscriptionDialog {...p} />)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  expect(p.onCancel).toHaveBeenCalledTimes(1)
  const button = screen.getByRole('button', { name: '削除する' })
  fireEvent.click(button); fireEvent.click(button)
  expect(p.onConfirm).toHaveBeenCalledTimes(1)
})
it('閉じた後は元の操作へフォーカスを戻す', () => {
  const p = props()
  const button = document.createElement('button'); document.body.append(button); button.focus()
  const { rerender } = render(<DeleteSubscriptionDialog {...p} />)
  rerender(<DeleteSubscriptionDialog {...p} subscription={null} />)
  expect(button).toHaveFocus()
  button.remove()
})
it('処理中はEscと確定操作を抑止する', () => {
  const p = props(); p.busy = true
  render(<DeleteSubscriptionDialog {...p} />)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  expect(p.onCancel).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '削除中…' })).toBeDisabled()
})
