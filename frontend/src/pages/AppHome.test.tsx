import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AppHome from './AppHome'
import {
  AccessTokenRefreshError,
  ApiError,
  createEntry,
  deleteEntry,
  fetchEntries,
  fetchSummary,
  updateEntry,
  type ApiEntry,
  type ApiSummary,
} from '../api/client'

const mockSignOut = vi.fn()
vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ signOut: mockSignOut }),
}))

vi.mock('../api/client', () => ({
  fetchEntries: vi.fn(),
  fetchSummary: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  ApiError: class extends Error {
    readonly status: number
    constructor(message: string, status: number) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  },
  ApiValidationError: class extends Error {
    readonly fieldErrors: Readonly<Record<string, readonly string[]>>
    constructor(message: string, fieldErrors: Readonly<Record<string, readonly string[]>>) {
      super(message)
      this.name = 'ApiValidationError'
      this.fieldErrors = fieldErrors
    }
  },
  AccessTokenRefreshError: class extends Error {
    constructor() {
      super('セッションが失効しました。再度ログインしてください。')
      this.name = 'AccessTokenRefreshError'
    }
  },
}))

function emptySummary(month = '2026-10'): ApiSummary {
  return { month, incomeTotal: 0, expenseTotal: 0, balance: 0, expenseBreakdown: [] }
}

/** モックAPIの状態。各テストで書き換える */
const api = {
  entries: [] as ApiEntry[],
  summary: emptySummary(),
  entriesError: null as Error | null,
  summaryError: null as Error | null,
}

function setupApi() {
  mockSignOut.mockResolvedValue(undefined)
  vi.mocked(fetchEntries).mockImplementation(() => {
    if (api.entriesError) return Promise.reject(api.entriesError)
    return Promise.resolve(api.entries)
  })
  vi.mocked(fetchSummary).mockImplementation(() => {
    if (api.summaryError) return Promise.reject(api.summaryError)
    return Promise.resolve(api.summary)
  })
}

function resetApi() {
  api.entries = []
  api.summary = emptySummary()
  api.entriesError = null
  api.summaryError = null
}

/** 画面を描画する。認証はモックした signOut を持つだけの状態にする */
function renderScreen() {
  return render(<AppHome />)
}

/** 時計を固定する（Dateのみフェイク。待機処理は実タイマーのまま） */
function useFixedClock(iso: string) {
  vi.useRealTimers()
  vi.useFakeTimers({ now: new Date(iso), toFake: ['Date'] })
}

/** 遅延応答を作る */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 月指定に応じて別々のデータを返すモック */
function setupMonthSwitchMock() {
  const data: Record<string, { entries: ApiEntry[]; summary: ApiSummary }> = {
    '2026-10': {
      entries: [{ id: 1, date: '2026-10-01', type: '支出', amount: 100, category: '食費', memo: 'A月のデータ' }],
      summary: {
        month: '2026-10',
        incomeTotal: 0,
        expenseTotal: 100,
        balance: -100,
        expenseBreakdown: [{ category: '食費', amount: 100, percentage: 100 }],
      },
    },
    '2026-11': {
      entries: [{ id: 2, date: '2026-11-01', type: '収入', amount: 200, category: '給与', memo: 'B月のデータ' }],
      summary: {
        month: '2026-11',
        incomeTotal: 200,
        expenseTotal: 0,
        balance: 200,
        expenseBreakdown: [],
      },
    },
  }
  vi.mocked(fetchEntries).mockImplementation((month) => {
    if (!(month in data)) return Promise.resolve([])
    return Promise.resolve(data[month]!.entries)
  })
  vi.mocked(fetchSummary).mockImplementation((month) => {
    if (!(month in data)) return Promise.resolve(emptySummary(month))
    return Promise.resolve(data[month]!.summary)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetApi()
  useFixedClock('2026-10-15T00:00:00Z')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('月切替と初期表示 (T1・T2・T3)', () => {
  it('JSTの現在月を初期表示し、前月・次月で一覧と集計が切り替わる (T1)', async () => {
    setupMonthSwitchMock()
    renderScreen()

    // 初期表示は2026-10。一覧と集計の両方に同じ月を指定する
    await waitFor(() => expect(screen.getByText('2026年10月')).toBeInTheDocument())
    expect(vi.mocked(fetchEntries)).toHaveBeenCalledWith('2026-10')
    expect(vi.mocked(fetchSummary)).toHaveBeenCalledWith('2026-10')

    fireEvent.click(screen.getByRole('button', { name: '前月' }))
    await waitFor(() => expect(screen.getByText('2026年9月')).toBeInTheDocument())
    expect(vi.mocked(fetchEntries)).toHaveBeenCalledWith('2026-09')
    expect(vi.mocked(fetchSummary)).toHaveBeenCalledWith('2026-09')
    expect(screen.getByRole('region', { name: '月次集計' })).toHaveTextContent('0円')
    // 前月データの一覧が表示されている
    await waitFor(() => expect(screen.getByText('この月に登録されている収支はありません。')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '次月' }))
    await waitFor(() => expect(screen.getByText('2026年10月')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('A月のデータ')).toBeInTheDocument())
    expect(screen.getByRole('region', { name: '月次集計' })).toHaveTextContent('-100円')

    fireEvent.click(screen.getByRole('button', { name: '次月' }))
    await waitFor(() => expect(screen.getByText('2026年11月')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('B月のデータ')).toBeInTheDocument())
    expect(screen.getByRole('region', { name: '月次集計' })).toHaveTextContent('200円')
  })

  it('年をまたぐ月切替は前年12月・翌年1月になる (T2)', async () => {
    setupMonthSwitchMock()

    vi.useRealTimers()
    useFixedClock('2026-01-31T10:00:00Z')
    const { unmount } = renderScreen()
    await waitFor(() => expect(screen.getByText('2026年1月')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '前月' }))
    await waitFor(() => expect(screen.getByText('2025年12月')).toBeInTheDocument())
    expect(vi.mocked(fetchEntries)).toHaveBeenCalledWith('2025-12')
    unmount()

    vi.useRealTimers()
    useFixedClock('2026-03-31T10:00:00Z')
    const march = renderScreen()
    await waitFor(() => expect(screen.getByText('2026年3月')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '前月' }))
    await waitFor(() => expect(screen.getByText('2026年2月')).toBeInTheDocument())
    march.unmount()

    vi.useRealTimers()
    useFixedClock('2026-12-31T10:00:00Z')
    renderScreen()
    await waitFor(() => expect(screen.getByText('2026年12月')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '次月' }))
    await waitFor(() => expect(screen.getByText('2027年1月')).toBeInTheDocument())
    expect(vi.mocked(fetchEntries)).toHaveBeenCalledWith('2027-01')
  })

  it('UTCの15時と14時59分でJSTの月が変わる (T3)', async () => {
    setupApi()

    vi.useRealTimers()
    useFixedClock('2026-10-31T14:59:59Z')
    const { unmount } = renderScreen()
    await waitFor(() => expect(screen.getByText('2026年10月')).toBeInTheDocument())
    expect(vi.mocked(fetchEntries)).toHaveBeenCalledWith('2026-10')
    unmount()

    useFixedClock('2026-10-31T15:00:00Z')
    renderScreen()
    await waitFor(() => expect(screen.getByText('2026年11月')).toBeInTheDocument())
    expect(vi.mocked(fetchEntries)).toHaveBeenCalledWith('2026-11')
  })
})

