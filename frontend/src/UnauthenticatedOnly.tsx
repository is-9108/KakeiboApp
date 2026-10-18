import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'

/**
 * 未ログインのときだけ子要素（ログイン画面）を表示し、ログイン済みならホームへ返す。
 * ログイン済みで/loginを直接開いたときにログイン画面のままにならないようにする。
 */
export default function UnauthenticatedOnly({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.state.name === 'checking') {
    return <p data-testid="checking-indicator">認証状態を確認しています…</p>
  }
  if (auth.state.name === 'authenticated' || auth.state.name === 'needsNewPassword') {
    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />
  }
  return <>{children}</>
}
