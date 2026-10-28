import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AppHome from './AppHome'
import {
  AccessTokenRefreshError,
  ApiError,
  ApiValidationError,
  createEntry,
  deleteEntry,
  fetchEntries,
  fetchSummary,
  updateEntry,
  type ApiEntry,
  type ApiMonthlySummary,
} from '../api/client'

const { signOutMock, monthState } = vi.hoisted(() => ({
  signOutMock: vi.fn(),
  monthState: { month: '2026-10' },
}))

const scrollSpy = vi.fn()

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    state: { name: 'authenticated' },
    signIn: vi.fn(),
    completeNewPassword: vi.fn(),
    signOut: signOutMock,
  }),
}))

vi.mock('../domain/month', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/month')>()
  return {
    ...actual,
    currentMonthJst: () => monthState.month,
    initialEntryDate: (month: string) =>
      month === monthState.month ? `${month}-28` : `${month}-01`,
  }
})

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return {
    ...actual,
    fetchEntries: vi.fn(),
    fetchSummary: vi.fn(),
    createEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
  }
})

const octEntry: ApiEntry = {
  id: 1,
  date: '2026-10-20',
  type: '支出',
  amount: 1200,
  category: '外食費',
  memo: '昼食',
}

const incomeEntry: ApiEntry = {
  id: 2,
  date: '2026-10-10',
  type: '収入',
  amount: 53000,
  category: '給与',
  memo: '',
}

const octSummary: ApiMonthlySummary = {
  month: '2026-10',
  incomeTotal: 53000,
  expenseTotal: 1700,
  balance: 51300,
  expenseBreakdown: [
    { category: '外食費', amount: 1200, percentage: 70.6 },
    { category: '食費', amount: 500, percentage: 29.4 },
  ],
}

function emptySummary(month = '2026-10'): ApiMonthlySummary {
  return { month, incomeTotal: 0, expenseTotal: 0, balance: 0, expenseBreakdown: [] }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function mockMonth(entries: ApiEntry[] = [], summary: ApiMonthlySummary = emptySummary()) {
  vi.mocked(fetchEntries).mockResolvedValue(entries)
  vi.mocked(fetchSummary).mockResolvedValue(summary)
}

async function renderHome() {
  render(<AppHome />)
  await screen.findByRole('heading', { name: '月次集計' })
}

function fillForm({
  date = '2026-10-28',
  type = '支出',
  amount = '1500',
  category = '外食費',
  memo = '',
}: {
  date?: string
  type?: string
  amount?: string
  category?: string
  memo?: string
} = {}) {
  fireEvent.change(screen.getByLabelText('日付'), { target: { value: date } })
  fireEvent.change(screen.getByLabelText('種別'), { target: { value: type } })
  fireEvent.change(screen.getByLabelText('金額'), { target: { value: amount } })
  fireEvent.change(screen.getByLabelText('カテゴリ'), { target: { value: category } })
  fireEvent.change(screen.getByLabelText('メモ'), { target: { value: memo } })
}

function submitCreate() {
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
}

function editButtons() {
  return screen.queryAllByRole('button', { name: /の収支を編集$/ })
}

function deleteButtons() {
  return screen.queryAllByRole('button', { name: /の収支を削除$/ })
}

beforeEach(() => {
  vi.clearAllMocks()
  monthState.month = '2026-10'
  signOutMock.mockResolvedValue(undefined)
  scrollSpy.mockClear()
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollSpy,
  })
  mockMonth()
  vi.mocked(createEntry).mockImplementation(async (payload) => ({ id: 99, ...payload }))
  vi.mocked(updateEntry).mockImplementation(async (id, payload) => ({ id, ...payload }))
  vi.mocked(deleteEntry).mockResolvedValue(undefined)
})

