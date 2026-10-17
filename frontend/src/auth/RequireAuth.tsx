import type { ReactNode } from 'react'
import { useAuth } from './AuthContext'
import LoginPage from '../pages/LoginPage'
import ChangePasswordPage from '../pages/ChangePasswordPage'

/**
 * 保護対象の子要素を認証状態に応じて出し分けるガード。
 * 未ログイン・不明URLではログイン画面へ（内部リダイレクトに相当）、
 * 初回パスワード変更待ちではパスワード変更画面を表示し、
 * ログイン済みの場合のみ子要素（アプリ本体）を表示する。
 */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()

  if (auth.state.name === 'checking') {
    return <p data-testid="checking-indicator">認証状態を確認しています…</p>
  }
  if (auth.state.name === 'needsNewPassword') {
    return <ChangePasswordPage />
  }
  if (auth.state.name === 'authenticated') {
    return <>{children}</>
  }
  return <LoginPage />
}