describe('一覧と集計の表示 (T4〜T7)', () => {
  it('一覧はAPI順（日付の新しい順）をそのまま表示する (T4)', async () => {
    api.entries = [
      { id: 3, date: '2026-10-23', type: '支出', amount: 1500, category: '外食費', memo: 'ラーメン' },
      { id: 4, date: '2026-10-15', type: '支出', amount: 500, category: '日用品', memo: '同日データ' },
      { id: 2, date: '2026-10-15', type: '収入', amount: 250000, category: '給与', memo: '10月分' },
      { id: 1, date: '2026-10-01', type: '支出', amount: 800, category: '交通費', memo: '' },
    ]
    setupApi()
    renderScreen()

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent('2026-10-23')
    expect(rows[1]).toHaveTextContent('2026-10-15')
    expect(rows[1]).toHaveTextContent('支出')
    expect(rows[1]).toHaveTextContent('日用品')
    expect(rows[1]).toHaveTextContent('同日データ')
    expect(rows[2]).toHaveTextContent('2026-10-15')
    expect(rows[2]).toHaveTextContent('収入')
    expect(rows[2]).toHaveTextContent('給与')
    expect(rows[2]).toHaveTextContent('10月分')
    expect(rows[3]).toHaveTextContent('2026-10-01')
    expect(rows[0]).toHaveTextContent('1,500円')
    expect(rows[0]).toHaveTextContent('支出')
    expect(rows[0]).toHaveTextContent('外食費')
    expect(rows[0]).toHaveTextContent('ラーメン')
    expect(rows[2]).toHaveTextContent('250,000円')
  })

  it('集計欄に収入合計・支出合計・収支差額・カテゴリ内訳の金額と構成比を表示する (T5)', async () => {
    api.summary = {
      month: '2026-10',
      incomeTotal: 10000,
      expenseTotal: 3000,
      balance: 7000,
      expenseBreakdown: [
        { category: '食費', amount: 2000, percentage: 66.7 },
        { category: '外食費', amount: 1000, percentage: 33.3 },
      ],
    }
    setupApi()
    renderScreen()

    const region = await screen.findByRole('region', { name: '月次集計' })
    expect(within(region).getAllByText('10,000円').length).toBeGreaterThan(0)
    expect(within(region).getAllByText('3,000円').length).toBeGreaterThan(0)
    expect(within(region).getAllByText('7,000円').length).toBeGreaterThan(0)
    expect(within(region).getByText('66.7%')).toBeInTheDocument()
    expect(within(region).getByText('33.3%')).toBeInTheDocument()
    expect(within(region).getByText('食費')).toBeInTheDocument()
    expect(within(region).getByText('外食費')).toBeInTheDocument()
    expect(within(region).getByText('2,000円')).toBeInTheDocument()
    expect(within(region).getByText('1,000円')).toBeInTheDocument()
    // 支出の内訳に収入カテゴリは現れない
    expect(within(region).queryByText('給与')).not.toBeInTheDocument()
  })

  it('空の月は0円・空一覧・内訳なしを表示する (T6)', async () => {
    setupApi()
    renderScreen()

    await screen.findByText('この月に登録されている収支はありません。')
    const region = screen.getByRole('region', { name: '月次集計' })
    expect(within(region).getAllByText('0円').length).toBeGreaterThanOrEqual(3)
    expect(within(region).getByText('支出の内訳はありません。')).toBeInTheDocument()
    expect(within(region).queryByText(/NaN|Infinity/i)).not.toBeInTheDocument()
  })

  it('収入のみの月は差額が収入と一致し、0%内訳は0.0%と表示する (T6)', async () => {
    api.summary = {
      month: '2026-10', incomeTotal: 5000, expenseTotal: 0, balance: 5000,
      expenseBreakdown: [
        { category: '食費', amount: 0, percentage: 0 },
        { category: '日用品', amount: 0, percentage: Number.NaN },
        { category: '交通費', amount: 0, percentage: Number.POSITIVE_INFINITY },
      ],
    }
    setupApi()
    renderScreen()
    const region = await screen.findByRole('region', { name: '月次集計' })
    expect(within(region).getAllByText('5,000円')).toHaveLength(2)
    expect(within(region).getAllByText('0.0%')).toHaveLength(3)
    expect(within(region).queryByText(/NaN|Infinity/i)).not.toBeInTheDocument()
  })

  it('支出のみの月は負の差額を表示する (T7)', async () => {
    api.summary = {
      month: '2026-10',
      incomeTotal: 0,
      expenseTotal: 1000,
      balance: -1000,
      expenseBreakdown: [
        { category: '交通費', amount: 999, percentage: 100 },
        { category: '日用品', amount: 1, percentage: 0.1 },
      ],
    }
    setupApi()
    renderScreen()

    await screen.findByRole('region', { name: '月次集計' })
    expect(screen.getAllByText('-1,000円').length).toBeGreaterThan(0)
    expect(screen.getByText('100.0%')).toBeInTheDocument()
    expect(screen.getByText('0.1%')).toBeInTheDocument()
  })
})

