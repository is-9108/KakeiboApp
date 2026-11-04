import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import {
  AccessTokenRefreshError,
  ApiError,
  ApiValidationError,
  createSubscription,
  deleteSubscription,
  fetchSubscriptions,
  updateSubscription,
  type ApiSubscription,
} from '../api/client'
import {
  translateSubscriptionValidationErrors,
  type SubscriptionFormValues,
  type SubscriptionInput,
} from '../domain/subscriptions'
import SubscriptionList from '../components/SubscriptionList'
import SubscriptionForm from '../components/SubscriptionForm'
import DeleteSubscriptionDialog from '../components/DeleteSubscriptionDialog'
import './SubscriptionsPage.css'

type LoadState = 'loading' | 'ready' | 'error'
type MutationKind = 'save' | 'delete'

function blankForm(): SubscriptionFormValues {
  return { name: '', amount: '', memo: '' }
}

function formValuesFromSubscription(subscription: ApiSubscription): SubscriptionFormValues {
  return { name: subscription.name, amount: String(subscription.amount), memo: subscription.memo }
}

interface MutationErrorInfo {
  message: string
  /** 通信断でサーバー側の処理結果が不明なときだけ、GETのみの再読み込み導線を出す。 */
  canReload: boolean
}

/** 更新系APIの失敗を、画面に出してよい日本語メッセージへ変換する。 */
function describeMutationError(error: unknown, kind: MutationKind): MutationErrorInfo {
  if (error instanceof ApiValidationError) {
    return { message: translateSubscriptionValidationErrors(error.errors).join(' '), canReload: false }
  }
  if (error instanceof ApiError) {
    if (error.status === 404) {
      return { message: '対象のサブスクが見つかりません。再読み込みしてください。', canReload: false }
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
 * ログイン後のサブスク管理画面。
 * 一覧・登録／編集共用フォーム・削除確認をまとめる。
 */
export default function SubscriptionsPage() {
  const { signOut } = useAuth()
  const [data, setData] = useState<ApiSubscription[] | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [editingSubscription, setEditingSubscription] = useState<ApiSubscription | null>(null)
  const [formValues, setFormValues] = useState<SubscriptionFormValues>(() => blankForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [formErrorCanReload, setFormErrorCanReload] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ApiSubscription | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteErrorCanReload, setDeleteErrorCanReload] = useState(false)
  /** 編集開始のたびに増やす。同じ対象の再選択でもSubscriptionFormのスクロール・フォーカスを再実行させる。 */
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

  const fetchList = useCallback((): Promise<boolean> => {
    const generation = ++generationRef.current
    return fetchSubscriptions().then(
      (subscriptions) => {
        if (!mountedRef.current || generation !== generationRef.current) return false
        setData(subscriptions)
        setLoadState('ready')
        return true
      },
      async (error: unknown) => {
        if (!mountedRef.current || generation !== generationRef.current) return false
        if (error instanceof AccessTokenRefreshError) {
          await signOut()
          return false
        }
        setData(null)
        setLoadState('error')
        return false
      },
    )
  }, [signOut])

  const loadList = useCallback(() => {
    setLoadState('loading')
    setData(null)
    return fetchList()
  }, [fetchList])

  useEffect(() => { void fetchList() }, [fetchList])

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

  const handleSubmit = async (input: SubscriptionInput) => {
    if (!beginMutation()) return
    const editing = editingSubscription
    setFormError(null)
    setFormErrorCanReload(false)

    try {
      if (editing !== null) {
        await updateSubscription(editing.id, input)
      } else {
        await createSubscription(input)
      }
      if (!mountedRef.current) return
      setEditingSubscription(null)
      setFormValues(blankForm())
      setNotice(editing !== null ? 'サブスクを更新しました。' : 'サブスクを登録しました。')

      const refreshed = await loadList()
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

  const handleEdit = (subscription: ApiSubscription) => {
    if (mutationRef.current) return
    setEditingSubscription(subscription)
    setFormValues(formValuesFromSubscription(subscription))
    setFormError(null)
    setFormErrorCanReload(false)
    setNotice(null)
    setEditKey((key) => key + 1)
  }

  const handleCancelEdit = () => {
    if (mutationRef.current) return
    setEditingSubscription(null)
    setFormValues(blankForm())
    setFormError(null)
    setFormErrorCanReload(false)
  }

  /** 通信断で結果不明のとき、更新要求を再送せずGETだけで一覧を取り直す。 */
  const handleFormReload = () => {
    if (mutationRef.current) return
    setFormError(null)
    setFormErrorCanReload(false)
    void loadList()
  }

  const handleDeleteRequest = (subscription: ApiSubscription) => {
    if (mutationRef.current) return
    setDeleteTarget(subscription)
    setDeleteError(null)
    setDeleteErrorCanReload(false)
  }

  const handleDeleteCancel = () => {
    if (mutationRef.current) return
    setDeleteTarget(null)
    setDeleteError(null)
    setDeleteErrorCanReload(false)
  }

  /** 通信断で結果不明のとき、ダイアログを閉じてGETだけで一覧を取り直す。 */
  const handleDeleteReload = () => {
    if (mutationRef.current) return
    setDeleteTarget(null)
    setDeleteError(null)
    setDeleteErrorCanReload(false)
    void loadList()
  }

  const handleDeleteConfirm = async () => {
    if (deleteTarget === null) return
    if (!beginMutation()) return
    const target = deleteTarget
    setDeleteError(null)
    setDeleteErrorCanReload(false)

    try {
      await deleteSubscription(target.id)
      if (!mountedRef.current) return
      if (editingSubscription?.id === target.id) {
        setEditingSubscription(null)
        setFormValues(blankForm())
      }
      setDeleteTarget(null)
      setNotice('サブスクを削除しました。')

      const refreshed = await loadList()
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
    void loadList()
  }

  return (
    <main className="subscriptions-page">
      <header className="subscriptions-page__header">
        <h1>サブスク管理</h1>
        <Link to="/">月次画面へ戻る</Link>
        <button type="button" onClick={() => void signOut()}>
          ログアウト
        </button>
      </header>

      {notice !== null && (
        <p className="subscriptions-page__notice" role="status">
          {notice}
        </p>
      )}

      {loadState === 'loading' && (
        <p className="subscriptions-page__loading" role="status">
          読み込み中…
        </p>
      )}

      {loadState === 'error' && (
        <div className="subscriptions-page__error">
          <p role="alert">サブスクを取得できませんでした。</p>
          <button type="button" onClick={handleRetry}>
            再読み込み
          </button>
        </div>
      )}

      {loadState === 'ready' && data !== null && (
        <>
          <div className="subscriptions-page__columns">
            <SubscriptionList
              subscriptions={data}
              disabled={busy}
              onEdit={handleEdit}
              onDelete={handleDeleteRequest}
            />
            <SubscriptionForm
              mode={editingSubscription !== null ? 'edit' : 'create'}
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

      <DeleteSubscriptionDialog
        subscription={deleteTarget}
        error={deleteError}
        busy={busy}
        onCancel={handleDeleteCancel}
        onConfirm={() => void handleDeleteConfirm()}
        onReload={deleteErrorCanReload ? handleDeleteReload : undefined}
      />
    </main>
  )
}
