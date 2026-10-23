import {
  AccessTokenRefreshError,
  ApiError,
  createEntry,
  deleteEntry,
  fetchEntries,
  fetchSummary,
  updateEntry,
  type ApiEntry,
  type ApiSummary,
} from './client'
import type { EntryInput } from '../domain/entries'
import { fetchSession } from '../auth/amplifyAuth'

vi.mock('../auth/amplifyAuth', () => ({
  fetchSession: vi.fn(),
  isSessionExpiredError: (error: unknown) =>
    ['NotAuthorizedException', 'InvalidGrantException', 'RefreshTokenExpiredException', 'TokenRefreshException']
      .includes((error as { name?: string } | null)?.name ?? ''),
}))

describe('fetchEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the refreshed access token as a Bearer token', async () => {
    vi.mocked(fetchSession).mockResolvedValue({ tokens: { accessToken: 'fresh-access-token' } })
    vi.mocked(fetch).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => [],
    } as Response)

    await expect(fetchEntries('2031-01')).resolves.toEqual([])

    expect(fetch).toHaveBeenCalledWith('/api/entries?month=2031-01', {
      headers: { Authorization: 'Bearer fresh-access-token' },
    })
  })

  it('turns an API 401 into an authentication-expired error', async () => {
    vi.mocked(fetchSession).mockResolvedValue({ tokens: { accessToken: 'expired-token' } })
    vi.mocked(fetch).mockResolvedValue({ status: 401, ok: false } as Response)

    await expect(fetchEntries('2031-01')).rejects.toBeInstanceOf(AccessTokenRefreshError)
  })

  it('turns refresh-token rejection into an authentication-expired error', async () => {
    vi.mocked(fetchSession).mockRejectedValue(
      Object.assign(new Error('refresh rejected'), { name: 'NotAuthorizedException' }),
    )

    await expect(fetchEntries('2031-01')).rejects.toBeInstanceOf(AccessTokenRefreshError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('preserves transient session network errors instead of logging the user out', async () => {
    const networkError = Object.assign(new Error('offline'), { name: 'NetworkError' })
    vi.mocked(fetchSession).mockRejectedValue(networkError)

    await expect(fetchEntries('2031-01')).rejects.toBe(networkError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('turns other non-success HTTP responses into ApiError with status', async () => {
    vi.mocked(fetchSession).mockResolvedValue({ tokens: { accessToken: 'token' } })
    vi.mocked(fetch).mockResolvedValue({ status: 500, ok: false } as Response)

    await expect(fetchEntries('2031-01')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
    })
  })
})

/** fetchSession と fetch を整えて有効トークンを返す共通の準備 */
async function stubAuthenticatedApi() {
  vi.mocked(fetchSession).mockResolvedValue({ tokens: { accessToken: 'access-token' } })
  return vi.mocked(fetch)
}

/** fetchモックの最後の呼び出し引数を取り出す */
function lastFetchCall() {
  const call = vi.mocked(fetch).mock.calls.at(-1)
  if (!call) throw new Error('fetch is not called')
  const [url, init] = call
  return { url: String(url), init: (init ?? {}) as RequestInit }
}

/** JSON応答のResponseモックを作る */
function jsonResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return { status, ok, json: async () => body } as Response
}

describe('fetchSummary (T5・T7)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('月次集計APIをGETして結果を返す', async () => {
    await stubAuthenticatedApi()
    const summary: ApiSummary = {
      month: '2026-10',
      incomeTotal: 10000,
      expenseTotal: 3000,
      balance: 7000,
      expenseBreakdown: [
        { category: '食費', amount: 2000, percentage: 66.7 },
        { category: '外食費', amount: 1000, percentage: 33.3 },
      ],
    }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, summary))

    await expect(fetchSummary('2026-10')).resolves.toEqual(summary)
    expect(lastFetchCall()).toMatchObject({
      url: '/api/entries/summary?month=2026-10',
      init: expect.objectContaining({ headers: { Authorization: 'Bearer access-token' } }),
    })
  })

  it('401はセッション失効エラーになる', async () => {
    await stubAuthenticatedApi()
    vi.mocked(fetch).mockResolvedValue({ status: 401, ok: false } as Response)

    await expect(fetchSummary('2026-10')).rejects.toBeInstanceOf(AccessTokenRefreshError)
  })

  it('500は日本語メッセージのApiErrorになる', async () => {
    await stubAuthenticatedApi()
    vi.mocked(fetch).mockResolvedValue({ status: 500, ok: false } as Response)

    await expect(fetchSummary('2026-10')).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: expect.stringMatching(/API/),
    })
  })
})

