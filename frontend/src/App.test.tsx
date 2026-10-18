import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { AppRoutes } from './App'
import { AuthProvider, type CognitoConfig } from './auth/AuthContext'
import { fetchSession, signIn, completeNewPassword, signOutUser } from './auth/amplifyAuth'
import { ApiError, fetchEntries } from './api/client'

/** テスト用のCognito設定（AuthProviderのconfigとして渡すがconfigureCognitoはモック済み） */
const testConfig: CognitoConfig = {
  region: 'us-east-1',
  userPoolId: 'us-east-1_testpool',
  userPoolClientId: 'client123',
}

vi.mock('./auth/amplifyAuth', () => ({
  configureCognito: vi.fn(),
  fetchSession: vi.fn(),
  signIn: vi.fn(),
  completeNewPassword: vi.fn(),
  signOutUser: vi.fn(),
  isSessionExpiredError: (error: unknown) =>
    ['NotAuthorizedException', 'InvalidGrantException', 'RefreshTokenExpiredException', 'TokenRefreshException']
      .includes((error as { name?: string } | null)?.name ?? ''),
  SignInStep: { confirmSignUpNewPasswordRequired: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
}))

vi.mock('./api/client', () => ({
  fetchEntries: vi.fn(),
  ApiError: class extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
    }
  },
  AccessTokenRefreshError: class extends Error {
    constructor() {
      super('セッションが失効しました。再度ログインしてください。')
      this.name = 'AccessTokenRefreshError'
    }
  },
}))

/** 各テストでのモック初期化をまとめる */
function setupMocks({
  session = null,
  sessionError = false,
}: {
  session?: { tokens: { accessToken: string } } | null
  sessionError?: boolean
} = {}) {
  vi.mocked(fetchSession).mockImplementation(() => {
    if (sessionError) return Promise.reject(new Error('session error'))
    return Promise.resolve(session as never)
  })
  vi.mocked(fetchEntries).mockResolvedValue([])
}

/** Appのルーティング部分だけをテスト用に描画する（本番のBrowserRouterの二重ラップを避ける） */
function renderApp(path = '/') {
  return render(
    <AuthProvider config={testConfig}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </AuthProvider>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="current-path">{location.pathname}</output>
}

async function fillAndSubmitLoginForm(username: string, password: string) {
  fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: username } })
  fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))
  await waitFor(() => {
    expect(vi.mocked(signIn)).toHaveBeenCalledTimes(1)
  })
}