describe('月次画面の取得と表示', () => {
  it('shows the JST current month and requests both APIs for it（T01）', async () => {
    await renderHome()

    expect(screen.getByRole('heading', { name: '2026年10月' })).toBeInTheDocument()
    expect(fetchEntries).toHaveBeenCalledWith('2026-10')
    expect(fetchSummary).toHaveBeenCalledWith('2026-10')
  })

  it('switches to the previous and next month for both APIs（T02）', async () => {
    await renderHome()

    fireEvent.click(screen.getByRole('button', { name: '前月' }))
    await screen.findByRole('heading', { name: '2026年9月' })
    expect(fetchEntries).toHaveBeenLastCalledWith('2026-09')
    expect(fetchSummary).toHaveBeenLastCalledWith('2026-09')

    fireEvent.click(screen.getByRole('button', { name: '次月' }))
    await screen.findByRole('heading', { name: '2026年10月' })
    fireEvent.click(screen.getByRole('button', { name: '次月' }))
    await screen.findByRole('heading', { name: '2026年11月' })
    expect(fetchEntries).toHaveBeenLastCalledWith('2026-11')
    expect(fetchSummary).toHaveBeenLastCalledWith('2026-11')
  })

  it('moves across the year boundary（T02）', async () => {
    monthState.month = '2026-01'
    await renderHome()

    fireEvent.click(screen.getByRole('button', { name: '前月' }))

    await screen.findByRole('heading', { name: '2025年12月' })
    expect(fetchEntries).toHaveBeenLastCalledWith('2025-12')
  })

  it('does not move outside the API year range（T02）', async () => {
    monthState.month = '0001-01'
    await renderHome()

    expect(screen.getByRole('button', { name: '前月' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '次月' })).toBeEnabled()
  })

  it('disables the next-month button at the end of the API range（T02）', async () => {
    monthState.month = '9999-12'
    await renderHome()

    expect(screen.getByRole('button', { name: '次月' })).toBeDisabled()
  })

  it('ignores a slower response from the previous month（T03）', async () => {
    const octEntries = deferred<ApiEntry[]>()
    const octSummaryResponse = deferred<ApiMonthlySummary>()
    const novEntries = deferred<ApiEntry[]>()
    const novSummaryResponse = deferred<ApiMonthlySummary>()
    const novEntry: ApiEntry = {
      id: 5,
      date: '2026-11-03',
      type: '支出',
      amount: 800,
      category: '食費',
      memo: '11月分',
    }
    const novSummary: ApiMonthlySummary = {
      month: '2026-11',
      incomeTotal: 0,
      expenseTotal: 800,
      balance: -800,
      expenseBreakdown: [{ category: '食費', amount: 800, percentage: 100 }],
    }

    vi.mocked(fetchEntries).mockImplementation((month) =>
      month === '2026-10' ? octEntries.promise : novEntries.promise,
    )
    vi.mocked(fetchSummary).mockImplementation((month) =>
      month === '2026-10' ? octSummaryResponse.promise : novSummaryResponse.promise,
    )

    render(<AppHome />)
    fireEvent.click(screen.getByRole('button', { name: '次月' }))

    await act(async () => {
      novEntries.resolve([novEntry])
      novSummaryResponse.resolve(novSummary)
    })
    await screen.findByText('11月分')

    await act(async () => {
      octEntries.resolve([octEntry])
      octSummaryResponse.resolve(octSummary)
    })

    expect(screen.getByRole('heading', { name: '2026年11月' })).toBeInTheDocument()
    expect(screen.getByText('11月分')).toBeInTheDocument()
    expect(screen.queryByText('昼食')).not.toBeInTheDocument()
    expect(screen.queryByText('70.6%')).not.toBeInTheDocument()
  })

  it('renders the API order with every field and distinct edit/delete actions（T04）', async () => {
    mockMonth([octEntry, incomeEntry])
    await renderHome()

    const region = screen.getByRole('region', { name: '収支一覧' })
    const items = within(region).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('2026年10月20日')
    expect(items[0]).toHaveTextContent('支出')
    expect(items[0]).toHaveTextContent('1,200円')
    expect(items[0]).toHaveTextContent('外食費')
    expect(items[0]).toHaveTextContent('昼食')
    expect(items[1]).toHaveTextContent('2026年10月10日')
    expect(items[1]).toHaveTextContent('収入')
    expect(items[1]).toHaveTextContent('53,000円')

    expect(editButtons()).toHaveLength(2)
    expect(deleteButtons()).toHaveLength(2)
    expect(
      screen.getByRole('button', { name: '2026年10月20日 外食費 1,200円 の収支を編集' }),
    ).toBeInTheDocument()
  })

  it('shows the summary totals, balance and breakdown with Japanese labels（T05）', async () => {
    mockMonth([incomeEntry], octSummary)
    await renderHome()

    const region = screen.getByRole('region', { name: '月次集計' })
    expect(within(region).getByText('収入合計')).toBeInTheDocument()
    expect(within(region).getByText('53,000円')).toBeInTheDocument()
    expect(within(region).getByText('支出合計')).toBeInTheDocument()
    expect(within(region).getByText('1,700円')).toBeInTheDocument()
    expect(within(region).getByText('収支差額')).toBeInTheDocument()
    expect(within(region).getByText('51,300円')).toBeInTheDocument()
    expect(within(region).getByText('外食費')).toBeInTheDocument()
    expect(within(region).getByText('1,200円')).toBeInTheDocument()
    expect(within(region).getByText('70.6%')).toBeInTheDocument()
    expect(within(region).getByText('食費')).toBeInTheDocument()
    expect(within(region).getByText('500円')).toBeInTheDocument()
    expect(within(region).getByText('29.4%')).toBeInTheDocument()
  })

  it('shows a negative balance with its sign（T05）', async () => {
    mockMonth([], { ...emptySummary(), expenseTotal: 500, balance: -500, expenseBreakdown: [] })
    await renderHome()

    expect(within(screen.getByRole('region', { name: '月次集計' })).getByText('-500円')).toBeInTheDocument()
  })

  it('shows zero totals and empty states without invalid rows（T06）', async () => {
    await renderHome()

    const region = screen.getByRole('region', { name: '月次集計' })
    expect(within(region).getAllByText('0円')).toHaveLength(3)
    expect(within(region).getByText('支出の内訳はありません。')).toBeInTheDocument()
    expect(screen.getByText('この月の収支はありません。')).toBeInTheDocument()
  })

  it('shows the empty breakdown for an income-only month（T06）', async () => {
    mockMonth([incomeEntry], {
      month: '2026-10',
      incomeTotal: 53000,
      expenseTotal: 0,
      balance: 53000,
      expenseBreakdown: [],
    })
    await renderHome()

    expect(within(screen.getByRole('region', { name: '月次集計' })).getByText('支出の内訳はありません。')).toBeInTheDocument()
    expect(screen.queryByText('Infinity%')).not.toBeInTheDocument()
    expect(screen.queryByText('NaN円')).not.toBeInTheDocument()
  })
})

