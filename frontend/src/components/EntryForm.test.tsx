import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import EntryForm from './EntryForm'
import type { EntryFormValues, EntryInput } from '../domain/entries'

const defaultValues: EntryFormValues = {
  date: '2026-10-28',
  type: '支出',
  amount: '',
  category: '',
  memo: '',
}

const scrollSpy = vi.fn()

beforeEach(() => {
  scrollSpy.mockClear()
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollSpy,
  })
})

function renderForm({
  initial = defaultValues,
  mode = 'create' as 'create' | 'edit',
  submitting = false,
  error = null as string | null,
  onSubmit = vi.fn<(input: EntryInput) => void>(),
  onCancel = vi.fn(),
  onReload = undefined as (() => void) | undefined,
} = {}) {
  function Harness() {
    const [values, setValues] = useState<EntryFormValues>(initial)
    const [currentMode, setCurrentMode] = useState<'create' | 'edit'>(mode)
    return (
      <>
        <button type="button" onClick={() => setCurrentMode('edit')}>
          編集モードへ
        </button>
        <EntryForm
          mode={currentMode}
          values={values}
          submitting={submitting}
          error={error}
          onChange={setValues}
          onSubmit={onSubmit}
          onCancel={onCancel}
          onReload={onReload}
        />
      </>
    )
  }
  render(<Harness />)
  return { onSubmit, onCancel }
}

const entryA: EntryFormValues = {
  date: '2026-10-20',
  type: '支出',
  amount: '1200',
  category: '外食費',
  memo: 'Aのメモ',
}

const entryB: EntryFormValues = {
  date: '2026-10-10',
  type: '収入',
  amount: '53000',
  category: '給与',
  memo: 'Bのメモ',
}

/** 編集対象の切替を再現する。editKeyはAppHomeと同じく編集開始のたびに増やす。 */
function renderEditSwitchHarness() {
  function Harness() {
    const [values, setValues] = useState<EntryFormValues>(entryA)
    const [editKey, setEditKey] = useState(1)
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setValues(entryB)
            setEditKey((key) => key + 1)
          }}
        >
          Bを編集
        </button>
        <button type="button" onClick={() => setEditKey((key) => key + 1)}>
          Aを再編集
        </button>
        <EntryForm
          mode="edit"
          editKey={editKey}
          values={values}
          submitting={false}
          error={null}
          onChange={setValues}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      </>
    )
  }
  render(<Harness />)
}

/** 有効な入力へ埋める（カテゴリは種別に合わせる）。 */
function fillValid(values: Partial<{ date: string; type: string; amount: string; category: string; memo: string }> = {}) {
  const merged = {
    date: '2026-10-28',
    type: '支出',
    amount: '1500',
    category: '外食費',
    memo: '',
    ...values,
  }
  fireEvent.change(screen.getByLabelText('日付'), { target: { value: merged.date } })
  fireEvent.change(screen.getByLabelText('種別'), { target: { value: merged.type } })
  fireEvent.change(screen.getByLabelText('金額'), { target: { value: merged.amount } })
  fireEvent.change(screen.getByLabelText('カテゴリ'), { target: { value: merged.category } })
  fireEvent.change(screen.getByLabelText('メモ'), { target: { value: merged.memo } })
}

