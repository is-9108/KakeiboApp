import { MemoryRouter } from 'react-router-dom'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AppHome from './AppHome'
import { AccessTokenRefreshError, ApiError, ApiValidationError, createEntry, fetchEntries, fetchSummary, fetchReceiptAnalysis, requestReceiptUploadUrl, uploadReceiptToS3, updateEntry, type ApiReceiptAnalysis } from '../api/client'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut }) }))
vi.mock('../domain/month', async original => ({ ...await original<typeof import('../domain/month')>(), currentMonthJst: () => '2026-10' }))
vi.mock('../api/client', async original => ({
  ...await original<typeof import('../api/client')>(),
  fetchEntries: vi.fn(), fetchSummary: vi.fn(), createEntry: vi.fn(), updateEntry: vi.fn(),
  fetchReceiptAnalysis: vi.fn(), requestReceiptUploadUrl: vi.fn(), uploadReceiptToS3: vi.fn(),
}))
const analysis: ApiReceiptAnalysis = { id: 'job-1', status: '完了', date: '2026-09-21', amount: 1234, category: '食費', storeName: 'スーパー', createdAt: '', updatedAt: '' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchEntries).mockResolvedValue([])
  vi.mocked(fetchSummary).mockResolvedValue({ month: '2026-10', incomeTotal: 0, expenseTotal: 0, balance: 0, expenseBreakdown: [] })
  vi.mocked(requestReceiptUploadUrl).mockResolvedValue({ jobId: 'job-1', uploadUrl: 'https://s3.example', key: '', headers: {}, expiresAt: '' })
  vi.mocked(uploadReceiptToS3).mockResolvedValue()
  vi.mocked(fetchReceiptAnalysis).mockResolvedValue(analysis)
  vi.mocked(createEntry).mockImplementation(async input => ({ id: 1, ...input }))
})
afterEach(() => vi.useRealTimers())
async function home() {
  const view = render(<MemoryRouter><AppHome /></MemoryRouter>)
  await screen.findByRole('heading', { name: '収支の登録' })
  return view
}
async function upload() {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('レシート画像'), { target: { files: [new File(['a'], 'receipt.png', { type: 'image/png' })] } })
  })
}
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
function expectValues(values = { date: '2026-09-21', amount: '1234', category: '食費', memo: 'スーパー', type: '支出' }) {
  for (const [key, label] of Object.entries({ date: '日付', amount: '金額', category: 'カテゴリ', memo: 'メモ', type: '種別' })) {
    expect(screen.getByLabelText(label)).toHaveValue(values[key as keyof typeof values])
  }
}
it('アップロード完了直後から解析中を表示し再アップロードを無効にする', async () => {
  vi.mocked(fetchReceiptAnalysis).mockResolvedValue({ ...analysis, status: '待機中' })
  await home()
  vi.useFakeTimers()
  await upload()
  expect(screen.getByText('レシートを解析しています…')).toHaveAttribute('role', 'status')
  expect(fetchReceiptAnalysis).toHaveBeenCalledWith('job-1')
  expect(screen.getByRole('button', { name: 'レシートから登録' })).toBeDisabled()
  await advance(2000)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(2)
})
it('完了時に新規フォームへ反映するが自動登録せず、取得を停止する', async () => {
  await home()
  vi.useFakeTimers()
  await upload()
  expectValues()
  expect(screen.getByText('レシートの解析結果です。内容を確認・修正してから登録してください。')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '収支の登録' })).toBeInTheDocument()
  expect(createEntry).not.toHaveBeenCalled()
  expect(updateEntry).not.toHaveBeenCalled()
  await advance(60000)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(1)
})
it.each(['date', 'amount', 'category', 'storeName', '全項目'] as const)('%sが読み取れない場合に既定値を補わず空欄にする', async field => {
  vi.mocked(fetchReceiptAnalysis).mockResolvedValue({ ...analysis, ...(field === '全項目' ? { date: null, amount: null, category: null, storeName: null } : { [field]: null }) })
  await home()
  await upload()
  const values = { date: '2026-09-21', amount: '1234', category: '食費', memo: 'スーパー', type: '支出' }
  if (field === '全項目') Object.assign(values, { date: '', amount: '', category: '', memo: '' })
  else values[field === 'storeName' ? 'memo' : field] = ''
  expectValues(values)
  expect(createEntry).not.toHaveBeenCalled()
})
it('修正後の値を既存APIで一度だけ登録し、下書き解除と表示月の再取得を行う', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof createEntry>>) => void
  vi.mocked(createEntry).mockReturnValue(new Promise(done => { resolve = done }))
  await home()
  await upload()
  for (const [label, value] of [['日付', '2026-09-22'], ['金額', '1500'], ['カテゴリ', '外食費'], ['メモ', '修正した店名']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  const button = screen.getByRole('button', { name: '登録する' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(createEntry).toHaveBeenCalledTimes(1)
  const payload = { date: '2026-09-22', amount: 1500, category: '外食費', memo: '修正した店名', type: '支出' }
  expect(createEntry).toHaveBeenCalledWith(payload)
  expect(updateEntry).not.toHaveBeenCalled()
  await act(async () => resolve({ id: 1, ...payload }))
  expect(screen.queryByText('レシートの解析結果です。内容を確認・修正してから登録してください。')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'キャンセル' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('金額')).toHaveValue('')
  expect(fetchEntries).toHaveBeenLastCalledWith('2026-10')
  expect(fetchEntries).toHaveBeenCalledTimes(2)
})
it('未読取の必須項目を既存バリデーションで止める', async () => {
  vi.mocked(fetchReceiptAnalysis).mockResolvedValue({ ...analysis, date: null, amount: null, category: null })
  await home()
  await upload()
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  expect(screen.getByText('日付を入力してください。')).toBeInTheDocument()
  expect(screen.getByText('金額を入力してください。')).toBeInTheDocument()
  expect(screen.getByText('カテゴリを選択してください。')).toBeInTheDocument()
  expect(createEntry).not.toHaveBeenCalled()
})
it('未読取の下書きの項目エラーはキャンセルで解除する', async () => {
  vi.mocked(fetchReceiptAnalysis).mockResolvedValue({ ...analysis, date: null, amount: null, category: null })
  await home()
  await upload()
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  expect(screen.getAllByRole('alert')).toHaveLength(3)
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  for (const label of ['日付', '金額', 'カテゴリ']) expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('日付')).toHaveValue('2026-10-01')
})
it('解析失敗後に手入力へ切り替えると項目エラーも解除する', async () => {
  vi.mocked(fetchReceiptAnalysis).mockResolvedValue({ ...analysis, status: '失敗' })
  await home()
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  expect(screen.getByText('金額を入力してください。')).toBeInTheDocument()
  expect(screen.getByText('カテゴリを選択してください。')).toBeInTheDocument()
  await upload()
  fireEvent.click(screen.getByRole('button', { name: '手入力に切り替える' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  for (const label of ['日付', '金額', 'カテゴリ']) expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid', 'true')
})
it.each(['失敗', '期限切れ'])('%s後にそのまま手入力で登録すると警告を解除する', async failure => {
  vi.mocked(fetchReceiptAnalysis).mockResolvedValue({ ...analysis, status: failure === '失敗' ? '失敗' : '待機中' })
  await home()
  vi.useFakeTimers()
  await upload()
  if (failure === '期限切れ') await advance(60000)
  expect(screen.getByRole('alert')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('金額'), { target: { value: '500' } })
  fireEvent.change(screen.getByLabelText('カテゴリ'), { target: { value: '食費' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '登録する' })) })
  expect(createEntry).toHaveBeenCalledTimes(1)
  expect(screen.getByText('収支を登録しました。')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '手入力に切り替える' })).not.toBeInTheDocument()
})
it('下書きでも種別変更時にカテゴリを解除する', async () => {
  await home()
  await upload()
  fireEvent.change(screen.getByLabelText('種別'), { target: { value: '収入' } })
  expect(screen.getByLabelText('カテゴリ')).toHaveValue('')
})
it('登録APIの400を既存の日本語エラーに変換し下書きを保持する', async () => {
  vi.mocked(createEntry).mockRejectedValue(new ApiValidationError({ Amount: ['Amount must be between 1 and 2147483647.'] }))
  await home()
  await upload()
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  expect(screen.getByRole('alert')).toHaveTextContent('金額は1円以上2,147,483,647円以下で入力してください。')
  expectValues()
  expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument()
})
it.each(['完了', '待機中'] as const)('%s時にキャンセルすると値を破棄して取得も登録もしない', async status => {
  vi.mocked(fetchReceiptAnalysis).mockResolvedValue({ ...analysis, status })
  await home()
  vi.useFakeTimers()
  await upload()
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  expect(screen.getByLabelText('金額')).toHaveValue('')
  expect(screen.getByLabelText('メモ')).toHaveValue('')
  expect(screen.queryByText('レシートを解析しています…')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'キャンセル' })).not.toBeInTheDocument()
  expect(screen.queryByText('レシートの解析結果です。内容を確認・修正してから登録してください。')).not.toBeInTheDocument()
  const calls = vi.mocked(fetchReceiptAnalysis).mock.calls.length
  await advance(60000)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(calls)
  expect(createEntry).not.toHaveBeenCalled()
})
it.each(['失敗', '404', 'タイムアウト'])('%sは警告を表示し空のフォームへ手入力で切り替えられる', async failure => {
  if (failure === '404') vi.mocked(fetchReceiptAnalysis).mockRejectedValue(new ApiError('不明', 404))
  else vi.mocked(fetchReceiptAnalysis).mockResolvedValue({ ...analysis, status: failure === '失敗' ? '失敗' : '待機中' })
  await home()
  fireEvent.change(screen.getByLabelText('メモ'), { target: { value: '入力途中' } })
  vi.useFakeTimers()
  await upload()
  if (failure === 'タイムアウト') {
    await advance(59000)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await advance(1000)
  }
  expect(screen.getByRole('alert')).toHaveTextContent(failure === 'タイムアウト' ? '解析が時間内に完了しませんでした。' : 'レシートの解析に失敗しました。')
  const calls = vi.mocked(fetchReceiptAnalysis).mock.calls.length
  vi.mocked(fetchReceiptAnalysis).mockResolvedValue(analysis)
  await advance(60000)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(calls)
  fireEvent.click(screen.getByRole('button', { name: '手入力に切り替える' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByLabelText('日付')).toHaveValue('2026-10-01')
  expect(screen.getByLabelText('金額')).toHaveValue('')
  expect(screen.getByLabelText('カテゴリ')).toHaveValue('')
  expect(screen.getByLabelText('メモ')).toHaveValue('')
  expect(createEntry).not.toHaveBeenCalled()
})
it('一時的な通信エラー後の再取得で完了結果を反映する', async () => {
  vi.mocked(fetchReceiptAnalysis).mockRejectedValueOnce(new TypeError('通信断')).mockResolvedValue(analysis)
  await home()
  vi.useFakeTimers()
  await upload()
  expect(screen.getByText('レシートを解析しています…')).toBeInTheDocument()
  await advance(2000)
  expectValues()
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(2)
})
it('解析結果の401で一度だけログアウトする', async () => {
  vi.mocked(fetchReceiptAnalysis).mockRejectedValue(new AccessTokenRefreshError())
  await home()
  vi.useFakeTimers()
  await upload()
  await advance(60000)
  expect(signOut).toHaveBeenCalledTimes(1)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(1)
})
it('画面を離れると取得を停止し遅延応答も登録しない', async () => {
  let resolve!: (value: ApiReceiptAnalysis) => void
  vi.mocked(fetchReceiptAnalysis).mockReturnValue(new Promise(done => { resolve = done }))
  const view = await home()
  vi.useFakeTimers()
  await upload()
  view.unmount()
  await act(async () => resolve(analysis))
  await advance(60000)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(1)
  expect(createEntry).not.toHaveBeenCalled()
})
it('編集中はアップロードを無効にし、解析待ち中に編集へ切り替えると結果を破棄する', async () => {
  vi.mocked(fetchEntries).mockResolvedValue([{ id: 1, date: '2026-10-21', amount: 500, category: '食費', type: '支出', memo: '編集対象' }])
  let resolve!: (value: ApiReceiptAnalysis) => void
  vi.mocked(fetchReceiptAnalysis).mockReturnValue(new Promise(done => { resolve = done }))
  await home()
  vi.useFakeTimers()
  await upload()
  fireEvent.click(screen.getByRole('button', { name: /の収支を編集$/ }))
  expect(screen.getByRole('button', { name: 'レシートから登録' })).toBeDisabled()
  expect(screen.queryByText('レシートを解析しています…')).not.toBeInTheDocument()
  await act(async () => resolve(analysis))
  expect(screen.getByLabelText('メモ')).toHaveValue('編集対象')
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  await advance(60000)
  expect(screen.getByLabelText('金額')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'レシートから登録' })).toBeEnabled()
  expect(createEntry).not.toHaveBeenCalled()
})