describe('登録フォームの検証', () => {
  it('blocks all four empty required fields without POST（T07）', async () => {
    await renderHome()

    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '' } })
    submitCreate()

    expect(screen.getByText('日付を入力してください。')).toBeInTheDocument()
    expect(screen.getByText('種別を選択してください。')).toBeInTheDocument()
    expect(screen.getByText('金額を入力してください。')).toBeInTheDocument()
    expect(screen.getByText('カテゴリを選択してください。')).toBeInTheDocument()
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('blocks empty fields while editing without PUT（T07）', async () => {
    mockMonth([octEntry])
    await renderHome()

    fireEvent.click(editButtons()[0])
    await screen.findByRole('heading', { name: '収支の編集' })
    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('カテゴリ'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存する' }))

    expect(screen.getByText('日付を入力してください。')).toBeInTheDocument()
    expect(screen.getByText('金額を入力してください。')).toBeInTheDocument()
    expect(updateEntry).not.toHaveBeenCalled()
  })

  it.each(['0', '-1', '1.5', '1e3', '1,000', 'abc'])('does not POST the amount "%s"（T08）', async (amount) => {
    await renderHome()

    fillForm({ amount })
    submitCreate()

    expect(screen.getByText('金額は1円以上の整数で入力してください。')).toBeInTheDocument()
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('does not POST an amount above the API limit（T09）', async () => {
    await renderHome()

    fillForm({ amount: '2147483648' })
    submitCreate()

    expect(screen.getByText('金額は2,147,483,647円以下で入力してください。')).toBeInTheDocument()
    expect(createEntry).not.toHaveBeenCalled()
  })

  it('clears the category when the type changes（T10）', async () => {
    await renderHome()

    fillForm({ category: '外食費' })
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '収入' } })

    expect(screen.getByLabelText('カテゴリ')).toHaveValue('')
    expect(screen.getByRole('option', { name: '給与' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '外食費' })).not.toBeInTheDocument()
  })
})

