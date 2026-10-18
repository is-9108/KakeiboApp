import { fetchEntries, AccessTokenRefreshError } from './client'
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
