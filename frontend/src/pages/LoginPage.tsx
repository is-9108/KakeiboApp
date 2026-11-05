import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import './LoginPage.css'

/** Cognitoへのログイン画面。サインアップ導線は存在しない。 */
export default function LoginPage() {
  const auth = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    if (username === '' || password === '') {
      setError('メールアドレスとパスワードを入力してください。')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await auth.signIn({ username, password })
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'ログインに失敗しました。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <h1>ログイン</h1>
      <form className="login-page__form" onSubmit={onSubmit}>
        <div className="login-page__field">
          <label htmlFor="login-email">メールアドレス</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="login-page__field">
          <label htmlFor="login-password">パスワード</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error !== null && <p className="login-page__error" role="alert">{error}</p>}
        <button className="login-page__submit" type="submit" disabled={submitting}>
          {submitting ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
    </main>
  )
}