describe('登録・編集・削除', () => {
  it('posts a valid entry and reloads list and summary（T11）', async () => {
    const created: ApiEntry = { ...octEntry, id: 99 }
    vi.mocked(fetchEntries).mockResolvedValueOnce([]).mockResolvedValue([created])
    vi.mocked(fetchSummary)
      .mockResolvedValueOnce(emptySummary())
      .mockResolvedValue({
        month: '2026-10',
        incomeTotal: 0,
        expenseTotal: 1200,
        balance: -1200,
        expenseBreakdown: [{ category: '外食費', amount: 1200, percentage: 100 }],
      })

    await renderHome()
    fillForm({ amount: '1200', memo: '昼食' })
    submitCreate()

    await waitFor(() => expect(createEntry).toHaveBeenCalledTimes(1))
    expect(createEntry).toHaveBeenCalledWith({
      date: '2026-10-28',
      type: '支出',
      amount: 1200,
      category: '外食費',
      memo: '昼食',
    })
    expect(await screen.findByText('昼食')).toBeInTheDocument()
    expect(screen.getByText('収支を登録しました。')).toBeInTheDocument()
    expect(fetchEntries).toHaveBeenLastCalledWith('2026-10')
    expect(fetchSummary).toHaveBeenLastCalledWith('2026-10')

    // 成功後は新規フォームへ戻る
    expect(screen.getByRole('heading', { name: '収支の登録' })).toBeInTheDocument()
    expect(screen.getByLabelText('金額')).toHaveValue('')
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('')
    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-28')
  })

  it('starts editing with all values and focuses the heading（T12）', async () => {
    mockMonth([octEntry])
    await renderHome()

    fireEvent.click(editButtons()[0])
    await screen.findByRole('heading', { name: '収支の編集' })

    expect(screen.getByRole('heading', { name: '収支の編集' })).toHaveFocus()
    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-20')
    expect(screen.getByLabelText('種別')).toHaveValue('支出')
    expect(screen.getByLabelText('金額')).toHaveValue('1200')
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('外食費')
    expect(screen.getByLabelText('メモ')).toHaveValue('昼食')
    expect(scrollSpy).toHaveBeenCalledTimes(1)
  })

  it('scrolls and focuses when the edit target switches from A to B（T12）', async () => {
    mockMonth([octEntry, incomeEntry])
    await renderHome()

    fireEvent.click(editButtons()[0])
    await screen.findByRole('heading', { name: '収支の編集' })
    expect(screen.getByLabelText('メモ')).toHaveValue('昼食')

    fireEvent.click(editButtons()[1])

    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-10')
    expect(screen.getByLabelText('種別')).toHaveValue('収入')
    expect(screen.getByLabelText('金額')).toHaveValue('53000')
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('給与')
    expect(screen.getByLabelText('メモ')).toHaveValue('')
    expect(screen.getByRole('heading', { name: '収支の編集' })).toHaveFocus()
    expect(scrollSpy).toHaveBeenCalledTimes(2)
  })

  it('scrolls and focuses again when the same entry is selected（T12）', async () => {
    mockMonth([octEntry])
    await renderHome()

    fireEvent.click(editButtons()[0])
    await screen.findByRole('heading', { name: '収支の編集' })
    screen.getByLabelText('金額').focus()

    fireEvent.click(editButtons()[0])

    expect(screen.getByRole('heading', { name: '収支の編集' })).toHaveFocus()
    expect(scrollSpy).toHaveBeenCalledTimes(2)
  })

  it('cancels editing without PUT and returns to a new form（T12）', async () => {
    mockMonth([octEntry])
    await renderHome()

    fireEvent.click(editButtons()[0])
    await screen.findByRole('heading', { name: '収支の編集' })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(updateEntry).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '収支の登録' })).toBeInTheDocument()
    expect(screen.getByLabelText('金額')).toHaveValue('')
    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-28')
  })

  it('puts all edited fields and reloads list and summary（T13）', async () => {
    const updated: ApiEntry = {
      id: 1,
      date: '2026-10-20',
      type: '収入',
      amount: 300000,
      category: '給与',
      memo: '10月分',
    }
    mockMonth([octEntry])
    vi.mocked(fetchEntries).mockResolvedValueOnce([octEntry]).mockResolvedValue([updated])
    vi.mocked(fetchSummary)
      .mockResolvedValueOnce(emptySummary())
      .mockResolvedValue({
        month: '2026-10',
        incomeTotal: 300000,
        expenseTotal: 0,
        balance: 300000,
        expenseBreakdown: [],
      })

    await renderHome()
    fireEvent.click(editButtons()[0])
    await screen.findByRole('heading', { name: '収支の編集' })
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '収入' } })
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '300000' } })
    fireEvent.change(screen.getByLabelText('カテゴリ'), { target: { value: '給与' } })
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '10月分' } })
    fireEvent.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() => expect(updateEntry).toHaveBeenCalledTimes(1))
    expect(updateEntry).toHaveBeenCalledWith(1, {
      date: '2026-10-20',
      type: '収入',
      amount: 300000,
      category: '給与',
      memo: '10月分',
    })
    expect(await screen.findByText('10月分')).toBeInTheDocument()
    expect(screen.getByText('収支を更新しました。')).toBeInTheDocument()
    expect(fetchEntries).toHaveBeenLastCalledWith('2026-10')
  })

  it('shows a Japanese confirmation and cancels without DELETE（T14）', async () => {
    mockMonth([octEntry])
    await renderHome()

    fireEvent.click(deleteButtons()[0])

    expect(screen.getByRole('heading', { name: 'この収支を削除しますか？' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '削除する' })).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('open')

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(deleteEntry).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancels the confirmation with Escape without DELETE（T14）', async () => {
    mockMonth([octEntry])
    await renderHome()

    fireEvent.click(deleteButtons()[0])
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))

    expect(deleteEntry).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('deletes once and reloads list and summary（T14）', async () => {
    mockMonth([octEntry])
    vi.mocked(fetchEntries).mockResolvedValueOnce([octEntry]).mockResolvedValue([])
    vi.mocked(fetchSummary).mockResolvedValueOnce(octSummary).mockResolvedValue(emptySummary())

    await renderHome()
    fireEvent.click(deleteButtons()[0])
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    await waitFor(() => expect(deleteEntry).toHaveBeenCalledTimes(1))
    expect(deleteEntry).toHaveBeenCalledWith(1)
    expect(await screen.findByText('この月の収支はありません。')).toBeInTheDocument()
    expect(screen.getByText('収支を削除しました。')).toBeInTheDocument()
    expect(fetchEntries).toHaveBeenLastCalledWith('2026-10')
    expect(fetchSummary).toHaveBeenLastCalledWith('2026-10')
  })

  it('keeps the displayed month when an entry is saved for another month（T15）', async () => {
    const novemberEntry: ApiEntry = {
      id: 42,
      date: '2026-11-05',
      type: '支出',
      amount: 900,
      category: '日用品',
      memo: '11月の保存',
    }
    vi.mocked(fetchEntries).mockResolvedValueOnce([]).mockImplementation(async (month) =>
      month === '2026-11' ? [novemberEntry] : [],
    )
    vi.mocked(fetchSummary).mockResolvedValue(emptySummary())

    await renderHome()
    fillForm({ date: '2026-11-05', amount: '900', category: '日用品', memo: '11月の保存' })
    submitCreate()

    await waitFor(() => expect(createEntry).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-11-05' })))
    expect(await screen.findByText('収支を登録しました。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2026年10月' })).toBeInTheDocument()
    expect(fetchEntries).toHaveBeenLastCalledWith('2026-10')

    fireEvent.click(screen.getByRole('button', { name: '次月' }))

    expect(await screen.findByText('11月の保存')).toBeInTheDocument()
    expect(fetchEntries).toHaveBeenLastCalledWith('2026-11')
  })

  it('keeps the displayed month when an entry is edited into another month（T15）', async () => {
    const movedEntry: ApiEntry = {
      id: 1,
      date: '2026-11-05',
      type: '支出',
      amount: 1200,
      category: '外食費',
      memo: '11月へ移動',
    }
    vi.mocked(fetchEntries).mockResolvedValueOnce([octEntry]).mockImplementation(async (month) =>
      month === '2026-11' ? [movedEntry] : [],
    )
    vi.mocked(fetchSummary).mockResolvedValue(emptySummary())

    await renderHome()
    fireEvent.click(editButtons()[0])
    await screen.findByRole('heading', { name: '収支の編集' })
    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-11-05' } })
    fireEvent.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() =>
      expect(updateEntry).toHaveBeenCalledWith(1, expect.objectContaining({ date: '2026-11-05' })),
    )
    expect(await screen.findByText('この月の収支はありません。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2026年10月' })).toBeInTheDocument()
    expect(fetchEntries).toHaveBeenLastCalledWith('2026-10')

    fireEvent.click(screen.getByRole('button', { name: '次月' }))

    expect(await screen.findByText('11月へ移動')).toBeInTheDocument()
    expect(fetchEntries).toHaveBeenLastCalledWith('2026-11')
  })

  it('blocks duplicate submission and competing actions while saving（T16）', async () => {
    const pending = deferred<ApiEntry>()
    vi.mocked(createEntry).mockReturnValue(pending.promise)
    mockMonth([octEntry])

    await renderHome()
    fillForm()
    const submitButton = screen.getByRole('button', { name: '登録する' })
    fireEvent.click(submitButton)
    fireEvent.click(submitButton)
    fireEvent.submit(screen.getByRole('form', { name: '収支フォーム' }))

    expect(createEntry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '登録中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '前月' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '次月' })).toBeDisabled()
    expect(editButtons()[0]).toBeDisabled()
    expect(deleteButtons()[0]).toBeDisabled()

    await act(async () => {
      pending.resolve({ id: 100, date: '2026-10-28', type: '支出', amount: 1500, category: '外食費', memo: '' })
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '登録する' })).toBeEnabled())
  })

  it('blocks duplicate update requests while saving（T16）', async () => {
    const pending = deferred<ApiEntry>()
    mockMonth([octEntry])
    vi.mocked(updateEntry).mockReturnValue(pending.promise)

    await renderHome()
    fireEvent.click(editButtons()[0])
    await screen.findByRole('heading', { name: '収支の編集' })
    const saveButton = screen.getByRole('button', { name: '保存する' })
    fireEvent.click(saveButton)
    fireEvent.click(saveButton)
    fireEvent.submit(screen.getByRole('form', { name: '収支フォーム' }))

    expect(updateEntry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '前月' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled()

    await act(async () => {
      pending.resolve(octEntry)
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '登録する' })).toBeEnabled())
  })

  it('blocks duplicate delete requests while deleting（T16）', async () => {
    const pending = deferred<void>()
    mockMonth([octEntry])
    vi.mocked(deleteEntry).mockReturnValue(pending.promise)

    await renderHome()
    fireEvent.click(deleteButtons()[0])
    const confirmButton = screen.getByRole('button', { name: '削除する' })
    fireEvent.click(confirmButton)
    fireEvent.click(confirmButton)

    expect(deleteEntry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '削除中…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '前月' })).toBeDisabled()

    await act(async () => {
      pending.resolve()
    })
    await waitFor(() => expect(screen.getByText('収支を削除しました。')).toBeInTheDocument())
  })
})

