import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  configureCognito,
  fetchSession,
  signIn as amplifySignIn,
  completeNewPassword as amplifyCompleteNewPassword,
  signOutUser,
  SignInStep,
  type CognitoConfig,
} from './amplifyAuth'

export type { CognitoConfig } from './amplifyAuth'

/**
 * 認証状態の状態機械。
 * checking → unauthenticated → (signIn) → authenticated
 *                        ↘ needsNewPassword → (completeNewPassword) → authenticated
 */
export type AuthState =
  | { name: 'checking' }
  | { name: 'unauthenticated' }
  | { name: 'needsNewPassword'; username: string }
  | { name: 'authenticated' }

export interface SignInCredentials {
  username: string
  password: string
}

export interface AuthContextValue {
  state: AuthState
  signIn: (credentials: SignInCredentials) => Promise<void>
  completeNewPassword: (newPassword: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Amplifyのエラー名を画面メッセージに変換する。 */
export function translateSignInError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? ''
  if (name === 'NotAuthorizedException' || name === 'UserNotFoundException' || name === 'InvalidParameterException') {
    return 'メールアドレスまたはパスワードが正しくありません。'
  }
  if (name === 'NetworkError' || name === 'UnknownError') {
    return '通信に失敗しました。しばらくしてから再試行してください。'
  }
  return 'ログインに失敗しました。しばらくしてから再試行してください。'
}

export function translateChallengeError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? ''
  if (name === 'InvalidPasswordException' || name === 'InvalidConfigurationException') {
    return 'パスワードはポリシーに一致させてください。'
  }
  if (name === 'ExpiredCodeException' || name === 'NotAuthorizedException') {
    return 'セッションの有効期限が切れています。ログインからやり直してください。'
  }
  return 'パスワードの変更に失敗しました。入力内容を確認してください。'
}

export interface AuthProviderProps {
  config: CognitoConfig
  children: ReactNode
}

export function AuthProvider({ config, children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ name: 'checking' })

  useEffect(() => {
    configureCognito(config)
    let mounted = true
    void (async () => {
      try {
        const snapshot = await fetchSession()
        if (!mounted) return
        setState(snapshot.tokens ? { name: 'authenticated' } : { name: 'unauthenticated' })
      } catch {
        if (!mounted) return
        setState({ name: 'unauthenticated' })
      }
    })()
    return () => {
      mounted = false
    }
  }, [config])

  const signIn = useCallback(async ({ username, password }: SignInCredentials) => {
    try {
      const result = await amplifySignIn(username, password)
      if (result.isSignedIn) {
        setState({ name: 'authenticated' })
        return
      }
      if (result.nextStep.signInStep === SignInStep.confirmSignUpNewPasswordRequired) {
        setState({ name: 'needsNewPassword', username })
        return
      }
      throw new Error(`未対応の認証ステップです: ${result.nextStep.signInStep}` )
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('未対応の認証ステップ')) {
        throw error
      }
      // 既にUI向けメッセージへ翻訳済みのエラー（AuthFlowError）はそのまま上げる
      if (error instanceof AuthFlowError) {
        throw error
      }
      throw new AuthFlowError(translateSignInError(error), (error as { name?: string })?.name)
    }
  }, [])

  const completeNewPassword = useCallback(async (newPassword: string) => {
    try {
      const result = await amplifyCompleteNewPassword(newPassword)
      if (result.isSignedIn) {
        setState({ name: 'authenticated' })
        return
      }
      throw new Error(`未対応の認証ステップです: ${result.nextStep.signInStep}`)
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('未対応の認証ステップ')) {
        throw error
      }
      if (error instanceof AuthFlowError) {
        throw error
      }
      throw new AuthFlowError(translateChallengeError(error), (error as { name?: string })?.name)
    }
  }, [])

  const signOut = useCallback(async () => {
    await signOutUser()
    setState({ name: 'unauthenticated' })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ state, signIn, completeNewPassword, signOut }),
    [state, signIn, completeNewPassword, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** AuthProviderが発生させる、UI用に翻訳済みのエラー。 */
export class AuthFlowError extends Error {
  readonly errorName?: string

  constructor(message: string, errorName?: string) {
    super(message)
    this.name = 'AuthFlowError'
    this.errorName = errorName
  }
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuthはAuthProviderの中で使ってください。')
  }
  return value
}