describe('読み込みと失敗 (T22)', () => {
  it('読み込み中は旧データを新月の結果として表示しない', async () => {
    const pending = deferred<ApiEntry[]>()
    setupApi()
    vi.mocked(fetchEntries).mockReturnValueOnce(pending.promise)
    renderScreen()

    await waitFor(() => expect(screen.getByText('読み込み中…')).toBeInTheDocument())
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    resolveEntries(pending, [])
  })

  it('初期取得に失敗したら日本語エラーを表示し、再試行で回復する (T22)', async () => {
    api.entriesError = new ApiError('APIの呼び出しに失敗しました。しばらくしてから再試行してください。', 500)
    setupApi()
    renderScreen()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('APIの呼び出しに失敗しました。しばらくしてから再試行してください。')
    expect(screen.queryByRole('region', { name: '月次集計' })).not.toBeInTheDocument()
    // 片方が失敗した结果は表示せず、全体をエラーにする
    expect(screen.queryByText('この月に登録されている収支はありません。')).not.toBeInTheDocument()

    // 再試行で成功する
    api.entriesError = null
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    await waitFor(() => expect(screen.getByRole('region', { name: '月次集計' })).toBeInTheDocument())
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('集計だけが失敗した場合も片側だけの結果は表示しない (T22)', async () => {
    api.summaryError = new ApiError('APIの呼び出しに失敗しました。しばらくしてから再試行してください。', 500)
    setupApi()
    renderScreen()

    await screen.findByRole('alert')
    expect(screen.queryByRole('region', { name: '月次集計' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    api.summaryError = null
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    await waitFor(() => expect(screen.getByRole('region', { name: '月次集計' })).toBeInTheDocument())
  })

  it.each([
    ['404', new ApiError('対象の収支が存在しません。', 404)],
    ['500', new ApiError('APIの呼び出しに失敗しました。', 500)],
    ['通信失敗', new ApiError('APIの呼び出しに失敗しました。通信状態を確認してください。', 0)],
  ])('編集の%s失敗では日本語エラーを出し入力と一覧を保持する (T22)', async (_kind, error) => {
    const entry: ApiEntry = { id: 30, date: '2026-10-15', type: '支出', amount: 900, category: '食費', memo: '保持する' }
    api.entries = [entry]
    setupApi()
    vi.mocked(updateEntry).mockRejectedValueOnce(error)
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-15/ })
    fireEvent.click(within(row).getByRole('button', { name: '編集' }))
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '1000' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(error.message)
    expect(screen.getByLabelText('金額')).toHaveValue('1000')
    expect(screen.getByRole('listitem', { name: /2026-10-15/ })).toHaveTextContent('900円')
    expect(fetchEntries).toHaveBeenCalledTimes(1)
  })
})

describe('連続月切替の競合 (T23・T24)', () => {
  it('月Aの応答が遅れても、月Bの表示を維持する (T23)', async () => {
    const lateSeptember = deferred<ApiEntry[]>()
    vi.mocked(fetchEntries).mockImplementation((month) => {
      if (month === '2026-09') return lateSeptember.promise
      if (month === '2026-10') {
        return Promise.resolve([
          { id: 1, date: '2026-10-01', type: '支出', amount: 100, category: '食費', memo: 'A月のデータ' },
        ])
      }
      return Promise.resolve([])
    })
    vi.mocked(fetchSummary).mockImplementation((month) => {
      return Promise.resolve(emptySummary(month))
    })

    renderScreen()
    // 初期表示は2026-10
    await screen.findByText('A月のデータ')

    // 前月(2026-09)の取得を遅らせてから、次月で2026-10へ戻る
    fireEvent.click(screen.getByRole('button', { name: '前月' }))
    await waitFor(() => expect(screen.getByText('2026年9月')).toBeInTheDocument())
    // 読み込み中は旧データを新月の結果として表示しない
    await waitFor(() => expect(screen.getByText('読み込み中…')).toBeInTheDocument())
    expect(screen.queryByText('A月のデータ')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '次月' }))
    await waitFor(() => expect(screen.getByText('A月のデータ')).toBeInTheDocument())

    // 月A(2026-09)の遅延応答が最後に到着しても、表示中の2026-10は上書きされない
    lateSeptember.resolve([
      { id: 0, date: '2026-09-30', type: '支出', amount: 999, category: '外食費', memo: '9月の遅延データ' },
    ])
    await waitFor(() => {
      expect(screen.getByText('A月のデータ')).toBeInTheDocument()
      expect(screen.queryByText('9月の遅延データ')).not.toBeInTheDocument()
      expect(screen.getByText('2026年10月')).toBeInTheDocument()
    })
  })

  it('更新処理中は競合する操作を無効化し、二重送信しない (T24)', async () => {
    api.entries = [{ id: 1, date: '2026-10-01', type: '支出', amount: 100, category: '食費', memo: '' }]
    setupApi()
    const pending = deferred<ApiEntry>()
    createEntryConnPonent(pending.promise)
    renderScreen()
    await screen.findByRole('list')

    // フォームを有効な値で入力して送信する
    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-10-20' } })
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '支出' } })
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '500' } })
    fireEvent.change(screen.getByLabelText('カテゴリ'), { target: { value: '食費' } })
    const submit = screen.getAllByRole('button').find((b) => b.textContent === '登録')!
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(createEntry).toHaveBeenCalledTimes(1)
    // 処理中は月切替と一覧の操作が無効
    expect(screen.getByRole('button', { name: '次月' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '前月' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '削除' })).toBeDisabled()

    pending.resolve({ id: 9, date: '2026-10-20', type: '支出', amount: 500, category: '食費', memo: '' })
    await waitFor(() => expect(submit).toBeEnabled())
    // 成功後、表示月の一覧・集計が再取得される
    expect(vi.mocked(fetchEntries).mock.calls.filter(([m]) => m === '2026-10').length).toBeGreaterThanOrEqual(2)
    expect(vi.mocked(fetchSummary).mock.calls.filter(([m]) => m === '2026-10').length).toBeGreaterThanOrEqual(2)
  })

  it('編集処理中は保存の連打・削除・月切替を無効化する (T24)', async () => {
    const entry: ApiEntry = { id: 21, date: '2026-10-10', type: '支出', amount: 100, category: '食費', memo: '' }
    api.entries = [entry]
    setupApi()
    const pending = deferred<ApiEntry>()
    vi.mocked(updateEntry).mockReturnValueOnce(pending.promise)
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-10/ })
    fireEvent.click(within(row).getByRole('button', { name: '編集' }))
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '200' } })
    const save = screen.getByRole('button', { name: '保存' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(updateEntry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '前月' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '次月' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '削除' })).toBeDisabled()
    pending.resolve({ ...entry, amount: 200 })
    await waitFor(() => expect(screen.getByRole('button', { name: '登録' })).toBeInTheDocument())
  })

  it('削除処理中は削除の連打・月切替を無効化する (T24)', async () => {
    setupSingleEntryLike()
    const pending = deferred<void>()
    vi.mocked(deleteEntry).mockReturnValueOnce(pending.promise)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-10/ })
    const remove = within(row).getByRole('button', { name: '削除' })
    fireEvent.click(remove)
    fireEvent.click(remove)
    expect(deleteEntry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '次月' })).toBeDisabled()
    pending.resolve()
    await waitFor(() => expect(screen.getByRole('button', { name: '次月' })).toBeEnabled())
  })

  it('更新後の遅延再取得が月切替後の表示を上書きしない (T24)', async () => {
    const original: ApiEntry = { id: 25, date: '2026-10-10', type: '支出', amount: 100, category: '食費', memo: '10月データ' }
    const updated: ApiEntry = { ...original, amount: 200 }
    const delayedRefresh = deferred<ApiEntry[]>()
    setupMonthSwitchMock()
    vi.mocked(fetchEntries).mockImplementation((month) => {
      if (month === '2026-10') return Promise.resolve([original])
      if (month === '2026-11') return Promise.resolve([
        { id: 26, date: '2026-11-01', type: '収入', amount: 300, category: '給与', memo: '11月データ' },
      ])
      return Promise.resolve([])
    })
    vi.mocked(fetchSummary).mockImplementation((month) => Promise.resolve(emptySummary(month)))
    vi.mocked(updateEntry).mockResolvedValue(updated)
    renderScreen()

    const row = await screen.findByRole('listitem', { name: /2026-10-10/ })
    fireEvent.click(within(row).getByRole('button', { name: '編集' }))
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '200' } })
    vi.mocked(fetchEntries).mockImplementation((month) => {
      if (month === '2026-10') return delayedRefresh.promise
      if (month === '2026-11') return Promise.resolve([
        { id: 26, date: '2026-11-01', type: '収入', amount: 300, category: '給与', memo: '11月データ' },
      ])
      return Promise.resolve([])
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(fetchEntries).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByRole('button', { name: '次月' }))
    await waitFor(() => expect(screen.getByText('11月データ')).toBeInTheDocument())

    await act(async () => {
      delayedRefresh.resolve([updated])
    })
    expect(screen.getByText('11月データ')).toBeInTheDocument()
    expect(screen.queryByText('10月データ')).not.toBeInTheDocument()
    expect(screen.getByText('2026年11月')).toBeInTheDocument()
  })
})

