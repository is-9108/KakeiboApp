import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReceiptUpload from './ReceiptUpload'
import { AccessTokenRefreshError, requestReceiptUploadUrl, uploadReceiptToS3 } from '../api/client'

vi.mock('../api/client', async importOriginal => ({
  ...await importOriginal<typeof import('../api/client')>(),
  requestReceiptUploadUrl: vi.fn(), uploadReceiptToS3: vi.fn(),
}))
const target = { uploadUrl: 'https://s3.example', key: 'receipts/key', expiresAt: '', headers: { 'Content-Type': 'image/png' } }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requestReceiptUploadUrl).mockResolvedValue(target)
  vi.mocked(uploadReceiptToS3).mockResolvedValue()
})
function select(type = 'image/png', size = 1) {
  const file = new File(['a'], 'receipt.png', { type })
  Object.defineProperty(file, 'size', { value: size })
  fireEvent.change(screen.getByLabelText('レシート画像'), { target: { files: [file] } })
}
it('ボタンからカメラ対応のファイル選択を開く', () => {
  render(<ReceiptUpload onSessionExpired={vi.fn()} />)
  const input = screen.getByLabelText('レシート画像')
  const click = vi.spyOn(input, 'click')
  fireEvent.click(screen.getByRole('button', { name: 'レシートから登録' }))
  expect(click).toHaveBeenCalledOnce()
  expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
  expect(input).toHaveAttribute('capture', 'environment')
})
it.each([['image/gif', 1], ['image/png', 0], ['image/png', 10485761]])('不正ファイルを送信前に拒否する %s %s', (type, size) => {
  render(<ReceiptUpload onSessionExpired={vi.fn()} />)
  select(type as string, size as number)
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(requestReceiptUploadUrl).not.toHaveBeenCalled()
  expect(uploadReceiptToS3).not.toHaveBeenCalled()
})
it('送信中の二重送信を防ぎ、完了を表示する', async () => {
  let resolve!: () => void
  vi.mocked(uploadReceiptToS3).mockReturnValue(new Promise<void>(done => { resolve = done }))
  render(<ReceiptUpload onSessionExpired={vi.fn()} />)
  select()
  await waitFor(() => expect(uploadReceiptToS3).toHaveBeenCalledOnce())
  expect(screen.getByRole('status')).toHaveTextContent('アップロード中…')
  expect(screen.getByRole('button')).toBeDisabled()
  select()
  expect(requestReceiptUploadUrl).toHaveBeenCalledOnce()
  await act(async () => resolve())
  expect(screen.getByRole('status')).toHaveTextContent('アップロードしました。')
})
it.each(['署名', 'PUT'])('%s失敗後に再選択できる', async stage => {
  if (stage === '署名') vi.mocked(requestReceiptUploadUrl).mockRejectedValueOnce(new Error())
  else vi.mocked(uploadReceiptToS3).mockRejectedValueOnce(new Error())
  render(<ReceiptUpload onSessionExpired={vi.fn()} />)
  select()
  expect(await screen.findByRole('alert')).toHaveTextContent('アップロードに失敗しました。')
  select()
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('アップロードしました。'))
})
it('セッション失効を親へ伝える', async () => {
  const expired = vi.fn()
  vi.mocked(requestReceiptUploadUrl).mockRejectedValue(new AccessTokenRefreshError())
  render(<ReceiptUpload onSessionExpired={expired} />)
  select()
  await waitFor(() => expect(expired).toHaveBeenCalledOnce())
})
it('アンマウント後にPUTを開始しない', async () => {
  let resolve!: (value: typeof target) => void
  vi.mocked(requestReceiptUploadUrl).mockReturnValue(new Promise(done => { resolve = done }))
  const view = render(<ReceiptUpload onSessionExpired={vi.fn()} />)
  select()
  view.unmount()
  await act(async () => resolve(target))
  expect(uploadReceiptToS3).not.toHaveBeenCalled()
})
