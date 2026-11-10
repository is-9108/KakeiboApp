import { fetchSession } from '../auth/amplifyAuth'
import { AccessTokenRefreshError, requestReceiptUploadUrl, uploadReceiptToS3 } from './client'

vi.mock('../auth/amplifyAuth', () => ({ fetchSession: vi.fn(), isSessionExpiredError: () => false }))
const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.mocked(fetchSession).mockResolvedValue({ tokens: { accessToken: 'token' } })
})
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks() })
const file = new File(['abc'], 'receipt.png', { type: 'image/png' })
const target = { uploadUrl: 'https://s3.example/upload?signature=abc', key: 'receipts/key.png', expiresAt: '', headers: { 'Content-Type': 'image/png' } }

it('認証付きで署名を要求する', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(target)))
  expect(await requestReceiptUploadUrl(file)).toEqual(target)
  expect(fetchMock).toHaveBeenCalledWith('/api/receipts/upload-url', expect.objectContaining({
    method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  }))
})
it('401はセッション失効として扱う', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
  await expect(requestReceiptUploadUrl(file)).rejects.toBeInstanceOf(AccessTokenRefreshError)
})
it('S3には認証トークンを付けず取得したURLへ直接PUTする', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
  await uploadReceiptToS3(target, file)
  expect(fetchMock).toHaveBeenCalledWith(target.uploadUrl, {
    method: 'PUT', headers: { 'Content-Type': file.type }, body: file, credentials: 'omit',
  })
})
it.each([403, 500])('S3の%sを失敗として扱う', async status => {
  fetchMock.mockResolvedValue(new Response(null, { status }))
  await expect(uploadReceiptToS3(target, file)).rejects.toThrow()
})
it('通信失敗を呼び出し元へ返す', async () => {
  fetchMock.mockRejectedValue(new TypeError('network'))
  await expect(uploadReceiptToS3(target, file)).rejects.toThrow()
})
