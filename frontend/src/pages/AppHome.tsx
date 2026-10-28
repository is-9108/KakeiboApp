import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
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
import {
  translateValidationErrors,
  type EntryFormValues,
  type EntryInput,
} from '../domain/entries'
import {
  currentMonthJst,
  initialEntryDate,
  shiftMonth,
} from '../domain/month'
import MonthNavigation from '../components/MonthNavigation'
import MonthlySummary from '../components/MonthlySummary'
import EntryList from '../components/EntryList'
import EntryForm from '../components/EntryForm'
import DeleteEntryDialog from '../components/DeleteEntryDialog'
import './AppHome.css'

interface MonthData {
  /** 取得した月。表示月と一致するときだけ描画する。 */
  month: string
  entries: ApiEntry[]
  summary: ApiMonthlySummary
}

type LoadState = 'loading' | 'ready' | 'error'
type MutationKind = 'save' | 'delete'

/** 表示月に対応した新規フォームの初期値。 */
function blankForm(month: string): EntryFormValues {
  return {
    date: initialEntryDate(month),
    type: '支出',
    amount: '',
    category: '',
    memo: '',
  }
}

function formValuesFromEntry(entry: ApiEntry): EntryFormValues {
  return {
    date: entry.date,
    type: entry.type,
    amount: String(entry.amount),
    category: entry.category,
    memo: entry.memo,
  }
}

interface MutationErrorInfo {
  message: string
  /** 通信断でサーバー側の処理結果が不明なときだけ、GETのみの再読み込み導線を出す。 */
  canReload: boolean
}

/** 更新系APIの失敗を、画面に出してよい日本語メッセージへ変換する。 */
function describeMutationError(error: unknown, kind: MutationKind): MutationErrorInfo {
  if (error instanceof ApiValidationError) {
    return { message: translateValidationErrors(error.errors).join(' '), canReload: false }
  }
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return { message: '対象の収支が見つかりません。再読み込みしてください。', canReload: false }
    }
    if (error.status === 400) {
      return { message: '入力内容を確認してください。', canReload: false }
    }
    return {
      message:
        kind === 'delete'
          ? '削除に失敗しました。しばらくしてから再試行してください。'
          : '保存に失敗しました。しばらくしてから再試行してください。',
      canReload: false,
    }
  }
  // ApiError以外はfetch自体の失敗やセッション取得の通信断。自動再送はせず結果確認を促す。
  return {
    message: '処理が完了している可能性があります。一覧を再読み込みして結果を確認してください。',
    canReload: true,
  }
}

/**
 * ログイン後の月次画面。
 * 月切替・集計・一覧・登録／編集共用フォーム・削除確認をまとめる。
 */
