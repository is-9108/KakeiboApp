import { Amplify } from 'aws-amplify'
import {
  confirmSignIn,
  fetchAuthSession,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
} from 'aws-amplify/auth'

/** Cognitoの接続設定。Viteの VITE_* 環境変数から読む。 */
export interface CognitoConfig {
  region: string
  userPoolId: string
  userPoolClientId: string
}

/** デバウンスなどの補助用。現在は未使用の可能性あり。 */
export interface AuthSessionSnapshot {
  tokens: AuthTokens | null
}

export interface AuthTokens {
  accessToken: string
}

/** implementフェーズで決定した設計：Amplify SDKの境界をこの関数群でだけ触る */
export function configureCognito(config: CognitoConfig): void {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolClientId,
      },
    },
  })
}

/**
 * 現在のセッションを取得する。ログイン済みならアクセストークン付きのスナップショット、
 * 未ログインならtokens=nullを返す。 amplifyのfetchAuthSessionの例外は呼び出し側で処理する。
 */
export async function fetchSession(): Promise<AuthSessionSnapshot> {
  const session = await fetchAuthSession()
  const accessToken = session.tokens?.accessToken?.toString()
  return {
    tokens: accessToken ? { accessToken } : null,
  }
}

export const SignInStep = {
  /** 初回パスワード変更が必要なCognitoのチャレンジ */
  confirmSignUpNewPasswordRequired: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED',
} as const

/** amplifyのsignInの戻り値で使う型（必要な部分のみ） */
export interface SignInNextStep {
  signInStep: string
}

export interface SignInResult {
  isSignedIn: boolean
  nextStep: SignInNextStep
}

export interface ConfirmSignInResult {
  isSignedIn: boolean
  nextStep: SignInNextStep
}

export async function signIn(username: string, password: string): Promise<SignInResult> {
  return amplifySignIn({ username, password }) as unknown as Promise<SignInResult>
}

export async function completeNewPassword(newPassword: string): Promise<ConfirmSignInResult> {
  return confirmSignIn({ challengeResponse: newPassword }) as unknown as Promise<ConfirmSignInResult>
}

export async function signOutUser(): Promise<void> {
  await amplifySignOut()
}
