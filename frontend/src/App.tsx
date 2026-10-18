import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, type CognitoConfig } from './auth/AuthContext'
import RequireAuth from './auth/RequireAuth'
import UnauthenticatedOnly from './UnauthenticatedOnly'
import LoginPage from './pages/LoginPage'
import AppHome from './pages/AppHome'

const defaultConfig: CognitoConfig = {
  region: import.meta.env.VITE_COGNITO_REGION,
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  userPoolClientId: import.meta.env.VITE_COGNITO_APP_CLIENT_ID,
}

/** ルーティング部分。テストではMemoryRouterで包むためRouter自体はここに含めない */
export function AppRoutes() {
  return (
    <Routes>
      {/* 未ログインでどのURLを開いても /login 相当のログイン画面に遷移する。
          ログイン済みなら本体を表示する。 */}
      <Route
        path="/login"
        element={
          <UnauthenticatedOnly>
            <LoginPage />
          </UnauthenticatedOnly>
        }
      />
      <Route
        path="*"
        element={
          <RequireAuth>
            <AppHome />
          </RequireAuth>
        }
      />
    </Routes>
  )
}

/** 本体（本番エントリ）。BrowserRouter込み。 */
export default function App() {
  return (
    <AuthProvider config={defaultConfig}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
