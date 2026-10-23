import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import EntryForm from './EntryForm'

function renderNewForm(onSubmit: ReturnType<typeof vi.fn>, props: Parameters<typeof EntryForm>[0] = {}) {
  return render(<EntryForm onSubmit={onSubmit} {...props} />)
}

describe('EntryForm (T8〜T12・T19・T24・T28)', () => {
  /** 全項目を有効な支出として入力する */
  function fillForm(overrides: Partial<Record<'日付' | '種別' | '金額' | 'カテゴリ', string>> = {}) {
    const defaults = {
      日付: '2026-10-20',
      種別: '支出',
      金額: '500',
      カテゴリ: '食費',
    }
    const values = { ...defaults, ...overrides }
    for (const field of ['日付', '種別', '金額', 'カテゴリ'] as const) {
      if (field in overrides || values[field] !== '') {
        fireEvent.change(screen.getByLabelText(field), { target: { value: values[field] } })
      }
    }
    return values
  }

  it('単体テストデータと一致する全項目は検証を通過する (T11)', () => {
    renderNewForm(vi.fn().mockResolvedValue(undefined))
  })

  it('種別・カテゴリ・日付・金額・メモは未入力から選択できる (T8)', () => {
    renderNewForm(vi.fn())
    expect(screen.getByLabelText('日付')).toHaveValue('')
    expect(screen.getByLabelText('種別')).toHaveValue('')
    expect(screen.getByLabelText('金額')).toHaveValue('')
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('')
    expect(screen.getByLabelText('メモ')).toHaveValue('')
  })

  it('全項目未入力のまま送信すると各項目にエラーを表示し、保存APIを呼ばない (T8)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderNewForm(onSubmit)
    fireEvent.click(screen.getByRole('button', { name: '登録' }))

    expect(await screen.findByText('日付は必須です。')).toBeInTheDocument()
    expect(screen.getByText('種別を選択してください。')).toBeInTheDocument()
    expect(screen.getByText('金額を入力してください。')).toBeInTheDocument()
    // 種別が未選択の間はカテゴリの選択肢自体が存在しないため、カテゴリ固有のエラーは出さない
    expect(screen.queryByText('カテゴリを選択してください。')).not.toBeInTheDocument()
    expect(screen.queryByText('正しい日付を入力してください。')).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it.each([
    ['日付', '日付は必須です。'],
    ['種別', '種別を選択してください。'],
    ['金額', '金額を入力してください。'],
    ['カテゴリ', 'カテゴリを選択してください。'],
  ])('他項目が有効で%sだけ未入力なら、そのエラーだけを表示する (T8)', async (field, message) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderNewForm(onSubmit)
    fillForm()
    fireEvent.change(screen.getByLabelText(field), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '登録' }))

    await waitFor(() => expect(screen.getByText(message)).toBeInTheDocument())
    const allErrors = [
      '日付は必須です。',
      '種別を選択してください。',
      '金額を入力してください。',
      'カテゴリを選択してください。',
    ].filter((m) => m !== message)
    for (const other of allErrors) {
      expect(screen.queryByText(other)).not.toBeInTheDocument()
    }
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it.each(['0', '-1', '1.5', 'abc'])('金額%sは送信せず日本語エラーを出す (T9)', async (amount) => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderNewForm(onSubmit)
    fillForm()
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: amount } })
    fireEvent.click(screen.getByRole('button', { name: '登録' }))

    await waitFor(() => {
      expect(screen.getByText(/金額は1以上の整数|金額は1円以上/)).toBeInTheDocument()
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('金額1と2147483647は送信し、2147483648は上限超過で送信しない (T10)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderNewForm(onSubmit)

    fillForm({ 金額: '1' })
    fireEvent.click(screen.getByRole('button', { name: '登録' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ amount: 1, date: '2026-10-20', category: '食費' })

    await waitFor(() => expect(screen.getByLabelText('金額')).toHaveValue(''))
    fillForm({ 金額: '2147483647' })
    fireEvent.click(screen.getByRole('button', { name: '登録' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(onSubmit.mock.calls[1][0]).toMatchObject({ amount: 2147483647 })

    await waitFor(() => expect(screen.getByLabelText('金額')).toHaveValue(''))
    fillForm({ 金額: '2147483648' })
    fireEvent.click(screen.getByRole('button', { name: '登録' }))
    await waitFor(() => {
      expect(screen.getByText('2,147,483,647円を超える金額は登録できません。')).toBeInTheDocument()
    })
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })

  it('有効な日付（うるう年の2/29）はそのまま送信する (T11)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderNewForm(onSubmit)
    fillForm({ 日付: '2028-02-29' })
    fireEvent.click(screen.getByRole('button', { name: '登録' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ date: '2028-02-29' })
  })

  it('種別を収入に変えると支出カテゴリが解除される (T12)', () => {
    renderNewForm(vi.fn())
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '支出' } })
    fireEvent.change(screen.getByLabelText('カテゴリ'), { target: { value: '食費' } })

    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '収入' } })
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('')
    const categoryOptions = Array.from(
      (screen.getByLabelText('カテゴリ') as HTMLSelectElement).options,
    ).map((o) => o.textContent)
    expect(categoryOptions).toEqual(['未選択', '給与', '副収入', 'その他'])
  })

  it('種別ごとのカテゴリ選択肢はプリセットのみ (T12)', () => {
    renderNewForm(vi.fn())
    const typeOptions = Array.from((screen.getByLabelText('種別') as HTMLSelectElement).options).map(
      (o) => o.textContent,
    )
    expect(typeOptions).toEqual(['未選択', '収入', '支出'])

    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '支出' } })
    const expenseOptions = Array.from(
      (screen.getByLabelText('カテゴリ') as HTMLSelectElement).options,
    ).map((o) => o.textContent)
    expect(expenseOptions).toEqual([
      '未選択',
      '外食費',
      '食費',
      '日用品',
      '交通費',
      '住居費',
      '光熱費',
      '通信費',
      '趣味・娯楽',
      '医療・健康',
      'その他',
    ])
  })

  it('登録成功後はフォームが空に戻る (T13)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderNewForm(onSubmit)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: '登録' }))

    await waitFor(() => {
      expect(screen.getByLabelText('金額')).toHaveValue('')
    })
    expect(screen.getByLabelText('日付')).toHaveValue('')
  })

  it('成功メモは入力値とメモの前後空白を除いて送信する (T13)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderNewForm(onSubmit)
    fillForm()
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: ' スーパー ' } })
    fireEvent.click(screen.getByRole('button', { name: '登録' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ memo: 'スーパー' })
  })

  it('送信中は連続送信させない (T24)', async () => {
    let resolve: (() => void) | undefined
    const onSubmit = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolve = r }))
    renderNewForm(onSubmit)
    fillForm()
    const button = screen.getByRole('button', { name: '登録' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    resolve?.()
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('失敗時は入力を保持し、400の項目別エラーを表示する (T19)', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      Object.assign(new Error('入力内容を確認してください。'), {
        name: 'ApiValidationError',
        fieldErrors: { amount: ['金額は1以上の整数を指定してください。'] },
      }),
    )
    renderNewForm(onSubmit)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: '登録' }))

    await waitFor(() => {
      expect(screen.getByText('金額は1以上の整数を指定してください。')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('金額')).toHaveValue('500')
    expect(screen.getAllByRole('alert').some((a) => a.textContent === '入力内容を確認してください。')).toBe(true)
  })

  it('500は日本語の全体エラーを表示する (T22)', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new Error('APIの呼び出しに失敗しました。しばらくしてから再試行してください。'),
    )
    renderNewForm(onSubmit)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: '登録' }))

    await waitFor(() => {
      expect(
        screen.getByText('APIの呼び出しに失敗しました。しばらくしてから再試行してください。'),
      ).toBeInTheDocument()
    })
    expect(screen.getByLabelText('金額')).toHaveValue('500')
  })

  it('編集モードは既存の値が入った状態で開く (T14)', () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <EntryForm
        onSubmit={onSubmit}
        initialEntry={{
          id: 5,
          date: '2026-10-15',
          type: '収入',
          amount: 250000,
          category: '給与',
          memo: '10月分の給与',
        }}
      />,
    )
    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-15')
    expect(screen.getByLabelText('種別')).toHaveValue('収入')
    expect(screen.getByLabelText('金額')).toHaveValue('250000')
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('給与')
    expect(screen.getByLabelText('メモ')).toHaveValue('10月分の給与')
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('編集キャンセルはAPIを呼ばず通知する (T14)', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(
      <EntryForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        initialEntry={{
          id: 5,
          date: '2026-10-15',
          type: '収入',
          amount: 250000,
          category: '給与',
          memo: '',
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('ラベルと入力欄が関連付いている (T28)', () => {
    renderNewForm(vi.fn())
    for (const label of ['日付', '種別', '金額', 'カテゴリ', 'メモ']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('メモは任意です。')).toBeInTheDocument()
  })
})