it('保存通信中の完了結果は保存終了後までフォームへの反映を保留する', async () => {
  let complete!: (value: ApiReceiptAnalysis) => void
  let saved!: (value: Awaited<ReturnType<typeof createEntry>>) => void
  vi.mocked(fetchReceiptAnalysis).mockReturnValue(new Promise(done => { complete = done }))
  vi.mocked(createEntry).mockReturnValue(new Promise(done => { saved = done }))
  await home()
  fireEvent.change(screen.getByLabelText('金額'), { target: { value: '500' } })
  fireEvent.change(screen.getByLabelText('カテゴリ'), { target: { value: '食費' } })
  await upload()
  fireEvent.click(screen.getByRole('button', { name: '登録する' }))
  await act(async () => complete(analysis))
  expect(screen.getByLabelText('金額')).toHaveValue('500')
  await act(async () => saved({ id: 1, date: '2026-10-01', amount: 500, type: '支出', category: '食費', memo: '' }))
  expectValues()
  expect(createEntry).toHaveBeenCalledTimes(1)
})
it('PUT中に編集を始めてもアップロード完了の通知で編集内容を上書きしない', async () => {
  vi.mocked(fetchEntries).mockResolvedValue([{ id: 1, date: '2026-10-21', amount: 500, category: '食費', type: '支出', memo: '編集対象' }])
  let resolve!: () => void
  vi.mocked(uploadReceiptToS3).mockReturnValue(new Promise(done => { resolve = done }))
  await home()
  await upload()
  fireEvent.click(screen.getByRole('button', { name: /の収支を編集$/ }))
  await act(async () => resolve())
  expect(fetchReceiptAnalysis).not.toHaveBeenCalled()
  expect(screen.getByLabelText('メモ')).toHaveValue('編集対象')
  fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
  expect(screen.getByLabelText('金額')).toHaveValue('')
  expect(screen.queryByText('レシート画像をアップロードしました。')).not.toBeInTheDocument()
})

it('PUT完了時点から59秒では警告せず60秒で期限切れにする', async () => {
  let resolve!: () => void
  vi.mocked(uploadReceiptToS3).mockReturnValue(new Promise(done => { resolve = done }))
  vi.mocked(fetchReceiptAnalysis).mockResolvedValue({ ...analysis, status: '待機中' })
  await home()
  vi.useFakeTimers()
  await upload()
  await advance(30000)
  expect(fetchReceiptAnalysis).not.toHaveBeenCalled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await act(async () => resolve())
  await advance(59000)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await advance(1000)
  expect(screen.getByRole('alert')).toHaveTextContent('解析が時間内に完了しませんでした。')
})
