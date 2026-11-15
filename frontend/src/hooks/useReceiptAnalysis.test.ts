import { act, renderHook } from '@testing-library/react'
import { AccessTokenRefreshError, ApiError, fetchReceiptAnalysis, type ApiReceiptAnalysis } from '../api/client'
import { useReceiptAnalysis } from './useReceiptAnalysis'

vi.mock('../api/client', async original => ({ ...await original<typeof import('../api/client')>(), fetchReceiptAnalysis: vi.fn() }))
const result: ApiReceiptAnalysis = { id: 'job-1', status: '待機中', date: null, amount: null, storeName: null, category: null, createdAt: '', updatedAt: '' }
const expired = vi.fn()
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); vi.mocked(fetchReceiptAnalysis).mockResolvedValue(result) })
afterEach(() => { vi.useRealTimers() })
async function advance(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
function start(id: string | null = 'job-1') { return renderHook(({ jobId }) => useReceiptAnalysis(jobId, expired), { initialProps: { jobId: id } }) }
it('未開始では取得せず、開始直後と待機中は2秒ごとに取得する', async () => {
  const hook = start(null)
  expect(hook.result.current.phase).toBe('idle')
  expect(fetchReceiptAnalysis).not.toHaveBeenCalled()
  hook.rerender({ jobId: 'job-1' })
  await advance()
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(1)
  expect(fetchReceiptAnalysis).toHaveBeenCalledWith('job-1')
  expect(hook.result.current.phase).toBe('polling')
  await advance(1999)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(1)
  await advance(1)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(2)
})
it.each(['完了', '失敗'] as const)('%sで停止する', async status => {
  vi.mocked(fetchReceiptAnalysis).mockResolvedValue({ ...result, status })
  const hook = start()
  await advance()
  expect(hook.result.current.phase).toBe(status === '完了' ? 'completed' : 'failed')
  if (status === '完了') expect(hook.result.current.analysis).toEqual({ ...result, status })
  await advance(60000)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(1)
})
it('59秒では待機し60秒で期限切れになり取得を止める', async () => {
  const hook = start()
  await advance(59000)
  expect(hook.result.current.phase).toBe('polling')
  await advance(1000)
  expect(hook.result.current.phase).toBe('timeout')
  const calls = vi.mocked(fetchReceiptAnalysis).mock.calls.length
  await advance(60000)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(calls)
})
it.each([new ApiError('一時的', 503), new TypeError('通信断')])('一時的な通信失敗後も再試行する %s', async error => {
  vi.mocked(fetchReceiptAnalysis).mockRejectedValueOnce(error).mockResolvedValue({ ...result, status: '完了' })
  const hook = start()
  await advance()
  expect(hook.result.current.phase).toBe('polling')
  await advance(2000)
  expect(hook.result.current.phase).toBe('completed')
})
it('404は失敗として停止する', async () => {
  vi.mocked(fetchReceiptAnalysis).mockRejectedValue(new ApiError('不明', 404))
  const hook = start()
  await advance(60000)
  expect(hook.result.current.phase).toBe('failed')
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(1)
})
it('401はログアウトへ一度通知して停止する', async () => {
  vi.mocked(fetchReceiptAnalysis).mockRejectedValue(new AccessTokenRefreshError())
  start()
  await advance(60000)
  expect(expired).toHaveBeenCalledTimes(1)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(1)
})
it.each(['キャンセル', '変更', 'アンマウント', '期限切れ'])('%s後の遅延応答を破棄し多重取得しない', async operation => {
  let resolve!: (value: ApiReceiptAnalysis) => void
  vi.mocked(fetchReceiptAnalysis).mockReturnValueOnce(new Promise(done => { resolve = done }))
  const hook = start()
  await advance(4000)
  expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(1)
  if (operation === 'キャンセル') hook.rerender({ jobId: null })
  if (operation === '変更') hook.rerender({ jobId: 'job-2' })
  if (operation === 'アンマウント') hook.unmount()
  if (operation === '期限切れ') await advance(56000)
  await act(async () => resolve({ ...result, status: '完了' }))
  if (operation !== 'アンマウント') expect(hook.result.current.phase).not.toBe('completed')
  const calls = vi.mocked(fetchReceiptAnalysis).mock.calls.length
  if (operation !== '変更') { await advance(60000); expect(fetchReceiptAnalysis).toHaveBeenCalledTimes(calls) }
  hook.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