describe('登録 (T13・T15・T25)', () => {
  async function fillNewEntryForm(date: string, amount: string) {
    fireEvent.change(screen.getByLabelText('日付'), { target: { value: date } })
    fireEvent.change(screen.getByLabelText('種別'), { target: { value: '支出' } })
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: amount } })
    fireEvent.change(screen.getByLabelText('カテゴリ'), { target: { value: '食費' } })
    fireEvent.click(screen.getByRole('button', { name: '登録' }))
  }

  it('登録すると入力値をPOSTし、一覧・集計が再取得されて新しい収支が表示される (T13)', async () => {
    setupApi()
    const created: ApiEntry = { id: 9, date: '2026-10-20', type: '支出', amount: 500, category: '食費', memo: '' }
    vi.mocked(createEntry).mockResolvedValueOnce(created)
    // 再取得用に2回目の一覧で作成済みを返す
    let callCount = 0
    vi.mocked(fetchEntries).mockImplementation(() => {
      callCount += 1
      return Promise.resolve(callCount >= 2 ? [created] : [])
    })
    let summaryCalls = 0
    vi.mocked(fetchSummary).mockImplementation((month) => {
      summaryCalls += 1
      return Promise.resolve({
        month, incomeTotal: 0, expenseTotal: summaryCalls >= 2 ? 500 : 0,
        balance: summaryCalls >= 2 ? -500 : 0,
        expenseBreakdown: summaryCalls >= 2 ? [{ category: '食費', amount: 500, percentage: 100 }] : [],
      })
    })

    renderScreen()
    await screen.findByText('この月に登録されている収支はありません。')
    await fillNewEntryForm('2026-10-20', '500')

    await waitFor(() => expect(createEntry).toHaveBeenCalledTimes(1))
    expect(createEntry).toHaveBeenCalledWith({
      date: '2026-10-20',
      type: '支出',
      amount: 500,
      category: '食費',
      memo: '',
    })
    // 成功後はフォームが新規状態に戻る
    await waitFor(() => expect(screen.getByLabelText('金額')).toHaveValue(''))
    // 一覧・集計が再取得され、新しい収支が表示される
    await waitFor(() => expect(within(screen.getByRole('region', { name: '収支一覧' })).getByText('500円')).toBeInTheDocument())
    expect(screen.getByText('2026-10-20')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '月次集計' })).toHaveTextContent('500円')
    expect(fetchSummary).toHaveBeenCalledWith('2026-10')
  })

  it('表示月が10月のまま11月分を登録し、再取得は10月に対して行われる (T15)', async () => {
    setupApi()
    const created: ApiEntry = {
      id: 9,
      date: '2026-11-01',
      type: '支出',
      amount: 500,
      category: '食費',
      memo: '',
    }
    let registered = false
    vi.mocked(createEntry).mockImplementation(async () => { registered = true; return created })
    vi.mocked(fetchEntries).mockImplementation((month) => Promise.resolve(
      month === '2026-11' && registered ? [created] : [],
    ))

    renderScreen()
    await screen.findByText('この月に登録されている収支はありません。')
    await fillNewEntryForm('2026-11-01', '500')

    await waitFor(() => expect(createEntry).toHaveBeenCalledTimes(1))
    // 表示月は10月のまま、再取得も10月分
    await waitFor(() => expect(screen.getByText('2026年10月')).toBeInTheDocument())
    expect(vi.mocked(fetchEntries)).toHaveBeenCalledWith('2026-10')
    await waitFor(() => {
      expect(vi.mocked(fetchEntries)).toHaveBeenCalledWith('2026-10')
    })
    // 11月の一覧・集計の取得は発生しない
    const monthCalls = vi.mocked(fetchEntries).mock.calls.flat()
    expect(monthCalls).not.toContain('2026-11')
    // 10月分のデータには11月の収支は含まれない（モックが空を返す）
    expect(screen.queryByRole('listitem', { name: /2026-11-01/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '次月' }))
    await waitFor(() => expect(screen.getByRole('listitem', { name: /2026-11-01/ })).toBeInTheDocument())
  })

  it('登録成功後に再取得が失敗しても、登録済みであることを案内し再登録しない (T25)', async () => {
    setupApi()
    let entryCalls = 0
    vi.mocked(createEntry).mockResolvedValue({
      id: 9,
      date: '2026-10-20',
      type: '支出',
      amount: 500,
      category: '食費',
      memo: '',
    })
    vi.mocked(fetchEntries).mockImplementation(() => {
      entryCalls += 1
      if (entryCalls === 1) return Promise.resolve([])
      if (entryCalls === 2) {
        return Promise.reject(new ApiError('APIの呼び出しに失敗しました。しばらくしてから再試行してください。', 500))
      }
      return Promise.resolve([{ id: 9, date: '2026-10-20', type: '支出', amount: 500, category: '食費', memo: '' }])
    })

    renderScreen()
    await screen.findByText('この月に登録されている収支はありません。')
    await fillNewEntryForm('2026-10-20', '500')

    // 登録は成功済み。再取得失敗は登録と区別して案内する
    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('収支を登録しました。')
    expect(notice).toHaveTextContent('再取得に失敗しました。')
    // 再読み込みで回復する。登録APIは再送しない
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    await waitFor(() => expect(screen.getByText('500円')).toBeInTheDocument())
    // 成功したら案内は消える。保存済みのデータがそのまま表示される
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(createEntry).toHaveBeenCalledTimes(1)
    // 一覧APIは3回（初期・失敗・再読み込み）
    expect(entryCalls).toBeGreaterThanOrEqual(3)
  })

  it('削除成功後に集計の再取得が失敗しても、削除済みと案内し再削除しない (T25)', async () => {
    setupSingleEntryLike()
    let entryCalls = 0
    vi.mocked(fetchEntries).mockImplementation(() => {
      entryCalls += 1
      return Promise.resolve(entryCalls === 1 ? api.entries : [])
    })
    api.summary = {
      month: '2026-10', incomeTotal: 0, expenseTotal: 500, balance: -500,
      expenseBreakdown: [{ category: '食費', amount: 500, percentage: 100 }],
    }
    let summaryCalls = 0
    vi.mocked(fetchSummary).mockImplementation((month) => {
      summaryCalls += 1
      if (summaryCalls === 2) return Promise.reject(new ApiError('集計の取得に失敗しました。', 500))
      return Promise.resolve(summaryCalls === 1 ? api.summary : emptySummary(month))
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-10/ })
    fireEvent.click(within(row).getByRole('button', { name: '削除' }))
    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('収支を削除しました。')
    expect(notice).toHaveTextContent('再取得に失敗しました。')
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(deleteEntry).toHaveBeenCalledTimes(1)
    expect(screen.getByText('この月に登録されている収支はありません。')).toBeInTheDocument()
  })
})

