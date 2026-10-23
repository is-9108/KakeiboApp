import { fetchSession, isSessionExpiredError } from '../auth/amplifyAuth'
import type { EntryInput } from '../domain/entries'

/** API呼び出し共通のエラー。 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * 入力内容がAPIのバリデーションに引っかかったことを示すエラー。
 * fieldErrorsには項目名ごとのメッセージ配列が入る（ValidationProblemの.errors）。
 */
export class ApiValidationError extends ApiError {
  readonly fieldErrors: Readonly<Record<string, readonly string[]>>

  constructor(message: string, fieldErrors: Record<string, readonly string[]>) {
    super(message, 400)
    this.name = 'ApiValidationError'
    this.fieldErrors = fieldErrors
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

/** 月次集計。バックエンドのMonthlySummaryResponseと同じ項目。 */
export interface ApiSummary {
  month: string
  incomeTotal: number
  expenseTotal: number
  balance: number
  expenseBreakdown: {
    category: string
    amount: number
    percentage: number
  }[]
}

const TRANSPORT_ERROR_MESSAGE = 'APIの呼び出しに失敗しました。通信状態を確認して再試行してください。'
const VALIDATION_ERROR_MESSAGE = '入力内容を確認してください。'
const NOT_FOUND_MESSAGE = '対象の収支が存在しません。すでに削除された可能性があります。'
const SERVER_ERROR_MESSAGE = 'APIの呼び出しに失敗しました。しばらくしてから再試行してください。'

function assertTokenAvailable(accessToken?: string): string {
  if (!accessToken) throw new AccessTokenRefreshError()
  return accessToken
}

/** トークンを取得してfetchする共通処理。401と非成功のHTTPステータスをエラーへ変換する。 */
async function authedFetch(
  path: string,
  init?: { method?: 'POST' | 'PUT' | 'DELETE'; body?: unknown },
): Promise<Response> {
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

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  }
  const requestInit: RequestInit = { headers }
  if (init?.method !== undefined) {
    requestInit.method = init.method
  }
  if (init?.body !== undefined) {
    requestInit.body = JSON.stringify(init.body)
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(path, requestInit)
  } catch (error) {
    if (error instanceof AccessTokenRefreshError) {
      throw error
    }
    // 通信断など本科生の拒否は認証失効へ変換せず、日本語の通信エラーにする。
    throw new ApiError(TRANSPORT_ERROR_MESSAGE, 0)
  }

  if (response.status === 401) {
    throw new AccessTokenRefreshError()
  }
  if (!response.ok) {
    throw await toApiError(response)
  }
  return response
}

/** 非成功レスポンスを、ステータスと本文の形に応じたエラーへ変換する。 */
async function toApiError(response: Response): Promise<ApiError> {
  if (response.status === 404) {
    return new ApiError(NOT_FOUND_MESSAGE, 404)
  }

  if (response.status === 400) {
    try {
      const body = (await response.json()) as {
        errors?: unknown
      }
      const fieldErrors = toStringRecord(body?.errors)
      if (Object.keys(fieldErrors).length > 0) {
        return new ApiValidationError(VALIDATION_ERROR_MESSAGE, fieldErrors)
      }
    } catch {
      // 本文がJSONでない400も入力エラーとして扱う
    }
    return new ApiError(VALIDATION_ERROR_MESSAGE, 400)
  }

  return new ApiError(SERVER_ERROR_MESSAGE, response.status)
}

/** ValidationProblemの.errorsを、文字列配列の辞書に正規化する。形が違う項目は捨てる。 */
function toStringRecord(errors: unknown): Record<string, readonly string[]> {
  if (typeof errors !== 'object' || errors === null) {
    return {}
  }
  const result: Record<string, readonly string[]> = {}
  for (const [field, messages] of Object.entries(errors as Record<string, unknown>)) {
    if (Array.isArray(messages)) {
      result[field] = messages.filter((m): m is string => typeof m === 'string')
    }
  }
  return result
}

/**
 * 指定月の収支一覧をAPIから取得する。
 * 401はセッション失効として扱い、AccessTokenRefreshErrorを投げる。
 */
export async function fetchEntries(month: string): Promise<ApiEntry[]> {
  const response = await authedFetch(`/api/entries?month=${encodeURIComponent(month)}`)
  return (await response.json()) as ApiEntry[]
}

/**
 * 指定月の月次集計をAPIから取得する。
 */
export async function fetchSummary(month: string): Promise<ApiSummary> {
  const response = await authedFetch(`/api/entries/summary?month=${encodeURIComponent(month)}`)
  return (await response.json()) as ApiSummary
}

/**
 * 収支を登録する。成功時は作成された収支を返す。
 */
export async function createEntry(input: EntryInput): Promise<ApiEntry> {
  const response = await authedFetch('/api/entries/', { method: 'POST', body: input })
  return (await response.json()) as ApiEntry
}

/**
 * 収支を編集する。成功時は更新後の収支を返す。
 */
export async function updateEntry(id: number, input: EntryInput): Promise<ApiEntry> {
  const response = await authedFetch(`/api/entries/${id}`, { method: 'PUT', body: input })
  return (await response.json()) as ApiEntry
}

/**
 * 収支を削除する。204を成功として扱い、JSONは解析しない。
 */
export async function deleteEntry(id: number): Promise<void> {
  const response = await authedFetch(`/api/entries/${id}`, { method: 'DELETE' })
  if (response.status !== 204) {
    throw new ApiError(SERVER_ERROR_MESSAGE, response.status)
  }
}
