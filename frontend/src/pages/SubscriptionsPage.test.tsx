import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SubscriptionsPage from './SubscriptionsPage'
import {
  AccessTokenRefreshError, ApiError, ApiValidationError,
  fetchSubscriptions, createSubscription, updateSubscription, deleteSubscription,
  type ApiSubscription,
} from '../api/client'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ signOut }) }))
vi.mock('../api/client', async (original) => ({
  ...await original<typeof import('../api/client')>(),
  fetchSubscriptions: vi.fn(), createSubscription: vi.fn(), updateSubscription: vi.fn(), deleteSubscription: vi.fn(),
}))
const video = { id: 1, name: '動画', amount: 1200, memo: '家族用' }
const music = { id: 2, name: '音楽', amount: 1000, memo: '' }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function renderPage() { return render(<MemoryRouter><SubscriptionsPage /></MemoryRouter>) }
async function ready() { renderPage(); await screen.findByRole('heading', { name: 'サブスク一覧' }) }
function edit() { fireEvent.click(screen.getByRole('button', { name: '動画 のサブスクを編集' })) }
function openDelete() { fireEvent.click(screen.getByRole('button', { name: '動画 のサブスクを削除' })) }
function fill() {
  fireEvent.change(screen.getByLabelText('名前'), { target: { value: '新しい動画' } })
  fireEvent.change(screen.getByLabelText('金額'), { target: { value: '1500' } })
  fireEvent.change(screen.getByLabelText('メモ'), { target: { value: 'メモ' } })
}
const save = () => fireEvent.click(screen.getByRole('button', { name: '保存する' }))
const confirmDelete = () => fireEvent.click(screen.getByRole('button', { name: '削除する' }))

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(fetchSubscriptions).mockResolvedValue([video, music])
  vi.mocked(createSubscription).mockImplementation(async (payload) => ({ id: 3, ...payload }))
  vi.mocked(updateSubscription).mockImplementation(async (id, payload) => ({ id, ...payload }))
  vi.mocked(deleteSubscription).mockResolvedValue(undefined)
  signOut.mockResolvedValue(undefined)
})

