import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'

/**
 * 未ログインのときだけ子要素（ログイン画面）を表示し、ログイン済みならホームへ返す。
 * ログイン済みで/loginを直接開いたときにログイン画面のままにならないようにする。
 */
export default function UnauthenticatedOnly({ children }: { children: ReactNode }) {
  const auth = useAuth()

  if (auth.state.name === 'checking') {
    return <p data-testid="checking-indicator">認証状態を確認しています…</p>
  }
  if (auth.state.name === 'authenticated' || auth.state.name === 'needsNewPassword') {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
