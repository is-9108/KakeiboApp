import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { fetchEntries, type ApiEntry } from '../api/client'

/**
 * ログイン後の仮ページ。月次画面（issue #6）の代わりとして
 * 認証済みAPIへの疎通確認とログアウトだけを備える。
 */
export default function AppHome() {
  const auth = useAuth()
  const [entries, setEntries] = useState<ApiEntry[] | null>(null)
  const [apiError, setApiError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const result = await fetchEntries('2031-01')
        if (!mounted) return
        setEntries(result)
      } catch (err) {
        if (!mounted) return
        if (err instanceof Error && err.name === 'AccessTokenRefreshError') {
          // セッション失効 → ログイン画面へ。 以降のAPI呼び出しは伴わない
          await auth.signOut()
          return
        }
        setApiError('APIの呼び出しに失敗しました。しばらくしてから再読み込みしてください。')
      }
    })()
    return () => {
      mounted = false
    }
  }, [auth])

  if (apiError !== null) {
    return (
      <main>
        <h1>仮ページ</h1>
        <p role="alert">{apiError}</p>
        <button type="button" onClick={() => void auth.signOut()}>ログアウト</button>
      </main>
    )
  }

  return (
    <main>
      <h1>仮ページ</h1>
      {entries !== null && entries.length > 0 && (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id}>
              {entry.date} {entry.type} {entry.amount}円 ({entry.category})
            </li>
          ))}
        </ul>
      )}
      {entries !== null && entries.length === 0 && <p>登録されている収支はありません。</p>}
      <button type="button" onClick={() => void auth.signOut()}>ログアウト</button>
    </main>
  )
}