describe('編集 (T14・T15)', () => {
  const existing: ApiEntry = {
    id: 5,
    date: '2026-10-15',
    type: '収入',
    amount: 250000,
    category: '給与',
    memo: '10月分の給与',
  }

  it('編集フォームは既存値で開き、保存するとPUTされ一覧・集計が更新される (T14)', async () => {
    api.entries = [existing]
    setupApi()
    const updated: ApiEntry = { ...existing, amount: 300000, memo: '訂正後のメモ' }
    vi.mocked(updateEntry).mockResolvedValueOnce(updated)
    let callCount = 0
    vi.mocked(fetchEntries).mockImplementation(() => {
      callCount += 1
      return Promise.resolve(callCount >= 2 ? [updated] : [existing])
    })
    vi.mocked(fetchSummary).mockImplementation((month) => Promise.resolve({
      month, incomeTotal: callCount >= 2 ? 300000 : 250000, expenseTotal: 0,
      balance: callCount >= 2 ? 300000 : 250000, expenseBreakdown: [],
    }))

    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-15/ })
    fireEvent.click(within(row).getByRole('button', { name: '編集' }))

    // 既存の値が入った状態で開く
    expect(screen.getByLabelText('日付')).toHaveValue('2026-10-15')
    expect(screen.getByLabelText('種別')).toHaveValue('収入')
    expect(screen.getByLabelText('金額')).toHaveValue('250000')
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('給与')
    expect(screen.getByLabelText('メモ')).toHaveValue('10月分の給与')

    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '300000' } })
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '訂正後のメモ' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(updateEntry).toHaveBeenCalledTimes(1))
    expect(updateEntry).toHaveBeenCalledWith(5, {
      date: '2026-10-15',
      type: '収入',
      amount: 300000,
      category: '給与',
      memo: '訂正後のメモ',
    })
    // 更新データの一覧に差し替わる
    await waitFor(() => expect(within(screen.getByRole('region', { name: '収支一覧' })).getByText('300,000円')).toBeInTheDocument())
    expect(screen.getByRole('region', { name: '月次集計' })).toHaveTextContent('300,000円')
    expect(screen.getByText('訂正後のメモ')).toBeInTheDocument()
  })

  it('編集キャンセルはAPIを呼ばず新規フォームへ戻る (T14)', async () => {
    api.entries = [existing]
    setupApi()
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-15/ })
    fireEvent.click(within(row).getByRole('button', { name: '編集' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    // キャンセルで編集モードが解除され、更新APIは呼ばれない
    await waitFor(() => expect(screen.getByRole('button', { name: '登録' })).toBeInTheDocument())
    expect(updateEntry).not.toHaveBeenCalled()
  })

  it('編集モードで不正日付の検証に失敗してもAPIを呼ばない', async () => {
    api.entries = [existing]
    setupApi()
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-15/ })
    fireEvent.click(within(row).getByRole('button', { name: '編集' }))
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '1.5' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('金額は1以上の整数（円）で入力してください。')).toBeInTheDocument()
    expect(updateEntry).not.toHaveBeenCalled()
  })

  it('編集成功後に集計の再取得が失敗しても、更新済みと案内しPUTを再送しない (T25)', async () => {
    api.entries = [existing]
    setupApi()
    const updated: ApiEntry = { ...existing, amount: 300000, memo: '更新済み' }
    vi.mocked(updateEntry).mockResolvedValue(updated)
    let entryCalls = 0
    vi.mocked(fetchEntries).mockImplementation(() => {
      entryCalls += 1
      return Promise.resolve(entryCalls === 1 ? [existing] : [updated])
    })
    let summaryCalls = 0
    vi.mocked(fetchSummary).mockImplementation((month) => {
      summaryCalls += 1
      if (summaryCalls === 2) return Promise.reject(new ApiError('集計の取得に失敗しました。', 500))
      return Promise.resolve({
        month, incomeTotal: summaryCalls === 1 ? 250000 : 300000,
        expenseTotal: 0, balance: summaryCalls === 1 ? 250000 : 300000, expenseBreakdown: [],
      })
    })

    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-15/ })
    fireEvent.click(within(row).getByRole('button', { name: '編集' }))
    fireEvent.change(screen.getByLabelText('金額'), { target: { value: '300000' } })
    fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '更新済み' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('収支を更新しました。')
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(updateEntry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('region', { name: '月次集計' })).toHaveTextContent('300,000円')
    expect(screen.getByText('更新済み')).toBeInTheDocument()
  })

  it('編集で日付を11月へ動かした場合も、表示月(10月)の一覧・集計が再取得される (T15)', async () => {
    api.entries = [existing]
    const movedToNovember: ApiEntry = { ...existing, date: '2026-11-01' }
    setupApi()
    let moved = false
    vi.mocked(fetchEntries).mockImplementation((month) => Promise.resolve(
      month === '2026-10' ? (moved ? [] : [existing]) : (moved ? [movedToNovember] : []),
    ))
    vi.mocked(fetchSummary).mockImplementation((month) => Promise.resolve(
      month === '2026-11' && moved
        ? { month, incomeTotal: 250000, expenseTotal: 0, balance: 250000, expenseBreakdown: [] }
        : emptySummary(month),
    ))
    vi.mocked(updateEntry).mockImplementation(async () => { moved = true; return movedToNovember })

    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-15/ })
    fireEvent.click(within(row).getByRole('button', { name: '編集' }))
    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-11-01' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(updateEntry).toHaveBeenCalledTimes(1))
    // 表示月は10月のまま。11月の取得は発生しない
    await waitFor(() => {
      expect(screen.getByText('2026年10月')).toBeInTheDocument()
    })
    const calls = vi.mocked(fetchEntries).mock.calls.flat()
    expect(calls).not.toContain('2026-11')
    await waitFor(() => expect(screen.getByText('この月に登録されている収支はありません。')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '次月' }))
    await waitFor(() => expect(screen.getByRole('listitem', { name: /2026-11-01/ })).toBeInTheDocument())
    expect(screen.getByRole('listitem', { name: /2026-11-01/ })).toHaveTextContent('250,000円')
    expect(screen.getByRole('region', { name: '月次集計' })).toHaveTextContent('250,000円')
  })
})