describe('EntryForm', () => {
  it('shows the create heading and the new-entry defaults（T12）', () => {
    renderForm()

    expect(screen.getByRole('heading', { name: '収支の登録' })).toBeInTheDocument()
    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-28')
    expect(screen.getByLabelText('種別')).toHaveValue('支出')
    expect(screen.getByLabelText('金額')).toHaveValue('')
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('')
    expect(screen.getByLabelText('メモ')).toHaveValue('')
    expect(screen.getByRole('button', { name: '登録する' })).toBeInTheDocument()
  })

  it('disables browser validation and uses the app validation（T07）', () => {
    renderForm()

    expect(screen.getByRole('form', { name: '収支フォーム' })).toHaveAttribute('novalidate')
  })

  it('blocks empty required fields with Japanese errors and focuses the first one（T07）', () => {
    const { onSubmit } = renderForm()

    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))

    expect(screen.getByText('日付を入力してください。')).toBeInTheDocument()
    expect(screen.getByText('種別を選択してください。')).toBeInTheDocument()
    expect(screen.getByText('金額を入力してください。')).toBeInTheDocument()
    expect(screen.getByText('カテゴリを選択してください。')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('日付')).toHaveFocus()
  })

  it('marks invalid fields with aria-invalid and aria-describedby（T07）', () => {
    renderForm()

    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))

    const amount = screen.getByLabelText('金額')
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(amount).toHaveAttribute('aria-describedby', 'entry-amount-error')
    expect(screen.getByText('金額を入力してください。')).toHaveAttribute('id', 'entry-amount-error')
  })

  it.each([
    '0',
    '-1',
    '1.5',
    '1.0',
    '1e3',
    '1,000',
    'abc',
    '１０００',
  ])('does not submit the amount "%s"（T08）', (amount) => {
    const { onSubmit } = renderForm()

    fillValid({ amount, category: '外食費' })
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))

    expect(screen.getByText('金額は1円以上の整数で入力してください。')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects an amount above the API limit（T09）', () => {
    const { onSubmit } = renderForm()

    fillValid({ amount: '2147483648' })
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))

    expect(screen.getByText('金額は2,147,483,647円以下で入力してください。')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it.each([
    ['1', 1],
    ['2147483647', 2147483647],
    ['0001', 1],
  ])('submits the valid amount "%s" as %i（T09）', (amount, expected) => {
    const { onSubmit } = renderForm()

    fillValid({ amount })
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({
      date: '2026-10-28',
      type: '支出',
      amount: expected,
      category: '外食費',
      memo: '',
    })
  })

  it('clears the category when the type changes（T10）', () => {
    renderForm()

    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '支出' } })
    fireEvent.change(screen.getByLabelText('カテゴリ'), { target: { value: '外食費' } })
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('外食費')

    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '収入' } })

    expect(screen.getByLabelText('カテゴリ')).toHaveValue('')
    expect(screen.queryByRole('option', { name: '外食費' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: '給与' })).toBeInTheDocument()
  })

  it('accepts an empty memo（T10）', () => {
    const { onSubmit } = renderForm()

    fillValid({ memo: '' })
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ memo: '' }))
  })

  it('shows the edit heading with all existing values and focuses it（T12）', () => {
    renderForm({
      mode: 'edit',
      initial: {
        date: '2026-10-05',
        type: '収入',
        amount: '300000',
        category: '給与',
        memo: '10月分',
      },
    })

    expect(screen.getByRole('heading', { name: '収支の編集' })).toHaveFocus()
    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-05')
    expect(screen.getByLabelText('種別')).toHaveValue('収入')
    expect(screen.getByLabelText('金額')).toHaveValue('300000')
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('給与')
    expect(screen.getByLabelText('メモ')).toHaveValue('10月分')
  })

  it('focuses the heading when edit mode starts（T12）', () => {
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: '編集モードへ' }))

    expect(screen.getByRole('heading', { name: '収支の編集' })).toHaveFocus()
  })

  it('scrolls and focuses when the edit target switches from A to B（T12）', () => {
    renderEditSwitchHarness()

    expect(screen.getByRole('heading', { name: '収支の編集' })).toHaveFocus()
    expect(scrollSpy).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Bを編集' }))

    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-10')
    expect(screen.getByLabelText('種別')).toHaveValue('収入')
    expect(screen.getByLabelText('金額')).toHaveValue('53000')
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('給与')
    expect(screen.getByLabelText('メモ')).toHaveValue('Bのメモ')
    expect(screen.getByRole('heading', { name: '収支の編集' })).toHaveFocus()
    expect(scrollSpy).toHaveBeenCalledTimes(2)
  })

  it('scrolls and focuses again when the same entry is selected（T12）', () => {
    renderEditSwitchHarness()

    screen.getByLabelText('金額').focus()
    fireEvent.click(screen.getByRole('button', { name: 'Aを再編集' }))

    expect(screen.getByRole('heading', { name: '収支の編集' })).toHaveFocus()
    expect(scrollSpy).toHaveBeenCalledTimes(2)
  })

  it('does not re-scroll or steal focus on every input change（T12）', () => {
    renderEditSwitchHarness()

    const amount = screen.getByLabelText('金額')
    amount.focus()
    fireEvent.change(amount, { target: { value: '1300' } })

    expect(amount).toHaveValue('1300')
    expect(amount).toHaveFocus()
    expect(scrollSpy).toHaveBeenCalledTimes(1)
  })

  it('clears field errors when the edit target switches（T12）', () => {
    renderEditSwitchHarness()

    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存する' }))
    expect(screen.getByText('金額を入力してください。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Bを編集' }))

    expect(screen.queryByText('金額を入力してください。')).not.toBeInTheDocument()
  })

  it('cancel does not submit and keeps edit values（T12）', () => {
    const onCancel = vi.fn()
    const { onSubmit } = renderForm({ mode: 'edit', onCancel })

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-28')
  })

  it('submits the edited values with the save button（T13）', () => {
    const { onSubmit } = renderForm({
      mode: 'edit',
      initial: {
        date: '2026-10-05',
        type: '支出',
        amount: '1200',
        category: '外食費',
        memo: '昼食',
      },
    })

    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '1800' } })
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '収入' } })
    fireEvent.change(screen.getByLabelText('カテゴリ'), { target: { value: '副収入' } })
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '臨時収入' } })
    fireEvent.click(screen.getByRole('button', { name: '保存する' }))

    expect(onSubmit).toHaveBeenCalledWith({
      date: '2026-10-05',
      type: '収入',
      amount: 1800,
      category: '副収入',
      memo: '臨時収入',
    })
  })

  it('shows an API error without dropping the input（T17）', () => {
    renderForm({ mode: 'edit', error: '更新に失敗しました。' })

    expect(screen.getByRole('alert')).toHaveTextContent('更新に失敗しました。')
    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-28')
  })

  it('offers a GET-only reload action for a network failure（T17）', () => {
    const onReload = vi.fn()
    renderForm({
      mode: 'edit',
      error: '処理が完了している可能性があります。一覧を再読み込みして結果を確認してください。',
      onReload,
    })

    fireEvent.click(screen.getByRole('button', { name: '一覧を再読み込み' }))

    expect(onReload).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-28')
  })

  it('does not offer the reload action for a server error（T17）', () => {
    renderForm({ mode: 'edit', error: '保存に失敗しました。しばらくしてから再試行してください。' })

    expect(screen.queryByRole('button', { name: '一覧を再読み込み' })).not.toBeInTheDocument()
  })

  it('disables the submit button while submitting（T16）', () => {
    renderForm({ submitting: true })

    expect(screen.getByRole('button', { name: '登録中…' })).toBeDisabled()
  })
})
