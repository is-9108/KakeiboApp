/** amplifyAuthモジュールの依存をモックする */
const { Amplify, tokenProvider, fetchAuthSession, amplifySignIn, confirmSignIn, amplifySignOut } = vi.hoisted(() => ({
  Amplify: { configure: vi.fn() },
  tokenProvider: { setKeyValueStorage: vi.fn() },
  fetchAuthSession: vi.fn(),
  amplifySignIn: vi.fn(),
  confirmSignIn: vi.fn(),
  amplifySignOut: vi.fn(),
}))

vi.mock('aws-amplify', () => ({ Amplify }))
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession,
  signIn: amplifySignIn,
  confirmSignIn,
  signOut: amplifySignOut,
}))
vi.mock('aws-amplify/auth/cognito', () => ({ cognitoUserPoolsTokenProvider: tokenProvider }))

// amplifyAuthはaws-amplify/authの関数をラップするだけなので実物を使う
import { configureCognito, fetchSession, signIn, completeNewPassword, signOutUser, SignInStep } from './amplifyAuth'
import type { Mock } from 'vitest'

const mockFetchAuthSession = fetchAuthSession as Mock
const mockSignIn = amplifySignIn as Mock
const mockConfirmSignIn = confirmSignIn as Mock
const mockSignOut = amplifySignOut as Mock

describe('amplifyAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('configureCognitoでAmplifyに設定を渡す', () => {
    configureCognito({ region: 'us-east-1', userPoolId: 'us-east-1_pool123', userPoolClientId: 'client123' })

    expect(Amplify.configure).toHaveBeenCalledWith({
      Auth: {
        Cognito: { userPoolId: 'us-east-1_pool123', userPoolClientId: 'client123' },
      },
    })
    expect(tokenProvider.setKeyValueStorage).toHaveBeenCalledWith(expect.objectContaining({
      setItem: expect.any(Function),
      getItem: expect.any(Function),
      removeItem: expect.any(Function),
    }))
  })

  it('User Pool IDとRegionが一致しない設定を拒否する', () => {
    expect(() => configureCognito({
      region: 'us-east-1',
      userPoolId: 'eu-west-1_pool123',
      userPoolClientId: 'client123',
    })).toThrow('CognitoのUser Pool IDとRegionが一致しません。')
  })

  it('fetchSessionはログイン済みならaccessTokenを返す', async () => {
    mockFetchAuthSession.mockResolvedValue({
      tokens: { accessToken: { toString: () => 'token-x' } },
    })

    const snapshot = await fetchSession()

    expect(snapshot.tokens).toEqual({ accessToken: 'token-x' })
  })

  it('fetchSessionはトークンがなければnullを返す', async () => {
    mockFetchAuthSession.mockResolvedValue({ tokens: undefined })

    const snapshot = await fetchSession()

    expect(snapshot.tokens).toBeNull()
  })

  it('signInはamplifyのsignInにユーザー名とパスワードを渡す', async () => {
    mockSignIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } })

    const result = await signIn('user@example.com', 'Passw0rd!')

    expect(mockSignIn).toHaveBeenCalledWith({ username: 'user@example.com', password: 'Passw0rd!' })
    expect(result.isSignedIn).toBe(true)
  })

  it('completeNewPasswordはconfirmSignInに新しいパスワードを渡す', async () => {
    mockConfirmSignIn.mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: 'DONE' } })

    const result = await completeNewPassword('NewPassw0rd!')

    expect(mockConfirmSignIn).toHaveBeenCalledWith({ challengeResponse: 'NewPassw0rd!' })
    expect(result.isSignedIn).toBe(true)
  })

  it('signOutUserはamplifyのsignOutを呼ぶ', async () => {
    mockSignOut.mockResolvedValue(undefined)

    await signOutUser()

    expect(mockSignOut).toHaveBeenCalledTimes(1)
  })

  it('SignInStep.confirmSignUpNewPasswordRequiredはCognitoのチャレンジ名と一致する', () => {
    expect(SignInStep.confirmSignUpNewPasswordRequired).toBe('CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED')
  })
})
