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

/** 400の項目別検証エラー。errorsはAPIのProblemDetailsのerrorsをそのまま保持する。 */
export class ApiValidationError extends ApiError {
  readonly errors: Record<string, string[]>

  constructor(errors: Record<string, string[]>) {
    super('入力内容を確認してください。', 400)
    this.name = 'ApiValidationError'
    this.errors = errors
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

/** 登録・編集で送る収支の値。 */
export interface EntryPayload {
  date: string
  type: string
  amount: number
  category: string
  memo: string
}

/** カテゴリ別の支出内訳。 */
export interface ExpenseBreakdownItem {
  category: string
  amount: number
  percentage: number
}

/** 月次集計。バックエンドのMonthlySummaryResponseと同じ項目。 */
export interface ApiMonthlySummary {
  month: string
  incomeTotal: number
  expenseTotal: number
  balance: number
  expenseBreakdown: ExpenseBreakdownItem[]
}

/**
 * 有効なアクセストークンを取得する。
 * refresh tokenの失効だけを AccessTokenRefreshError に変換し、通信障害はそのまま投げる。
 */
async function getAccessToken(): Promise<string> {
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
  const accessToken = session.tokens?.accessToken
  if (!accessToken) throw new AccessTokenRefreshError()
  return accessToken
}

/** 認証ヘッダーを付けてAPIへ要求する。 */
async function sendRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = await getAccessToken()
  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  })
}

async function readValidationErrors(response: Response): Promise<Record<string, string[]> | null> {
  try {
    const body = (await response.json()) as { errors?: unknown }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return null
    }
    const rawErrors = body.errors
    if (rawErrors === null || typeof rawErrors !== 'object' || Array.isArray(rawErrors)) {
      return null
    }
    const errors: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(rawErrors as Record<string, unknown>)) {
      if (key.trim() === '' || !Array.isArray(value)) continue
      const messages = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      if (messages.length > 0) {
        errors[key] = messages
      }
    }
    // 有効な項目が1件もない場合も、呼び出し側が汎用400として扱えるよう空オブジェクトを返す。
    return errors
  } catch {
    // JSONでない400は項目別エラーとして扱わない。
    return null
  }
}

/**
 * ステータスを検証する。
 * 401とrefresh token失効だけをセッション失効とし、他の失敗はApiErrorとして扱う。
 */
async function ensureOk(response: Response): Promise<void> {
  if (response.status === 401) {
    throw new AccessTokenRefreshError()
  }
  if (response.ok) return
  if (response.status === 400) {
    const errors = await readValidationErrors(response)
    if (errors !== null) throw new ApiValidationError(errors)
  }
  throw new ApiError('APIの呼び出しに失敗しました。', response.status)
}

/**
 * 指定月の収支一覧をAPIから取得する。
 */
export async function fetchEntries(month: string): Promise<ApiEntry[]> {
  const response = await sendRequest(`/api/entries?month=${encodeURIComponent(month)}`)
  await ensureOk(response)
  return (await response.json()) as ApiEntry[]
}

/** 指定月の月次集計をAPIから取得する。 */
export async function fetchSummary(month: string): Promise<ApiMonthlySummary> {
  const response = await sendRequest(`/api/entries/summary?month=${encodeURIComponent(month)}`)
  await ensureOk(response)
  return (await response.json()) as ApiMonthlySummary
}

/** 収支を登録する。 */
export async function createEntry(payload: EntryPayload): Promise<ApiEntry> {
  const response = await sendRequest('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  await ensureOk(response)
  return (await response.json()) as ApiEntry
}

/** 収支を更新する。全項目を置換する。 */
export async function updateEntry(id: number, payload: EntryPayload): Promise<ApiEntry> {
  const response = await sendRequest(`/api/entries/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  await ensureOk(response)
  return (await response.json()) as ApiEntry
}

/** 収支を削除する。成功時は204で本文なし。 */
export async function deleteEntry(id: number): Promise<void> {
  const response = await sendRequest(`/api/entries/${id}`, { method: 'DELETE' })
  await ensureOk(response)
}
