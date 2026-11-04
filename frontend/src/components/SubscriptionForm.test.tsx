import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import SubscriptionForm from './SubscriptionForm'

function renderForm(mode: 'create' | 'edit' = 'create', submitting = false) {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  function Harness() {
    const [values, setValues] = useState({ name: '', amount: '', memo: '' })
    return <SubscriptionForm mode={mode} values={values} onChange={setValues} submitting={submitting} error={null} onSubmit={onSubmit} onCancel={onCancel} />
  }
  render(<Harness />)
  return { onSubmit, onCancel }
}

describe('サブスクフォーム（F9〜F10）', () => {
  it('空の送信では両項目のエラーを出して名前へフォーカスする', () => {
    const { onSubmit } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))
    expect(screen.getByText('名前を入力してください。')).toBeInTheDocument()
    expect(screen.getByText('金額を入力してください。')).toBeInTheDocument()
    expect(screen.getByLabelText('名前')).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })
  it('有効な値を数値に変換して送信する', () => {
    const { onSubmit } = renderForm()
    fireEvent.change(screen.getByLabelText('名前'), { target: { value: ' 動画 ' } })
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: 'メモ' } })
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({ name: ' 動画 ', amount: 1000, memo: 'メモ' })
  })
  it('編集モードの見出しと保存ボタンを表示してキャンセルできる', () => {
    const { onCancel } = renderForm('edit')
    expect(screen.getByRole('heading', { name: 'サブスクの編集' })).toHaveFocus()
    expect(screen.getByRole('button', { name: '保存する' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
  it('更新中はフォームの入力と操作を無効にする', () => {
    const { onSubmit, onCancel } = renderForm('edit', true)
    expect(screen.getByLabelText('名前')).toBeDisabled()
    expect(screen.getByLabelText('金額')).toBeDisabled()
    expect(screen.getByLabelText('メモ')).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled()
    fireEvent.submit(screen.getByRole('form', { name: 'サブスクフォーム' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })
})