describe('App（認証ガード）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('未ログインなら「/」でログイン画面を表示する（T9）', async () => {
    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    })
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login')
    expect(screen.queryByText('仮ページ')).not.toBeInTheDocument()
  })

  it('未ログインなら未知のURLでもログイン画面を表示する（T10）', async () => {
    renderApp('/unknown-path')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    })
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login')
    expect(screen.queryByText('仮ページ')).not.toBeInTheDocument()
  })

  it('セッション復元中は待機表示のみでログイン画面・本体を表示しない（T11）', async () => {
    vi.mocked(fetchSession).mockReturnValue(new Promise(() => undefined))

    renderApp()

    await waitFor(() => {
      expect(screen.getByTestId('checking-indicator')).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: 'ログイン' })).not.toBeInTheDocument()
    expect(screen.queryByText('仮ページ')).not.toBeInTheDocument()
  })

  it('保存済みセッションで再読み込みすると本体を表示する（T16）', async () => {
    setupMocks({ session: { tokens: { accessToken: 'valid-token' } } })

    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '仮ページ' })).toBeInTheDocument()
    })
  })

  it('ログイン成功すると仮ページへ遷移する（T12）', async () => {
    vi.mocked(signIn).mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } } as never)

    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    })
    await fillAndSubmitLoginForm('user@example.com', 'Passw0rd!')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '仮ページ' })).toBeInTheDocument()
    })
  })

  it('ログイン失敗するとエラーを表示しログイン画面のまま（T13）', async () => {
    vi.mocked(signIn).mockRejectedValue(Object.assign(new Error('bad credentials'), { name: 'NotAuthorizedException' }))

    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    })
    await fillAndSubmitLoginForm('user@example.com', 'wrong-pass')

    await waitFor(() => {
      expect(screen.getByText('メールアドレスまたはパスワードが正しくありません。')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
  })

  it('空欄のまま送信すると案内を表示しsignInを呼ばない（T13）', async () => {
    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    await waitFor(() => {
      expect(screen.getByText('メールアドレスとパスワードを入力してください。')).toBeInTheDocument()
    })
    expect(vi.mocked(signIn)).not.toHaveBeenCalled()
  })

  it('送信中の連続操作でログイン要求を重複させない（T13）', async () => {
    let resolveSignIn: ((value: unknown) => void) | undefined
    vi.mocked(signIn).mockImplementation(() => new Promise((resolve) => { resolveSignIn = resolve }) as never)
    renderApp('/login')

    await waitFor(() => expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'Passw0rd!' } })
    const button = screen.getByRole('button', { name: 'ログイン' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(vi.mocked(signIn)).toHaveBeenCalledTimes(1)
    resolveSignIn?.({ isSignedIn: true, nextStep: { signInStep: 'DONE' } })
  })

  it('初回パスワード変更を経由してログインできる（T14）', async () => {
    vi.mocked(signIn).mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    } as never)
    vi.mocked(completeNewPassword).mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } } as never)

    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    })
    await fillAndSubmitLoginForm('user@example.com', 'temp-pass')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'パスワード変更' })).toBeInTheDocument()
    })
    fireEvent.change(screen.getByLabelText('新しいパスワード'), { target: { value: 'NewPassw0rd!' } })
    fireEvent.click(screen.getByRole('button', { name: 'パスワードを変更する' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '仮ページ' })).toBeInTheDocument()
    })
  })

  it('初回パスワード変更がポリシー違反で失敗すると案内を表示する（T15）', async () => {
    vi.mocked(signIn).mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' },
    } as never)
    vi.mocked(completeNewPassword).mockRejectedValue(
      Object.assign(new Error('password does not meet policy'), { name: 'InvalidPasswordException' }),
    )

    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    })
    await fillAndSubmitLoginForm('user@example.com', 'temp-pass')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'パスワード変更' })).toBeInTheDocument()
    })
    fireEvent.change(screen.getByLabelText('新しいパスワード'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'パスワードを変更する' }))

    await waitFor(() => {
      expect(screen.getByText('パスワードはポリシーに一致させてください。')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'パスワード変更' })).toBeInTheDocument()
  })

  it('未対応の初回認証チャレンジでは保護画面へ進まない（T15）', async () => {
    vi.mocked(signIn).mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' },
    } as never)
    renderApp('/login')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument())
    await fillAndSubmitLoginForm('user@example.com', 'Passw0rd!')

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('未対応の認証ステップ'))
    expect(screen.queryByRole('heading', { name: '仮ページ' })).not.toBeInTheDocument()
  })

  it('ログアウトするとログイン画面に戻る（T19）', async () => {
    setupMocks({ session: { tokens: { accessToken: 'valid-token' } } })
    vi.mocked(signOutUser).mockResolvedValue(undefined)

    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    })
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login')
  })

  it('ログアウト後の保護URLへの再アクセスでもログイン画面のまま（T19）', async () => {
    setupMocks({ session: { tokens: { accessToken: 'valid-token' } } })
    vi.mocked(signOutUser).mockResolvedValue(undefined)

    const { unmount } = renderApp()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    })
    unmount()

    // 再マウント（=再読み込み相当）。セッションは復元されない
    setupMocks()
    renderApp('/some-protected-path')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    })
  })

  it('APIが500でもエラーを表示しログイン画面へ戻らない（T20）', async () => {
    setupMocks({ session: { tokens: { accessToken: 'valid-token' } } })
    vi.mocked(fetchEntries).mockRejectedValue(new ApiError('APIの呼び出しに失敗しました。', 500))

    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'ログアウト' })).toBeInTheDocument()
    expect(vi.mocked(signOutUser)).not.toHaveBeenCalled()
  })

  it('サインアップの導線は存在しない（T21）', async () => {
    renderApp('/signup')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    })
    // サインアップ関連の要素がないこと
    expect(screen.queryByText(/サインアップ/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /登録/ })).not.toBeInTheDocument()
  })
})

describe('AppとAPI連携', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('認証付きで収支APIを呼び、結果を表示する（T17）', async () => {
    setupMocks({ session: { tokens: { accessToken: 'token-abc' } } })
    vi.mocked(fetchEntries).mockResolvedValue([
      { id: 1, date: '2031-01-15', type: '支出', amount: 1500, category: '外食費', memo: '昼食' },
    ])

    renderApp()

    await waitFor(() => {
      expect(screen.getByText(/1500円/)).toBeInTheDocument()
    })
    expect(vi.mocked(fetchEntries)).toHaveBeenCalledWith('2031-01')
  })

  it('APIの401でセッションを破棄しログインへ戻る（T18）', async () => {
    setupMocks({ session: { tokens: { accessToken: 'expired-token' } } })
    const actualApi = await vi.importActual<typeof import('./api/client')>('./api/client')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false }))
    vi.mocked(fetchEntries).mockImplementation(actualApi.fetchEntries)
    vi.mocked(signOutUser).mockResolvedValue(undefined)

    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument()
    })
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login')
    expect(vi.mocked(signOutUser)).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('refresh token失効時はセッションを破棄してログインへ戻る（T18）', async () => {
    vi.mocked(fetchSession)
      .mockResolvedValueOnce({ tokens: { accessToken: 'valid-token' } } as never)
      .mockRejectedValueOnce(Object.assign(new Error('refresh rejected'), { name: 'NotAuthorizedException' }))
    const actualApi = await vi.importActual<typeof import('./api/client')>('./api/client')
    vi.mocked(fetchEntries).mockImplementation(actualApi.fetchEntries)
    vi.mocked(signOutUser).mockResolvedValue(undefined)

    renderApp()
    await waitFor(() => expect(screen.getByTestId('current-path')).toHaveTextContent('/login'))
    expect(vi.mocked(signOutUser)).toHaveBeenCalled()
  })
})