describe('異常系と再取得', () => {
  it('shows a Japanese retry guide when the list request fails and hides the summary（T17）', async () => {
    vi.mocked(fetchEntries).mockRejectedValue(new ApiError('failed', 500))
    vi.mocked(fetchSummary).mockResolvedValue(octSummary)

    render(<AppHome />)

    expect(await screen.findByText('月次データを取得できませんでした。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '再読み込み' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '月次集計' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '収支一覧' })).not.toBeInTheDocument()
    expect(signOutMock).not.toHaveBeenCalled()
  })

  it('does not show the list when the summary request fails（T17）', async () => {
    vi.mocked(fetchEntries).mockResolvedValue([octEntry])
    vi.mocked(fetchSummary).mockRejectedValue(new ApiError('failed', 500))

    render(<AppHome />)

    expect(await screen.findByText('月次データを取得できませんでした。')).toBeInTheDocument()
    expect(screen.queryByText('昼食')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '月次集計' })).not.toBeInTheDocument()
  })

  it('shows fixed Japanese field messages for a 400 and keeps the input（T17）', async () => {
    vi.mocked(createEntry).mockRejectedValue(
      new ApiValidationError({ amount: ['Amount must be at least 1.'] }),
    )
    await renderHome()
    fillForm({ amount: '1500' })
    submitCreate()

    expect(
      await screen.findByText('金額は1円以上2,147,483,647円以下で入力してください。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Amount must be at least 1.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('金額')).toHaveValue('1500')
  })

  it('shows the not-found message for a 404 on update and keeps the form values（T17）', async () => {
    mockMonth([octEntry])
    vi.mocked(updateEntry).mockRejectedValue(new ApiError('not found', 404))

    await renderHome()
    fireEvent.click(editButtons()[0])
    await screen.findByRole('heading', { name: '収支の編集' })
    fireEvent.click(screen.getByRole('button', { name: '保存する' }))

    expect(
      await screen.findByText('対象の収支が見つかりません。再読み込みしてください。'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('金額')).toHaveValue('1200')
    expect(signOutMock).not.toHaveBeenCalled()
  })

  it('shows a delete error in the dialog without logging out on 500（T17）', async () => {
    mockMonth([octEntry])
    vi.mocked(deleteEntry).mockRejectedValue(new ApiError('failed', 500))

    await renderHome()
    fireEvent.click(deleteButtons()[0])
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(
      await screen.findByText('削除に失敗しました。しばらくしてから再試行してください。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('open')
    expect(signOutMock).not.toHaveBeenCalled()
  })

  it('shows a Japanese error for 403 and does not log out（T17）', async () => {
    vi.mocked(createEntry).mockRejectedValue(new ApiError('forbidden', 403))
    await renderHome()
    fillForm()
    submitCreate()

    expect(await screen.findByText('保存に失敗しました。しばらくしてから再試行してください。')).toBeInTheDocument()
    expect(signOutMock).not.toHaveBeenCalled()
  })

  it('shows a result-confirmation message and reloads only with GETs on a network failure（T17）', async () => {
    vi.mocked(createEntry).mockRejectedValue(new TypeError('Failed to fetch'))
    await renderHome()
    fillForm()
    submitCreate()

    expect(
      await screen.findByText(
        '処理が完了している可能性があります。一覧を再読み込みして結果を確認してください。',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('保存に失敗しました。通信状況を確認して再試行してください。')).not.toBeInTheDocument()
    expect(signOutMock).not.toHaveBeenCalled()
    expect(createEntry).toHaveBeenCalledTimes(1)
    expect(fetchEntries).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '一覧を再読み込み' }))

    await waitFor(() => expect(fetchEntries).toHaveBeenCalledTimes(2))
    expect(fetchSummary).toHaveBeenCalledTimes(2)
    expect(createEntry).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/処理が完了している可能性があります/)).not.toBeInTheDocument()
  })

  it('asks for result confirmation when an update request loses the network（T17）', async () => {
    mockMonth([octEntry])
    vi.mocked(updateEntry).mockRejectedValue(new TypeError('Failed to fetch'))

    await renderHome()
    fireEvent.click(editButtons()[0])
    await screen.findByRole('heading', { name: '収支の編集' })
    fireEvent.click(screen.getByRole('button', { name: '保存する' }))

    expect(
      await screen.findByText(
        '処理が完了している可能性があります。一覧を再読み込みして結果を確認してください。',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('金額')).toHaveValue('1200')
    expect(updateEntry).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '一覧を再読み込み' }))

    await waitFor(() => expect(fetchEntries).toHaveBeenCalledTimes(2))
    expect(updateEntry).toHaveBeenCalledTimes(1)
  })

  it('keeps retry wording and hides the reload action for a server error（T17）', async () => {
    vi.mocked(createEntry).mockRejectedValue(new ApiError('failed', 500))
    await renderHome()
    fillForm()
    submitCreate()

    expect(
      await screen.findByText('保存に失敗しました。しばらくしてから再試行してください。'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '一覧を再読み込み' })).not.toBeInTheDocument()
  })

  it('asks for result confirmation and reloads only with GETs after a delete network failure（T17）', async () => {
    mockMonth([octEntry])
    vi.mocked(deleteEntry).mockRejectedValue(new TypeError('Failed to fetch'))

    await renderHome()
    fireEvent.click(deleteButtons()[0])
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(
      await screen.findByText(
        '処理が完了している可能性があります。一覧を再読み込みして結果を確認してください。',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('open')
    expect(signOutMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '一覧を再読み込み' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(fetchEntries).toHaveBeenCalledTimes(2)
    expect(fetchSummary).toHaveBeenCalledTimes(2)
    expect(deleteEntry).toHaveBeenCalledTimes(1)
  })

  it('shows a generic 400 message when the validation errors are empty（T17）', async () => {
    vi.mocked(createEntry).mockRejectedValue(new ApiValidationError({}))
    await renderHome()
    fillForm()
    submitCreate()

    expect(await screen.findByText('入力内容を確認してください。')).toBeInTheDocument()
  })

  it('translates PascalCase validation keys to the fixed field message（T17）', async () => {
    vi.mocked(createEntry).mockRejectedValue(
      new ApiValidationError({ Amount: ['Amount must be at least 1.'] }),
    )
    await renderHome()
    fillForm()
    submitCreate()

    expect(
      await screen.findByText('金額は1円以上2,147,483,647円以下で入力してください。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Amount must be at least 1.')).not.toBeInTheDocument()
  })

  it('signs out when the session expired during loading（T20）', async () => {
    vi.mocked(fetchEntries).mockRejectedValue(new AccessTokenRefreshError())

    render(<AppHome />)

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1))
  })

  it('distinguishes a saved entry from a failed refresh and retries only with GETs（T18）', async () => {
    vi.mocked(fetchEntries)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new ApiError('failed', 500))
    vi.mocked(fetchSummary)
      .mockResolvedValueOnce(emptySummary())
      .mockRejectedValueOnce(new ApiError('failed', 500))

    await renderHome()
    fillForm()
    submitCreate()

    expect(
      await screen.findByText('保存は完了しましたが、表示の更新に失敗しました。再読み込みしてください。'),
    ).toBeInTheDocument()
    expect(screen.getByText('月次データを取得できませんでした。')).toBeInTheDocument()

    mockMonth()
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))

    expect(await screen.findByText('この月の収支はありません。')).toBeInTheDocument()
    expect(createEntry).toHaveBeenCalledTimes(1)
    expect(updateEntry).not.toHaveBeenCalled()
    expect(deleteEntry).not.toHaveBeenCalled()
  })

  it('reloads both APIs when retrying a failed load（T17）', async () => {
    vi.mocked(fetchEntries).mockRejectedValueOnce(new ApiError('failed', 500))
    vi.mocked(fetchSummary).mockRejectedValueOnce(new ApiError('failed', 500))

    render(<AppHome />)
    await screen.findByText('月次データを取得できませんでした。')

    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))

    expect(await screen.findByText('この月の収支はありません。')).toBeInTheDocument()
    expect(fetchEntries).toHaveBeenCalledTimes(2)
    expect(fetchSummary).toHaveBeenCalledTimes(2)
  })
})