describe('createEntry (T18)', () => {
  const input: EntryInput = {
    date: '2026-10-20',
    type: '支出',
    amount: 500,
    category: '食費',
    memo: 'スーパー',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('JSONボディとContent-Typeを付けてPOSTし、201の応答を返す', async () => {
    await stubAuthenticatedApi()
    const created: ApiEntry = { id: 9, ...input }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, created))

    await expect(createEntry(input)).resolves.toEqual(created)
    expect(lastFetchCall()).toMatchObject({
      url: '/api/entries/',
      init: expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer access-token', 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    })
  })

  it('400のValidationProblemを項目別エラーに変換する (T19)', async () => {
    await stubAuthenticatedApi()
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, {
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { amount: ['金額は1以上の整数を指定してください。'] },
      }),
    )

    const error = await createEntry(input).catch((e) => e)
    expect(error.name).toBe('ApiValidationError')
    expect(error.status).toBe(400)
    expect(error.fieldErrors).toEqual({ amount: ['金額は1以上の整数を指定してください。'] })
  })

  it('400がJSONArray以外でも、日本語の全体エラーとして扱える (T19)', async () => {
    await stubAuthenticatedApi()
    vi.mocked(fetch).mockResolvedValue(new Response('Bad Request', { status: 400 }))

    await expect(createEntry(input)).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
    })
  })

  it('401はセッション失効エラーになる', async () => {
    await stubAuthenticatedApi()
    vi.mocked(fetch).mockResolvedValue({ status: 401, ok: false } as Response)

    await expect(createEntry(input)).rejects.toBeInstanceOf(AccessTokenRefreshError)
  })
})

describe('updateEntry (T18)', () => {
  const input: EntryInput = {
    date: '2026-10-21',
    type: '収入',
    amount: 250000,
    category: '給与',
    memo: '10月分',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('対象IDにJSONボディでPUTし、200の応答を返す', async () => {
    await stubAuthenticatedApi()
    const updated: ApiEntry = { id: 3, ...input }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, updated))

    await expect(updateEntry(3, input)).resolves.toEqual(updated)
    expect(lastFetchCall()).toMatchObject({
      url: '/api/entries/3',
      init: expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    })
  })

  it('404は日本語メッセージのApiErrorになる (T22)', async () => {
    await stubAuthenticatedApi()
    vi.mocked(fetch).mockResolvedValue({ status: 404, ok: false } as Response)

    await expect(updateEntry(3, input)).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: expect.any(String),
    })
  })
})

describe('deleteEntry (T18)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('対象IDをDELETEし、204ではJSONを解析しない', async () => {
    await stubAuthenticatedApi()
    const json = vi.fn()
    vi.mocked(fetch).mockResolvedValue({ status: 204, ok: true, json } as unknown as Response)

    await expect(deleteEntry(7)).resolves.toBeUndefined()
    expect(lastFetchCall()).toMatchObject({
      url: '/api/entries/7',
      init: expect.objectContaining({ method: 'DELETE' }),
    })
    expect(json).not.toHaveBeenCalled()
  })

  it('404は日本語メッセージのApiErrorになる (T22)', async () => {
    await stubAuthenticatedApi()
    vi.mocked(fetch).mockResolvedValue({ status: 404, ok: false } as Response)

    await expect(deleteEntry(7)).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: expect.any(String),
    })
  })
})

describe('通信エラーの扱い (T22)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchの拒否は日本語メッセージのApiErrorになり、認証失効扱いにしない', async () => {
    await stubAuthenticatedApi()
    const networkError = new TypeError('Failed to fetch')
    vi.mocked(fetch).mockRejectedValue(networkError)

    const error = await fetchEntries('2026-10').catch((e) => e)
    expect(error.name).toBe('ApiError')
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).not.toBe('Failed to fetch')
    expect(error.message).toMatch(/API/)
  })
})
