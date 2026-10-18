import { fetchSession, isSessionExpiredError } from '../auth/amplifyAuth'

/** API呼び出し共通のエラー。 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** アクセストークンの更新に失敗したことを示す特殊エラー。呼び出し側はログイン画面へ戻す。 */
export class AccessTokenRefreshError extends Error {
  constructor() {
    super('セッションが失効しました。再度ログインしてください。')
    this.name = 'AccessTokenRefreshError'
  }
}

/**
 * 収支一覧の1件。バックエンドのEntryResponseと同じ項目。
 */
export interface ApiEntry {
  id: number
  date: string
  type: string
  amount: number
  category: string
  memo: string
}

function assertTokenAvailable(accessToken?: string): string {
  if (!accessToken) throw new AccessTokenRefreshError()
  return accessToken
}

/**
 * 指定月の収支一覧をAPIから取得する。
 * 401はセッション失効として扱い、AccessTokenRefreshErrorを投げる。
 */
export async function fetchEntries(month: string): Promise<ApiEntry[]> {
  let session
  try {
    session = await fetchSession()
  } catch (error) {
    if (isSessionExpiredError(error)) {
      throw new AccessTokenRefreshError()
    }
    // NetworkError等の一時的な障害は認証失効として扱わない。
    throw error
  }
  const accessToken = assertTokenAvailable(session.tokens?.accessToken)

  const response = await fetch(`/api/entries?month=${encodeURIComponent(month)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (response.status === 401) {
    throw new AccessTokenRefreshError()
  }
  if (!response.ok) {
    throw new ApiError('APIの呼び出しに失敗しました。', response.status)
  }
  return (await response.json()) as ApiEntry[]
}
