import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'

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
    <main>
      <h1>ログイン</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="login-email">メールアドレス</label>
        <input
          id="login-email"
          type="email"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label htmlFor="login-password">パスワード</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error !== null && <p role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
    </main>
  )
}
