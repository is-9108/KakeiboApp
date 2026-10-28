import {
  ApiError,
  ApiValidationError,
  AccessTokenRefreshError,
  createEntry,
  deleteEntry,
  fetchEntries,
  fetchSummary,
  updateEntry,
  type EntryPayload,
} from './client'
import { fetchSession } from '../auth/amplifyAuth'

const payload: EntryPayload = {
  date: '2026-10-28',
  type: '支出',
  amount: 1500,
  category: '外食費',
  memo: '昼食',
}

const summary = {
  month: '2026-10',
  incomeTotal: 53000,
  expenseTotal: 1700,
  balance: 51300,
  expenseBreakdown: [
    { category: '外食費', amount: 1200, percentage: 70.6 },
    { category: '食費', amount: 500, percentage: 29.4 },
  ],
}

function jsonResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response
}

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

describe('fetchSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(fetchSession).mockResolvedValue({ tokens: { accessToken: 'token' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests the monthly summary with the bearer token（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, summary))

    await expect(fetchSummary('2026-10')).resolves.toEqual(summary)

    expect(fetch).toHaveBeenCalledWith('/api/entries/summary?month=2026-10', {
      headers: { Authorization: 'Bearer token' },
    })
  })

  it('turns a 401 into an authentication-expired error（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 401, ok: false } as Response)

    await expect(fetchSummary('2026-10')).rejects.toBeInstanceOf(AccessTokenRefreshError)
  })

  it('rejects when the session has no access token（T19）', async () => {
    vi.mocked(fetchSession).mockResolvedValue({ tokens: null })

    await expect(fetchSummary('2026-10')).rejects.toBeInstanceOf(AccessTokenRefreshError)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('turns a refresh-token rejection into an authentication-expired error（T19）', async () => {
    vi.mocked(fetchSession).mockRejectedValue(
      Object.assign(new Error('refresh rejected'), { name: 'RefreshTokenExpiredException' }),
    )

    await expect(fetchSummary('2026-10')).rejects.toBeInstanceOf(AccessTokenRefreshError)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('createEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(fetchSession).mockResolvedValue({ tokens: { accessToken: 'token' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the payload as JSON and returns the created entry（T19）', async () => {
    const created = { id: 7, ...payload }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(201, created))

    await expect(createEntry(payload)).resolves.toEqual(created)

    expect(fetch).toHaveBeenCalledWith('/api/entries', {
      method: 'POST',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  })

  it('exposes field errors from a 400 validation problem（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, {
        type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { amount: ['金額は1以上の整数を指定してください。'] },
      }),
    )

    await expect(createEntry(payload)).rejects.toMatchObject({
      name: 'ApiValidationError',
      status: 400,
      errors: { amount: ['金額は1以上の整数を指定してください。'] },
    })
    await expect(createEntry(payload)).rejects.toBeInstanceOf(ApiValidationError)
  })

  it('falls back to ApiError when a 400 body is not a validation problem（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue({
      status: 400,
      ok: false,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)

    await expect(createEntry(payload)).rejects.toMatchObject({ name: 'ApiError', status: 400 })
    await expect(createEntry(payload)).rejects.not.toBeInstanceOf(ApiValidationError)
  })

  it('treats a 400 without an errors object as a plain ApiError（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { title: 'Bad Request', status: 400 }))

    await expect(createEntry(payload)).rejects.toMatchObject({ name: 'ApiError', status: 400 })
    await expect(createEntry(payload)).rejects.not.toBeInstanceOf(ApiValidationError)
  })

  it('accepts an empty errors object so the caller can show a generic message（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { status: 400, errors: {} }))

    const error = await createEntry(payload).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ApiValidationError)
    expect((error as ApiValidationError).errors).toEqual({})
  })

  it('rejects a non-object errors value as a plain ApiError（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, { status: 400, errors: [] }))

    const error = await createEntry(payload).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).not.toBeInstanceOf(ApiValidationError)
  })

  it('drops malformed field entries but keeps valid strings（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, {
        status: 400,
        errors: {
          amount: 'not-an-array',
          amount2: [123, ''],
          category: [123, 'カテゴリは必須です。'],
          date: [],
        },
      }),
    )

    const error = (await createEntry(payload).catch((err: unknown) => err)) as ApiValidationError
    expect(error).toBeInstanceOf(ApiValidationError)
    expect(error.errors).toEqual({ category: ['カテゴリは必須です。'] })
  })

  it('returns an empty errors object when no field error is valid（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(400, {
        status: 400,
        errors: { amount: 'not-an-array', date: [], memo: [123, ''] },
      }),
    )

    const error = (await createEntry(payload).catch((err: unknown) => err)) as ApiValidationError
    expect(error).toBeInstanceOf(ApiValidationError)
    expect(error.errors).toEqual({})
  })

  it('turns a 401 into an authentication-expired error（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 401, ok: false } as Response)

    await expect(createEntry(payload)).rejects.toBeInstanceOf(AccessTokenRefreshError)
  })
})

describe('updateEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(fetchSession).mockResolvedValue({ tokens: { accessToken: 'token' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('puts every field to the entry URL（T19）', async () => {
    const updated = { id: 9, ...payload }
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, updated))

    await expect(updateEntry(9, payload)).resolves.toEqual(updated)

    expect(fetch).toHaveBeenCalledWith('/api/entries/9', {
      method: 'PUT',
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  })

  it('reports a 404 as ApiError with status 404（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 404, ok: false } as Response)

    await expect(updateEntry(9, payload)).rejects.toMatchObject({ name: 'ApiError', status: 404 })
  })
})

describe('deleteEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(fetchSession).mockResolvedValue({ tokens: { accessToken: 'token' } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('deletes without parsing a JSON body on 204（T19）', async () => {
    const json = vi.fn()
    vi.mocked(fetch).mockResolvedValue({ status: 204, ok: true, json } as unknown as Response)

    await expect(deleteEntry(9)).resolves.toBeUndefined()

    expect(fetch).toHaveBeenCalledWith('/api/entries/9', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer token' },
    })
    expect(json).not.toHaveBeenCalled()
  })

  it('turns a 401 into an authentication-expired error（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 401, ok: false } as Response)

    await expect(deleteEntry(9)).rejects.toBeInstanceOf(AccessTokenRefreshError)
  })

  it('turns a 403 into ApiError without treating it as session expiry（T19）', async () => {
    vi.mocked(fetch).mockResolvedValue({ status: 403, ok: false } as Response)

    const error = await deleteEntry(9).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(403)
  })
})