export default function AppHome() {
  const { signOut } = useAuth()
  const [month, setMonth] = useState(() => currentMonthJst())
  const [data, setData] = useState<MonthData | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [editingEntry, setEditingEntry] = useState<ApiEntry | null>(null)
  const [formValues, setFormValues] = useState<EntryFormValues>(() => blankForm(currentMonthJst()))
  const [formError, setFormError] = useState<string | null>(null)
  const [formErrorCanReload, setFormErrorCanReload] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ApiEntry | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteErrorCanReload, setDeleteErrorCanReload] = useState(false)
  /** 編集開始のたびに増やす。同じ対象の再選択でもEntryFormのスクロール・フォーカスを再実行させる。 */
  const [editKey, setEditKey] = useState(0)

  const mountedRef = useRef(true)
  const generationRef = useRef(0)
  const mutationRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  /**
   * 指定月の一覧と集計を並行取得する。
   * 世代番号で、月切替前の遅延レスポンスが最新画面を上書きしないようにする。
   */
  const loadMonth = useCallback(
    async (targetMonth: string): Promise<boolean> => {
      const generation = generationRef.current + 1
      generationRef.current = generation
      setLoadState('loading')
      setData(null)

      try {
        const [entries, summary] = await Promise.all([
          fetchEntries(targetMonth),
          fetchSummary(targetMonth),
        ])
        if (!mountedRef.current || generation !== generationRef.current) return false
        setData({ month: targetMonth, entries, summary })
        setLoadState('ready')
        return true
      } catch (error) {
        if (!mountedRef.current || generation !== generationRef.current) return false
        if (error instanceof AccessTokenRefreshError) {
          await signOut()
          return false
        }
        setData(null)
        setLoadState('error')
        return false
      }
    },
    [signOut],
  )

  useEffect(() => {
    void loadMonth(month)
  }, [month, loadMonth])

  const beginMutation = (): boolean => {
    if (mutationRef.current) return false
    mutationRef.current = true
    setBusy(true)
    return true
  }

  const endMutation = () => {
    mutationRef.current = false
    if (mountedRef.current) setBusy(false)
  }

  const handleMonthChange = (delta: number) => {
    if (mutationRef.current) return
    setNotice(null)
    setMonth((current) => shiftMonth(current, delta))
  }

  const handleSubmit = async (input: EntryInput) => {
    if (!beginMutation()) return
    const editing = editingEntry
    setFormError(null)
    setFormErrorCanReload(false)

    try {
      if (editing !== null) {
        await updateEntry(editing.id, input)
      } else {
        await createEntry(input)
      }
      if (!mountedRef.current) return
      setEditingEntry(null)
      setFormValues(blankForm(month))
      setNotice(editing !== null ? '収支を更新しました。' : '収支を登録しました。')

      const refreshed = await loadMonth(month)
      if (!refreshed && mountedRef.current) {
        setNotice(
          editing !== null
            ? '更新は完了しましたが、表示の更新に失敗しました。再読み込みしてください。'
            : '保存は完了しましたが、表示の更新に失敗しました。再読み込みしてください。',
        )
      }
    } catch (error) {
      if (!mountedRef.current) return
      if (error instanceof AccessTokenRefreshError) {
        await signOut()
        return
      }
      const info = describeMutationError(error, 'save')
      setFormError(info.message)
      setFormErrorCanReload(info.canReload)
    } finally {
      endMutation()
    }
  }

  const handleEdit = (entry: ApiEntry) => {
    if (mutationRef.current) return
    setEditingEntry(entry)
    setFormValues(formValuesFromEntry(entry))
    setFormError(null)
    setFormErrorCanReload(false)
    setNotice(null)
    setEditKey((key) => key + 1)
  }

  const handleCancelEdit = () => {
    if (mutationRef.current) return
    setEditingEntry(null)
    setFormValues(blankForm(month))
    setFormError(null)
    setFormErrorCanReload(false)
  }

  /** 通信断で結果不明のとき、更新要求を再送せずGETだけで一覧・集計を取り直す。 */
  const handleFormReload = () => {
    if (mutationRef.current) return
    setFormError(null)
    setFormErrorCanReload(false)
    void loadMonth(month)
  }

  const handleDeleteRequest = (entry: ApiEntry) => {
    if (mutationRef.current) return
    setDeleteTarget(entry)
    setDeleteError(null)
    setDeleteErrorCanReload(false)
  }

  const handleDeleteCancel = () => {
    if (mutationRef.current) return
    setDeleteTarget(null)
    setDeleteError(null)
    setDeleteErrorCanReload(false)
  }

  /** 通信断で結果不明のとき、ダイアログを閉じてGETだけで一覧・集計を取り直す。 */
  const handleDeleteReload = () => {
    if (mutationRef.current) return
    setDeleteTarget(null)
    setDeleteError(null)
    setDeleteErrorCanReload(false)
    void loadMonth(month)
  }

  const handleDeleteConfirm = async () => {
    if (deleteTarget === null) return
    if (!beginMutation()) return
    const target = deleteTarget
    setDeleteError(null)
    setDeleteErrorCanReload(false)

    try {
      await deleteEntry(target.id)
      if (!mountedRef.current) return
      if (editingEntry?.id === target.id) {
        setEditingEntry(null)
        setFormValues(blankForm(month))
      }
      setDeleteTarget(null)
      setNotice('収支を削除しました。')

      const refreshed = await loadMonth(month)
      if (!refreshed && mountedRef.current) {
        setNotice('削除は完了しましたが、表示の更新に失敗しました。再読み込みしてください。')
      }
    } catch (error) {
      if (!mountedRef.current) return
      if (error instanceof AccessTokenRefreshError) {
        await signOut()
        return
      }
      const info = describeMutationError(error, 'delete')
      setDeleteError(info.message)
      setDeleteErrorCanReload(info.canReload)
    } finally {
      endMutation()
    }
  }

  const handleRetry = () => {
    if (mutationRef.current) return
    setNotice(null)
    void loadMonth(month)
  }

  // 月を切り替えた直後に、前月のデータを現在月として一瞬表示しない。
  const showLoading = loadState === 'loading' || (data !== null && data.month !== month)

  return (
    <main className="app-home">
      <header className="app-home__header">
        <h1>家計簿</h1>
        <button type="button" onClick={() => void signOut()}>
          ログアウト
        </button>
      </header>

      <MonthNavigation
        month={month}
        disabled={busy}
        onPrevious={() => handleMonthChange(-1)}
        onNext={() => handleMonthChange(1)}
      />

      {notice !== null && (
        <p className="app-home__notice" role="status">
          {notice}
        </p>
      )}

      {showLoading && (
        <p className="app-home__loading" role="status">
          読み込み中…
        </p>
      )}

      {loadState === 'error' && (
        <div className="app-home__error">
          <p role="alert">月次データを取得できませんでした。</p>
          <button type="button" onClick={handleRetry}>
            再読み込み
          </button>
        </div>
      )}

      {loadState === 'ready' && data !== null && data.month === month && (
        <>
          <MonthlySummary summary={data.summary} />
          <div className="app-home__columns">
            <EntryList
              entries={data.entries}
              disabled={busy}
              onEdit={handleEdit}
              onDelete={handleDeleteRequest}
            />
            <EntryForm
              mode={editingEntry !== null ? 'edit' : 'create'}
              editKey={editKey}
              values={formValues}
              submitting={busy}
              error={formError}
              onChange={(values) => {
                setFormValues(values)
                setFormError(null)
                setFormErrorCanReload(false)
              }}
              onSubmit={(input) => void handleSubmit(input)}
              onCancel={handleCancelEdit}
              onReload={formErrorCanReload ? handleFormReload : undefined}
            />
          </div>
        </>
      )}

      <DeleteEntryDialog
        entry={deleteTarget}
        error={deleteError}
        busy={busy}
        onCancel={handleDeleteCancel}
        onConfirm={() => void handleDeleteConfirm()}
        onReload={deleteErrorCanReload ? handleDeleteReload : undefined}
      />
    </main>
  )
}
