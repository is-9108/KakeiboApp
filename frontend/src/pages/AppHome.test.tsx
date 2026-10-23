import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    // 前月データの一覧が表示されている
    await waitFor(() => expect(screen.getByText('この月に登録されている収支はありません。')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '次月' }))
    await waitFor(() => expect(screen.getByText('2026年10月')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('A月のデータ')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '次月' }))
    await waitFor(() => expect(screen.getByText('2026年11月')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('B月のデータ')).toBeInTheDocument())
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
      { id: 2, date: '2026-10-15', type: '収入', amount: 250000, category: '給与', memo: '10月分' },
      { id: 1, date: '2026-10-01', type: '支出', amount: 800, category: '交通費', memo: '' },
    ]
    setupApi()
    renderScreen()

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('2026-10-23')
    expect(rows[1]).toHaveTextContent('2026-10-15')
    expect(rows[2]).toHaveTextContent('2026-10-01')
    expect(rows[0]).toHaveTextContent('1,500円')
    expect(rows[1]).toHaveTextContent('250,000円')
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

  it('支出のみの月は負の差額を表示する (T7)', async () => {
    api.summary = {
      month: '2026-10',
      incomeTotal: 0,
      expenseTotal: 1000,
      balance: -1000,
      expenseBreakdown: [{ category: '交通費', amount: 1000, percentage: 100 }],
    }
    setupApi()
    renderScreen()

    await screen.findByRole('region', { name: '月次集計' })
    expect(screen.getAllByText('-1,000円').length).toBeGreaterThan(0)
    expect(screen.getByText('100.0%')).toBeInTheDocument()
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
    await waitFor(() => expect(screen.getByText('500円')).toBeInTheDocument())
    expect(screen.getByText('2026-10-20')).toBeInTheDocument()
  })

  it('表示月が10月のまま11月分を登録し、再取得は10月に対して行われる (T15)', async () => {
    setupApi()
    vi.mocked(createEntry).mockResolvedValue({
      id: 9,
      date: '2026-11-01',
      type: '支出',
      amount: 500,
      category: '食費',
      memo: '',
    })

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
    const updated: ApiEntry = { ...existing, amount: 300000, memo: '11月分に訂正' }
    vi.mocked(updateEntry).mockResolvedValueOnce(updated)
    let callCount = 0
    vi.mocked(fetchEntries).mockImplementation(() => {
      callCount += 1
      return Promise.resolve(callCount >= 2 ? [updated] : [existing])
    })

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
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(updateEntry).toHaveBeenCalledTimes(1))
    expect(updateEntry).toHaveBeenCalledWith(5, {
      date: '2026-10-15',
      type: '収入',
      amount: 300000,
      category: '給与',
      memo: '10月分の給与',
    })
    // 更新データの一覧に差し替わる
    await waitFor(() => expect(screen.getByText('300,000円')).toBeInTheDocument())
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

  it('編集で日付を11月へ動かした場合も、表示月(10月)の一覧・集計が再取得される (T15)', async () => {
    api.entries = [existing]
    setupApi()
    const movedToNovember: ApiEntry = { ...existing, date: '2026-11-01' }
    vi.mocked(updateEntry).mockResolvedValueOnce(movedToNovember)

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
    const updatedRow = screen.queryByRole('listitem', { name: /2026-10-15/ })
    expect(updatedRow).not.toBeNull()
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
    fireEvent.click(within(row).getByRole('button', { name: '削除' }))

    // 日本語の確認ダイアログが表示され、キャンセルでは削除しない
    expect(confirmSpy).toHaveBeenCalledWith('この収支を削除しますか？よろしければ削除を実行します。')
    expect(deleteEntry).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByRole('listitem', { name: /2026-10-10/ })).toBeInTheDocument())
  })

  it('削除を確定するとDELETEされ、一覧・集計が更新される (T16)', async () => {
    setupSingleEntry()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-10/ })
    fireEvent.click(within(row).getByRole('button', { name: '削除' }))

    await waitFor(() => expect(deleteEntry).toHaveBeenCalledTimes(1))
    expect(deleteEntry).toHaveBeenCalledWith(7)
    // 2回目の一覧で空になった結果を表示する
    await waitFor(() => expect(screen.getByText('この月に登録されている収支はありません。')).toBeInTheDocument())
    const region = screen.getByRole('region', { name: '月次集計' })
    expect(within(region).getAllByText('0円').length).toBeGreaterThanOrEqual(3)
    expect(within(region).getByText('支出の内訳はありません。')).toBeInTheDocument()
  })

  it('削除に失敗したら日本語エラーを表示し、対象を消さない (T22)', async () => {
    setupSingleEntry()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(deleteEntry).mockRejectedValueOnce(new ApiError('対象の収支が存在しません。すでに削除された可能性があります。', 404))
    renderScreen()
    const row = await screen.findByRole('listitem', { name: /2026-10-10/ })
    fireEvent.click(within(row).getByRole('button', { name: '削除' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('対象の収支が存在しません。すでに削除された可能性があります。')
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

  it('画面の文言は日本語で統一されている (T28)', async () => {
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
