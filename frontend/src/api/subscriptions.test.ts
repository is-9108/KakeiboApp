import { fetchSubscriptions, createSubscription, updateSubscription, deleteSubscription, ApiValidationError, ApiError, AccessTokenRefreshError } from './client'
import { fetchSession } from '../auth/amplifyAuth'
vi.mock('../auth/amplifyAuth', () => ({ fetchSession: vi.fn(), isSessionExpiredError: () => false }))
const payload = { name: '動画', amount: 1000, memo: '' }
const saved = { id: 1, ...payload }
const response = (status: number, body?: unknown) => ({ status, ok: status >= 200 && status < 300, json: vi.fn().mockResolvedValue(body) }) as unknown as Response
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  vi.mocked(fetchSession).mockResolvedValue({ tokens: { accessToken: 'token' } })
})
afterEach(() => vi.unstubAllGlobals())
it('認証ヘッダーを付けてサブスクCRUDを呼ぶ', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(response(200, [saved])).mockResolvedValueOnce(response(201, saved)).mockResolvedValueOnce(response(200, saved)).mockResolvedValueOnce(response(204))
  expect(await fetchSubscriptions()).toEqual([saved])
  expect(await createSubscription(payload)).toEqual(saved)
  expect(await updateSubscription(1, payload)).toEqual(saved)
  await expect(deleteSubscription(1)).resolves.toBeUndefined()
  expect(fetch).toHaveBeenNthCalledWith(1, '/api/subscriptions', { headers: { Authorization: 'Bearer token' } })
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/subscriptions', { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  expect(fetch).toHaveBeenNthCalledWith(3, '/api/subscriptions/1', { method: 'PUT', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  expect(fetch).toHaveBeenNthCalledWith(4, '/api/subscriptions/1', { method: 'DELETE', headers: { Authorization: 'Bearer token' } })
})
it.each([fetchSubscriptions, () => createSubscription(payload), () => updateSubscription(1, payload), () => deleteSubscription(1)])('401を認証失効へ変換する', async (call) => {
  vi.mocked(fetch).mockResolvedValue(response(401))
  await expect(call()).rejects.toBeInstanceOf(AccessTokenRefreshError)
})
it('400の項目エラーを保持する', async () => {
  vi.mocked(fetch).mockResolvedValue(response(400, { errors: { name: ['必須'] } }))
  await expect(createSubscription(payload)).rejects.toBeInstanceOf(ApiValidationError)
})
it.each([403, 404, 500])('HTTPエラーのステータスを保持する: %s', async (status) => {
  vi.mocked(fetch).mockResolvedValue(response(status))
  await expect(updateSubscription(1, payload)).rejects.toMatchObject({ status, name: ApiError.name })
})
it('通信失敗を自動再送しない', async () => {
  const error = new Error('通信失敗')
  vi.mocked(fetch).mockRejectedValue(error)
  await expect(createSubscription(payload)).rejects.toBe(error)
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('204の本文を解析しない', async () => {
  const res = response(204)
  vi.mocked(fetch).mockResolvedValue(res)
  await deleteSubscription(1)
  expect(res.json).not.toHaveBeenCalled()
})
