import { fireEvent, render, screen } from '@testing-library/react'
import SubscriptionForm from './SubscriptionForm'
import { blankSubscription } from '../domain/subscriptions'

const props = () => ({ mode: 'create' as 'create' | 'edit', values: blankSubscription(), submitting: false, error: null as string | null, fieldErrors: {}, onChange: vi.fn(), onSubmit: vi.fn(), onCancel: vi.fn() })
it('不正な入力は送信せず最初の項目にフォーカスする', () => {
  const p = props()
  render(<SubscriptionForm {...p} />)
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  expect(p.onSubmit).not.toHaveBeenCalled()
  expect(screen.getByLabelText('名前')).toHaveFocus()
  expect(screen.getAllByRole('alert')).toHaveLength(2)
})
it('正常な入力を数値化して送信する', () => {
  const p = props(); p.values = { name: '動画', amount: '1000', memo: 'メモ' }
  render(<SubscriptionForm {...p} />)
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  expect(p.onSubmit).toHaveBeenCalledWith({ name: '動画', amount: 1000, memo: 'メモ' })
})
it('入力の変更を通知し編集をキャンセルできる', () => {
  const p = props(); p.mode = 'edit'
  render(<SubscriptionForm {...p} />)
  fireEvent.change(screen.getByLabelText('名前'), { target: { value: '変更' } })
  expect(p.onChange).toHaveBeenCalledWith({ name: '変更', amount: '', memo: '' })
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  expect(p.onCancel).toHaveBeenCalledTimes(1)
})
it('編集開始時に見出しへフォーカスする', () => {
  const p = props(); p.mode = 'edit'
  const scroll = vi.fn()
  HTMLElement.prototype.scrollIntoView = scroll
  render(<SubscriptionForm {...p} editKey={1} />)
  expect(screen.getByRole('heading', { name: 'サブスクの編集' })).toHaveFocus()
  expect(scroll).toHaveBeenCalled()
})
it('送信中は操作を無効化しAPIの項目エラーを表示する', () => {
  const p = props(); p.mode = 'edit'; p.submitting = true
  render(<SubscriptionForm {...p} fieldErrors={{ name: '名前エラー' }} />)
  expect(screen.getByText('名前エラー')).toHaveAttribute('role', 'alert')
  expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled()
})