describe('サブスク管理画面（F12、F16〜F26）', () => {
  it('APIの順で名前と金額と空でないメモを表示する', async () => {
    await ready()
    const list = screen.getByRole('list')
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('動画1,200円家族用')
    expect(rows[1]).toHaveTextContent('音楽1,000円')
    expect(rows[1].querySelector('.subscription-list__memo')).toBeNull()
    expect(within(rows[0]).getByRole('button', { name: '動画 のサブスクを編集' })).toBeInTheDocument()
    expect(within(rows[1]).getByRole('button', { name: '音楽 のサブスクを削除' })).toBeInTheDocument()
  })
  it('未登録なら空の案内を表示する', async () => {
    vi.mocked(fetchSubscriptions).mockResolvedValue([])
    await ready()
    expect(screen.getByText('登録されたサブスクはありません。')).toBeInTheDocument()
  })
  it('登録後に一覧を再取得してフォームを空に戻す', async () => {
    await ready(); fill()
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))
    expect(await screen.findByText('サブスクを登録しました。')).toBeInTheDocument()
    expect(createSubscription).toHaveBeenCalledTimes(1)
    expect(createSubscription).toHaveBeenCalledWith({ name: '新しい動画', amount: 1500, memo: 'メモ' })
    expect(fetchSubscriptions).toHaveBeenCalledTimes(2)
    await screen.findByRole('heading', { name: 'サブスク一覧' })
    expect(screen.getByLabelText('名前')).toHaveValue('')
  })
  it('編集開始で値とフォーカスを移し保存後に再取得する', async () => {
    await ready(); edit()
    expect(screen.getByLabelText('名前')).toHaveValue('動画')
    expect(screen.getByLabelText('金額')).toHaveValue('1200')
    expect(screen.getByLabelText('メモ')).toHaveValue('家族用')
    expect(screen.getByRole('heading', { name: 'サブスクの編集' })).toHaveFocus()
    fill(); save()
    expect(await screen.findByText('サブスクを更新しました。')).toBeInTheDocument()
    expect(updateSubscription).toHaveBeenCalledTimes(1)
    expect(updateSubscription).toHaveBeenCalledWith(1, { name: '新しい動画', amount: 1500, memo: 'メモ' })
    expect(fetchSubscriptions).toHaveBeenCalledTimes(2)
  })
  it('編集のキャンセルでは更新せず新規に戻る', async () => {
    await ready(); edit()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.getByRole('heading', { name: 'サブスクの登録' })).toBeInTheDocument()
    expect(screen.getByLabelText('名前')).toHaveValue('')
    expect(updateSubscription).not.toHaveBeenCalled()
  })
  it('削除のキャンセルとEscではDELETEしない', async () => {
    await ready(); openDelete()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'キャンセル' }))
    expect(deleteSubscription).not.toHaveBeenCalled()
    openDelete()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(deleteSubscription).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('編集中の対象を削除したら再取得して新規フォームに戻る', async () => {
    await ready(); edit(); openDelete(); confirmDelete()
    expect(await screen.findByText('サブスクを削除しました。')).toBeInTheDocument()
    expect(deleteSubscription).toHaveBeenCalledTimes(1)
    expect(deleteSubscription).toHaveBeenCalledWith(1)
    expect(fetchSubscriptions).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('heading', { name: 'サブスクの登録' })).toBeInTheDocument()
  })
  it('送信中は二重送信や別の編集削除を許可しない', async () => {
    const pending = deferred<ApiSubscription>()
    vi.mocked(createSubscription).mockReturnValue(pending.promise)
    await ready(); fill()
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))
    fireEvent.submit(screen.getByRole('form', { name: 'サブスクフォーム' }))
    const editButton = screen.getByRole('button', { name: '音楽 のサブスクを編集' })
    const deleteButton = screen.getByRole('button', { name: '動画 のサブスクを削除' })
    expect(editButton).toBeDisabled(); expect(deleteButton).toBeDisabled()
    fireEvent.click(editButton); fireEvent.click(deleteButton)
    expect(createSubscription).toHaveBeenCalledTimes(1)
    expect(updateSubscription).not.toHaveBeenCalled(); expect(deleteSubscription).not.toHaveBeenCalled()
    await act(async () => pending.resolve(video))
  })
  it('削除中は連続確定とEscを無効にする', async () => {
    const pending = deferred<void>()
    vi.mocked(deleteSubscription).mockReturnValue(pending.promise)
    await ready(); openDelete(); confirmDelete()
    expect(screen.getByRole('button', { name: '削除中…' })).toBeDisabled()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    fireEvent.click(screen.getByRole('button', { name: '削除中…' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(deleteSubscription).toHaveBeenCalledTimes(1)
    await act(async () => pending.resolve())
  })
  it('400は固定の日本語メッセージに変換して入力を保つ', async () => {
    vi.mocked(createSubscription).mockRejectedValue(new ApiValidationError({ Name: ['秘密'], amount: ['秘密'], memo: ['秘密'] }))
    await ready(); fill()
    fireEvent.click(screen.getByRole('button', { name: '登録する' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('名前は1〜100文字で入力してください。')
    expect(alert).toHaveTextContent('金額は1円以上2,147,483,647円以下で入力してください。')
    expect(alert).toHaveTextContent('メモは500文字以内で入力してください。')
    expect(alert).not.toHaveTextContent('秘密')
    expect(screen.getByLabelText('名前')).toHaveValue('新しい動画')
  })
  it.each(['update', 'delete'])('404で対象が見つからないことを案内する: %s', async (kind) => {
    vi.mocked(updateSubscription).mockRejectedValue(new ApiError('秘密', 404))
    vi.mocked(deleteSubscription).mockRejectedValue(new ApiError('秘密', 404))
    await ready()
    if (kind === 'update') { edit(); save() } else { openDelete(); confirmDelete() }
    expect(await screen.findByText('対象のサブスクが見つかりません。再読み込みしてください。')).toBeInTheDocument()
  })
  it('取得中と取得失敗を表示し再読み込みできる', async () => {
    const pending = deferred<ApiSubscription[]>()
    vi.mocked(fetchSubscriptions).mockReturnValueOnce(pending.promise)
    renderPage()
    expect(screen.getByText('読み込み中…')).toBeInTheDocument()
    await act(async () => pending.reject(new ApiError('秘密', 500)))
    expect(screen.getByRole('alert')).toHaveTextContent('サブスクを取得できませんでした。')
    expect(signOut).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }))
    expect(await screen.findByText('家族用')).toBeInTheDocument()
    expect(fetchSubscriptions).toHaveBeenCalledTimes(2)
  })
  it.each(['create', 'update', 'delete'])('通信断後の再読み込みはGETだけを呼ぶ: %s', async (kind) => {
    vi.mocked(createSubscription).mockRejectedValue(new TypeError('offline'))
    vi.mocked(updateSubscription).mockRejectedValue(new TypeError('offline'))
    vi.mocked(deleteSubscription).mockRejectedValue(new TypeError('offline'))
    await ready()
    if (kind === 'create') { fill(); fireEvent.click(screen.getByRole('button', { name: '登録する' })) }
    else if (kind === 'update') { edit(); save() }
    else { openDelete(); confirmDelete() }
    expect(await screen.findByText(/処理が完了している可能性があります/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '一覧を再読み込み' }))
    await waitFor(() => expect(fetchSubscriptions).toHaveBeenCalledTimes(2))
    expect(createSubscription).toHaveBeenCalledTimes(kind === 'create' ? 1 : 0)
    expect(updateSubscription).toHaveBeenCalledTimes(kind === 'update' ? 1 : 0)
    expect(deleteSubscription).toHaveBeenCalledTimes(kind === 'delete' ? 1 : 0)
  })
  it.each(['load', 'create', 'update', 'delete'])('セッション失効でログアウトする: %s', async (kind) => {
    const error = new AccessTokenRefreshError()
    if (kind === 'load') { vi.mocked(fetchSubscriptions).mockRejectedValue(error); renderPage() }
    else {
      vi.mocked(createSubscription).mockRejectedValue(error)
      vi.mocked(updateSubscription).mockRejectedValue(error)
      vi.mocked(deleteSubscription).mockRejectedValue(error)
      await ready()
      if (kind === 'create') { fill(); fireEvent.click(screen.getByRole('button', { name: '登録する' })) }
      else if (kind === 'update') { edit(); save() }
      else { openDelete(); confirmDelete() }
    }
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
  })
  it.each(['update', 'delete'])('500は操作の失敗を案内しログアウトしない: %s', async (kind) => {
    vi.mocked(updateSubscription).mockRejectedValue(new ApiError('秘密', 500))
    vi.mocked(deleteSubscription).mockRejectedValue(new ApiError('秘密', 500))
    await ready()
    if (kind === 'update') { edit(); save() } else { openDelete(); confirmDelete() }
    expect(await screen.findByText(kind === 'update' ? '保存に失敗しました。しばらくしてから再試行してください。' : '削除に失敗しました。しばらくしてから再試行してください。')).toBeInTheDocument()
    expect(signOut).not.toHaveBeenCalled()
  })
})
