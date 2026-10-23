import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import {
  ApiError,
  createEntry,
  deleteEntry,
  fetchEntries,
  fetchSummary,
  updateEntry,
  type ApiEntry,
  type ApiSummary,
} from '../api/client'
import { addMonths, formatMonth, currentMonth } from '../domain/month'
import type { EntryInput } from '../domain/entries'
import EntryForm, { toInitialEntry } from '../components/EntryForm'
import EntryList from '../components/EntryList'
import MonthlySummary from '../components/MonthlySummary'
import './AppHome.css'

/** 画面データの読み込み状態。 */
type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; entries: ApiEntry[]; summary: ApiSummary }
  | { status: 'error'; message: string }

/** 削除確認ダイアログの文言。 */
const DELETE_CONFIRM_MESSAGE = 'この収支を削除しますか？よろしければ削除を実行します。'

/** セッション失効（アクセストークン更新失敗・401）かどうか。モジュール間でインスタンスが違っても名前で判定する。 */
function isSessionExpired(error: unknown): boolean {
  return error instanceof Error && error.name === 'AccessTokenRefreshError'
}

/** 初期取得に失敗したときの案内。 */
const LOAD_ERROR_MESSAGE = 'データの取得に失敗しました。しばらくしてから再試行してください。'

/**
 * 月次画面。月切替・収支一覧・月次集計・収支の登録／編集／削除を一体で提供する。
 * 一覧と集計は常に同じ月のデータを同じ取得世代で表示し、更新後は両方を再取得する。
 */