describe('削除 (T16・T17)', () => {
  const single: ApiEntry = { id: 7, date: '2026-10-10', type: '支出', amount: 500, category: '食費', memo: '' }

  function setupSingleEntry() {
    api.entries = [single]
    setupApi()
    let callCount = 0
    vi.mocked(fetchEntries).mockImplementation(() => {
      callCount += 1
      return Promise.resolve(callCount >= 2 ? [] : [single])
    })
  }

  it('削除確認をキャンセルすると削除されない (T16)', async () => {
    setupSingleEntry()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-10/ })
    const entryCallCount = vi.mocked(fetchEntries).mock.calls.length
    const summaryCallCount = vi.mocked(fetchSummary).mock.calls.length
    fireEvent.click(within(row).getByRole('button', { name: '削除' }))

    // 日本語の確認ダイアログが表示され、キャンセルでは削除しない
    expect(confirmSpy).toHaveBeenCalledWith('この収支を削除しますか？よろしければ削除を実行します。')
    expect(deleteEntry).not.toHaveBeenCalled()
    expect(fetchEntries).toHaveBeenCalledTimes(entryCallCount)
    expect(fetchSummary).toHaveBeenCalledTimes(summaryCallCount)
    await waitFor(() => expect(screen.getByRole('listitem', { name: /2026-10-10/ })).toBeInTheDocument())
  })

  it('削除を確定するとDELETEされ、一覧・集計が更新される (T16)', async () => {
    const remaining: ApiEntry = { id: 8, date: '2026-10-09', type: '支出', amount: 400, category: '交通費', memo: '' }
    api.entries = [single, remaining]
    api.summary = {
      month: '2026-10', incomeTotal: 0, expenseTotal: 900, balance: -900,
      expenseBreakdown: [{ category: '食費', amount: 500, percentage: 55.6 }, { category: '交通費', amount: 400, percentage: 44.4 }],
    }
    setupApi()
    let listCalls = 0
    vi.mocked(fetchEntries).mockImplementation(() => {
      listCalls += 1
      return Promise.resolve(listCalls === 1 ? [single, remaining] : [remaining])
    })
    vi.mocked(fetchSummary).mockImplementation(() => Promise.resolve({
      month: '2026-10', incomeTotal: 0, expenseTotal: 400, balance: -400,
      expenseBreakdown: [{ category: '交通費', amount: 400, percentage: 100 }],
    }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-10/ })
    fireEvent.click(within(row).getByRole('button', { name: '削除' }))

    await waitFor(() => expect(deleteEntry).toHaveBeenCalledTimes(1))
    expect(deleteEntry).toHaveBeenCalledWith(7)
    // 2回目の一覧で空になった結果を表示する
    await waitFor(() => expect(screen.queryByRole('listitem', { name: /2026-10-10/ })).not.toBeInTheDocument())
    expect(screen.getByRole('listitem', { name: /2026-10-09/ })).toBeInTheDocument()
    const region = screen.getByRole('region', { name: '月次集計' })
    expect(within(region).getAllByText('400円').length).toBeGreaterThanOrEqual(1)
    expect(within(region).getByText('交通費')).toBeInTheDocument()
    expect(fetchEntries).toHaveBeenCalledTimes(2)
    expect(fetchSummary).toHaveBeenCalledTimes(2)
  })

  it('最後の1件を削除すると一覧・集計が0円へ更新される (T17)', async () => {
    setupSingleEntry()
    api.summary = {
      month: '2026-10', incomeTotal: 0, expenseTotal: 500, balance: -500,
      expenseBreakdown: [{ category: '食費', amount: 500, percentage: 100 }],
    }
    let summaryCalls = 0
    vi.mocked(fetchSummary).mockImplementation((month) => {
      summaryCalls += 1
      return Promise.resolve(summaryCalls === 1 ? api.summary : emptySummary(month))
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-10/ })
    expect(screen.getByRole('region', { name: '月次集計' })).toHaveTextContent('500円')
    fireEvent.click(within(row).getByRole('button', { name: '削除' }))
    await waitFor(() => expect(screen.getByText('この月に登録されている収支はありません。')).toBeInTheDocument())
    const region = screen.getByRole('region', { name: '月次集計' })
    expect(within(region).getAllByText('0円').length).toBeGreaterThanOrEqual(3)
    expect(within(region).getByText('支出の内訳はありません。')).toBeInTheDocument()
  })

  it.each([
    ['404', new ApiError('対象の収支が存在しません。すでに削除された可能性があります。', 404)],
    ['500', new ApiError('APIの呼び出しに失敗しました。しばらくしてから再試行してください。', 500)],
    ['通信失敗', new ApiError('APIの呼び出しに失敗しました。通信状態を確認してください。', 0)],
  ])('削除の%s失敗では日本語エラーを表示し、対象を消さない (T22)', async (_kind, error) => {
    setupSingleEntry()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(deleteEntry).mockRejectedValueOnce(error)
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-10/ })
    fireEvent.click(within(row).getByRole('button', { name: '削除' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(error.message)
    // 再取得は発生せず、収支は残る
    expect(screen.getByRole('listitem', { name: /2026-10-10/ })).toBeInTheDocument()
    expect(mockSignOut).not.toHaveBeenCalled()
  })
})

