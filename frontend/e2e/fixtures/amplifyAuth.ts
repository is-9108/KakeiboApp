/**
 * ブラウザテスト用の認証差し替え実装。
 * 本体の src/auth/amplifyAuth.ts と同じ公開関数を持つが、Cognitoとは通信せず、
 * メモリ上のセッション状態だけを管理する。
 */

export interface CognitoConfig {
  region: string
  userPoolId: string
  userPoolClientId: string
}

export interface AuthTokens {
  accessToken: string
  idToken?: string
  refreshToken?: string
}

export interface AuthSessionSnapshot {
  tokens: AuthTokens | null
}

export const SignInStep = {
  done: 'DONE',
  confirmNewPassword: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED',
} as const

let accessToken: string | null = null
let tokenCounter = 0

/** Cognitoの設定（テストでは何もしない）。 */
export function configureCognito(_config: CognitoConfig): void {
  // テストではCognitoへ接続しない
}

export function isSessionExpiredError(_error: unknown): boolean {
  return false
}

/** 現在のセッション。未ログインならtokensがnull。 */
export async function fetchSession(): Promise<AuthSessionSnapshot> {
  return { tokens: accessToken !== null ? { accessToken } : null }
}

export interface SignInResult {
  isSignedIn: boolean
  nextStep: { signInStep: string }
}

/** テスト用のサインイン。常に成功する。 */
export async function signIn(_username: string, _password: string): Promise<SignInResult> {
  tokenCounter += 1
  accessToken = `e2e-token-${tokenCounter}`
  return { isSignedIn: true, nextStep: { signInStep: SignInStep.done } }
}

/** 初回パスワード変更（テストでは常に成功する）。 */
export async function completeNewPassword(_newPassword: string): Promise<SignInResult> {
  tokenCounter += 1
  accessToken = `e2e-token-${tokenCounter}`
  return { isSignedIn: true, nextStep: { signInStep: SignInStep.done } }
}

/** サインアウト。メモリ上のトークンを破棄する。 */
export async function signOutUser(): Promise<void> {
  accessToken = null
}