export default function AppHome() {
  const { signOut } = useAuth()
  const [month, setMonth] = useState(() => currentMonth())
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  /** 更新成功後の再取得に失敗したときの案内。表示データは古い可能性を含む。 */
  const [staleNotice, setStaleNotice] = useState<string | null>(null)
  /** 削除など一覧側の操作で失敗したときの案内。 */
  const [listError, setListError] = useState<string | null>(null)
  /** 編集中の収支。nullは新規登録。 */
  const [editing, setEditing] = useState<ApiEntry | null>(null)
  /** 更新系の処理が動いている間、競合する操作を無効化する。 */
  const [busy, setBusy] = useState(false)

  const monthRef = useRef(month)
  const generationRef = useRef(0)
  /** effectから最後に読み込みを開始した月。StrictModeの二重effectで同一月を二重取得しないためのガード */
  const lastRequestedRef = useRef<string | null>(null)

  /**
   * 指定月の一覧と集計を取得して表示する。
   * 月切替や連続実行で古い応答が残っていても、世代管理により新月の結果だけを表示する。
   * keepData を指定すると既存表示を保持したまま取得する（更新後の再取得用）。
   */
  const load = useCallback(
    async (
      targetMonth: string,
      options: { keepData?: boolean; doneMessage?: string } = {},
    ): Promise<void> => {
      const generation = ++generationRef.current
      if (!options.keepData) {
        setState({ status: 'loading' })
      }
      try {
        const [entries, summary] = await Promise.all([fetchEntries(targetMonth), fetchSummary(targetMonth)])
        if (generationRef.current !== generation || monthRef.current !== targetMonth) {
          return
        }
        setState({ status: 'ready', entries, summary })
        setStaleNotice(null)
      } catch (error) {
        if (generationRef.current !== generation || monthRef.current !== targetMonth) {
          return
        }
        if (isSessionExpired(error)) {
          await signOut()
          return
        }
        if (options.keepData) {
          // 更新は成功しているので、保存と表示の更新を区別して案内する
          const prefix = options.doneMessage ?? ''
          setStaleNotice(`${prefix}一覧と集計の再取得に失敗しました。表示が古い可能性があります。「再読み込み」で更新できます。`)
          return
        }
        setState({
          status: 'error',
          message: error instanceof ApiError && error.message ? error.message : LOAD_ERROR_MESSAGE,
        })
      }
    },
    [signOut],
  )

  useEffect(() => {
    monthRef.current = month
    // StrictModeなどによる同月の再実行では再取得しない（再読み込みは明示的な操作から行う）
    if (lastRequestedRef.current === month) {
      return
    }
    lastRequestedRef.current = month
    void load(month)
  }, [month, load])

  const changeMonth = (delta: number) => {
    if (busy) {
      return
    }
    setStaleNotice(null)
    setListError(null)
    setMonth((current) => addMonths(current, delta))
  }

  /** 更新系操作の共通処理。成功後に一覧・集計を再取得する。 */
  const runMutation = async (
    action: () => Promise<unknown>,
    doneMessage: string,
  ): Promise<void> => {
    if (busy) {
      throw new Error('ほかの更新処理を実行中です。')
    }
    setBusy(true)
    try {
      await action()
      setBusy(false)
      await load(monthRef.current, { keepData: true, doneMessage })
    } catch (error) {
      setBusy(false)
      if (isSessionExpired(error)) {
        await signOut()
        return
      }
      throw error
    }
  }

  /** フォームからの登録・編集。エラーはフォーム側で表示するため再throwする。 */
  const submitEntry = async (input: EntryInput): Promise<void> => {
    const target = editing
    await runMutation(
      () => (target !== null ? updateEntry(target.id, input) : createEntry(input)),
      target !== null ? '収支を更新しました。' : '収支を登録しました。',
    )
    // 成功したら編集モードを解除する（キーが変わるためフォームが新規状態に戻る）
    if (target !== null) {
      setEditing(null)
    }
  }

  /** 削除。確認ダイアログで確定した場合のみAPIを呼ぶ。 */
  const deleteSelectedEntry = async (entry: ApiEntry): Promise<void> => {
    if (busy) {
      return
    }
    if (!window.confirm(DELETE_CONFIRM_MESSAGE)) {
      return
    }
    setListError(null)
    setBusy(true)
    try {
      await deleteEntry(entry.id)
      if (editing?.id === entry.id) {
        setEditing(null)
      }
      setBusy(false)
      await load(monthRef.current, { keepData: true, doneMessage: '収支を削除しました。' })
    } catch (error) {
      setBusy(false)
      if (isSessionExpired(error)) {
        await signOut()
        return
      }
      setListError(error instanceof ApiError && error.message ? error.message : LOAD_ERROR_MESSAGE)
    }
  }

  const ready = state.status === 'ready'
  const editingEntry = editing !== null ? toInitialEntry(editing) : undefined

  return (
    <main className="monthly-screen">
      <header className="monthly-screen__header">
        <h1>家計簿 月次画面</h1>
        <button type="button" onClick={() => void signOut()}>
          ログアウト
        </button>
      </header>

      <section aria-label="月の切り替え" className="monthly-screen__month-nav">
        <button type="button" onClick={() => changeMonth(-1)} disabled={busy}>
          前月
        </button>
        <p className="monthly-screen__month-label">{formatMonth(month)}</p>
        <button type="button" onClick={() => changeMonth(1)} disabled={busy}>
          次月
        </button>
      </section>

      {state.status === 'loading' && <p>読み込み中…</p>}

      {state.status === 'error' && (
        <div role="alert" className="monthly-screen__error">
          <p>{state.message}</p>
          <button type="button" onClick={() => { void load(month) }}>
            再試行
          </button>
        </div>
      )}

      {staleNotice !== null && (
        <div role="alert" className="monthly-screen__notice">
          <p>{staleNotice}</p>
          <button type="button" onClick={() => { void load(month, { keepData: true }) }}>
            再読み込み
          </button>
        </div>
      )}

      {listError !== null && (
        <div role="alert" className="monthly-screen__error">
          <p>{listError}</p>
        </div>
      )}

      {ready && (
        <>
          <div className="monthly-screen__grid">
            <MonthlySummary summary={state.summary} />
            <EntryList
              entries={state.entries}
              onEdit={(entry) => {
                if (!busy) {
                  setListError(null)
                  setEditing(entry)
                }
              }}
              onDelete={(entry) => { void deleteSelectedEntry(entry) }}
              disabled={busy}
            />
          </div>
        </>
      )}

      <EntryForm
        key={editing !== null ? `edit-${editing.id}` : 'new'}
        onSubmit={(input) => submitEntry(input)}
        initialEntry={editingEntry}
        onCancel={() => setEditing(null)}
      />
    </main>
  )
}
