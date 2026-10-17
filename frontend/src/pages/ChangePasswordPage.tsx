import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'

/**
 * 管理者発行の仮パスワードから恒久パスワードへ変更する画面。
 * Cognitoの CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED チャレンジに対応する。
 */
export default function ChangePasswordPage() {
  const auth = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    if (newPassword === '') {
      setError('新しいパスワードを入力します。')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await auth.completeNewPassword(newPassword)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'パスワードの変更に失敗しました。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main>
      <h1>パスワード変更</h1>
      <p>初回ログインのため、新しいパスワードを設定してください。</p>
      <form onSubmit={onSubmit}>
        <label htmlFor="change-password">新しいパスワード</label>
        <input
          id="change-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        {error !== null && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? '変更中…' : 'パスワードを変更する'}
        </button>
      </form>
    </main>
  )
}