describe('認証失効と日本語文言 (T20・T21・T28)', () => {
  it('APIが401（セッション失効）ならサインアウトしてログイン画面へ戻る準備をする (T21)', async () => {
    api.entriesError = new AccessTokenRefreshError()
    setupApi()
    renderScreen()

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
  })

  it('削除で認証失効した場合もサインアウトする (T21)', async () => {
    setupSingleEntryLike()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(deleteEntry).mockRejectedValueOnce(new AccessTokenRefreshError())
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-10/ })
    fireEvent.click(within(row).getByRole('button', { name: '削除' }))

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1))
  })

  it('通常・空状態を含む画面文言は日本語で、入力ラベルと関連付いている (T28)', async () => {
    setupApi()
    renderScreen()

    // 見出し・ボタン・月表記
    expect(await screen.findByRole('heading', { name: '家計簿 月次画面' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '前月' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '次月' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
    expect(screen.getByText('2026年10月')).toBeInTheDocument()

    // フォームのラベル
    for (const label of ['日付', '種別', '金額', 'カテゴリ', 'メモ']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('メモは任意です。')).toBeInTheDocument()

    // 空状態・集計の案内
    expect(await screen.findByText('この月に登録されている収支はありません。')).toBeInTheDocument()
    expect(screen.getByText('支出の内訳はありません。')).toBeInTheDocument()
  })

  it('入力エラーも日本語で、対象欄と関連付けられている (T28)', async () => {
    setupApi()
    renderScreen()
    await screen.findByText('この月に登録されている収支はありません。')
    fireEvent.click(screen.getByRole('button', { name: '登録' }))
    const date = screen.getByLabelText('日付')
    expect(await screen.findByText('日付は必須です。')).toBeInTheDocument()
    expect(date).toHaveAttribute('aria-invalid', 'true')
    expect(date).toHaveAttribute('aria-describedby', 'entry-date-error')
  })
})

/** single エントリを使うテストのための共通の準備（削除系） */
function setupSingleEntryLike() {
  api.entries = [{ id: 7, date: '2026-10-10', type: '支出', amount: 500, category: '食費', memo: '' }]
  setupApi()
}

/** 遅延Promiseをエントリ配列で解決するヘルパー */
function resolveEntries(pending: ReturnType<typeof deferred<ApiEntry[]>>, value: ApiEntry[]) {
  pending.resolve(value)
}

/** createEntryの遅延応答を設定するヘルパー */
function createEntryConnPonent(promise: Promise<ApiEntry>) {
  vi.mocked(createEntry).mockReturnValueOnce(promise)
}
