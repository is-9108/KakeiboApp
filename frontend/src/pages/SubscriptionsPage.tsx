import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AccessTokenRefreshError, ApiError, ApiValidationError, createSubscription, deleteSubscription, fetchSubscriptions, updateSubscription, type ApiSubscription } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import SubscriptionForm from '../components/SubscriptionForm'
import SubscriptionList from '../components/SubscriptionList'
import DeleteSubscriptionDialog from '../components/DeleteSubscriptionDialog'
import { blankSubscription, translateSubscriptionErrors, type SubscriptionErrors, type SubscriptionInput } from '../domain/subscriptions'
import './SubscriptionsPage.css'

/** 認証済みユーザー向けの月額サブスク管理。 */
export default function SubscriptionsPage() {
  const { signOut } = useAuth()
  const [subscriptions, setSubscriptions] = useState<ApiSubscription[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [values, setValues] = useState(blankSubscription)
  const [editing, setEditing] = useState<ApiSubscription | null>(null)
  const [editKey, setEditKey] = useState(0)
  const [fieldErrors, setFieldErrors] = useState<SubscriptionErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [formReload, setFormReload] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ApiSubscription | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteReload, setDeleteReload] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  const mutation = useRef(false)
  const generation = useRef(0)

  const applyList = useCallback((current: number, list: ApiSubscription[]): boolean => {
    if (!mounted.current || current !== generation.current) return false
    setSubscriptions(list)
    setLoadState('ready')
    return true
  }, [])
  const applyError = useCallback(async (current: number, error: unknown): Promise<boolean> => {
    if (!mounted.current || current !== generation.current) return false
    if (error instanceof AccessTokenRefreshError) { await signOut(); return false }
    setLoadState('error')
    return false
  }, [signOut])
  // 応答の反映は非同期コールバックに限り、古い応答は破棄する。
  const fetchList = useCallback((): Promise<boolean> => {
    const current = ++generation.current
    return fetchSubscriptions().then(list => applyList(current, list), error => applyError(current, error))
  }, [applyList, applyError])
  useEffect(() => {
    mounted.current = true
    void fetchList()
    return () => { mounted.current = false }
  }, [fetchList])

  const load = () => { setLoadState('loading'); return fetchList() }

  const resetForm = () => {
    setEditing(null); setValues(blankSubscription()); setFieldErrors({}); setFormError(null); setFormReload(false)
  }
  const startMutation = () => {
    if (mutation.current) return false
    mutation.current = true; setBusy(true); setNotice(null); return true
  }
  const finishMutation = () => { mutation.current = false; if (mounted.current) setBusy(false) }
  const describe = (error: unknown) => {
    if (error instanceof ApiError) {
      if (error.status === 404) return { message: '対象のサブスクが見つかりません。一覧を再読み込みしてください。', reload: true }
      if (error.status === 403) return { message: 'この操作は許可されていません。', reload: false }
      if (error.status === 400) return { message: '入力内容を確認してください。', reload: false }
      return { message: '処理に失敗しました。しばらくしてから再試行してください。', reload: false }
    }
    return { message: '処理が完了している可能性があります。一覧を再読み込みして結果を確認してください。', reload: true }
  }
  const save = async (input: SubscriptionInput) => {
    if (!startMutation()) return
    setFormError(null); setFormReload(false); setFieldErrors({})
    const wasEditing = editing !== null
    try {
      if (editing) await updateSubscription(editing.id, input)
      else await createSubscription(input)
      if (!mounted.current) return
      resetForm()
      setNotice(wasEditing ? 'サブスクを更新しました。' : 'サブスクを登録しました。')
      const refreshed = await load()
      if (!refreshed && mounted.current) setNotice('保存は完了しましたが、表示の更新に失敗しました。再読み込みしてください。')
    } catch (error) {
      if (!mounted.current) return
      if (error instanceof AccessTokenRefreshError) { await signOut(); return }
      if (error instanceof ApiValidationError) setFieldErrors(translateSubscriptionErrors(error.errors))
      const info = describe(error); setFormError(info.message); setFormReload(info.reload)
    } finally { finishMutation() }
  }
  const confirmDelete = async () => {
    if (!deleteTarget || !startMutation()) return
    const target = deleteTarget
    setDeleteError(null); setDeleteReload(false)
    try {
      await deleteSubscription(target.id)
      if (!mounted.current) return
      if (editing?.id === target.id) resetForm()
      setDeleteTarget(null); setNotice('サブスクを削除しました。')
      const refreshed = await load()
      if (!refreshed && mounted.current) setNotice('削除は完了しましたが、表示の更新に失敗しました。再読み込みしてください。')
    } catch (error) {
      if (!mounted.current) return
      if (error instanceof AccessTokenRefreshError) { await signOut(); return }
      const info = describe(error); setDeleteError(info.message); setDeleteReload(info.reload)
    } finally { finishMutation() }
  }
  const reload = () => {
    if (mutation.current) return
    setFormError(null); setFormReload(false); setNotice(null)
    void load()
  }
  return <main className="subscriptions-page">
    <header className="subscriptions-page__header">
      <h1>サブスク管理</h1>
      <Link to="/" aria-disabled={busy || undefined} onClick={event => { if (mutation.current) event.preventDefault() }}>月次画面へ戻る</Link>
      <button type="button" onClick={() => void signOut()}>ログアウト</button>
    </header>
    {notice && <p role="status">{notice}</p>}
    {loadState === 'loading' && <p role="status">読み込み中…</p>}
    {loadState === 'error' && <div className="subscriptions-page__error"><p role="alert">サブスクを取得できませんでした。</p><button type="button" disabled={busy} onClick={reload}>再読み込み</button></div>}
    {loadState === 'ready' && <div className="subscriptions-page__columns">
      <SubscriptionList subscriptions={subscriptions} disabled={busy} onEdit={subscription => {
        if (mutation.current) return
        setEditing(subscription); setValues({ name: subscription.name, amount: String(subscription.amount), memo: subscription.memo }); setEditKey(key => key + 1)
        setFieldErrors({}); setFormError(null); setFormReload(false); setNotice(null)
      }} onDelete={subscription => {
        if (mutation.current) return
        setDeleteTarget(subscription); setDeleteError(null); setDeleteReload(false)
      }} />
      <SubscriptionForm mode={editing ? 'edit' : 'create'} editKey={editKey} values={values} submitting={busy} error={formError} fieldErrors={fieldErrors} onChange={next => {
        setValues(next); setFieldErrors({}); setFormError(null); setFormReload(false)
      }} onSubmit={input => void save(input)} onCancel={() => { if (!mutation.current) resetForm() }} onReload={formReload ? reload : undefined} />
    </div>}
    <DeleteSubscriptionDialog subscription={deleteTarget} error={deleteError} busy={busy} onCancel={() => { if (!mutation.current) setDeleteTarget(null) }} onConfirm={() => void confirmDelete()} onReload={deleteReload ? () => {
      if (mutation.current) return
      setDeleteTarget(null); setDeleteError(null); setDeleteReload(false); reload()
    } : undefined} />
  </main>
}
