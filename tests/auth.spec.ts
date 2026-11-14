import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class MemoryStorage {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const mocks = vi.hoisted(() => ({
  auth: {
    getSession: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
}))

vi.mock('../src/lib/supabase', () => ({
  getClient: vi.fn(() => ({ auth: mocks.auth })),
}))

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'shared@example.invalid',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-11-14T00:00:00.000Z',
}
const session = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user,
}

let storage: MemoryStorage

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  storage = new MemoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('navigator', { onLine: true })
  mocks.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

async function loadAuth() {
  return import('../src/lib/auth')
}

describe('single-account Supabase Auth', () => {
  it('bounds Auth connection prewarm when the settings request hangs', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'))
          })
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const pending = (await loadAuth()).warmAuthConnection()
    await vi.advanceTimersByTimeAsync(2700)
    await expect(pending).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns signed out when no persisted session exists', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    await expect((await loadAuth()).restoreSession()).resolves.toEqual({
      status: 'SIGNED_OUT',
      reason: 'AUTH_REQUIRED',
    })
  })

  it('clears private caches when a persisted session has expired', async () => {
    storage.setItem('bday:v1:snapshot', '{"memories":[],"messages":[]}')
    storage.setItem(
      'bday:v2:authenticated-user',
      JSON.stringify({ id: user.id, email: user.email }),
    )
    mocks.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

    await (await loadAuth()).restoreSession()

    expect(storage.getItem('bday:v1:snapshot')).toBeNull()
    expect(storage.getItem('bday:v2:authenticated-user')).toBeNull()
  })

  it('authenticates any valid Supabase session without a whitelist lookup', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session }, error: null })

    const auth = await loadAuth()
    await expect(auth.restoreSession()).resolves.toEqual({
      status: 'AUTHENTICATED',
      user: { id: user.id, email: user.email },
    })
    expect(storage.getItem('bday:v2:authenticated-user')).toContain(user.id)
  })

  it('retries a transient sign-in failure within the same user action', async () => {
    mocks.auth.signInWithPassword
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce({ data: { user, session }, error: null })

    await expect(
      (await loadAuth()).signIn('shared@example.invalid', 'correct'),
    ).resolves.toEqual({
      status: 'AUTHENTICATED',
      user: { id: user.id, email: user.email },
    })
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledTimes(2)
  })

  it('maps wrong credentials to a signed-out mismatch state', async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { status: 400, message: 'Invalid login credentials' },
    })

    await expect(
      (await loadAuth()).signIn('shared@example.invalid', 'wrong'),
    ).resolves.toEqual({
      status: 'SIGNED_OUT',
      reason: 'INVALID_CREDENTIALS',
    })
  })

  it('keeps the single validated account available for offline restore', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session }, error: null })

    const auth = await loadAuth()
    await auth.restoreSession()
    vi.stubGlobal('navigator', { onLine: false })

    await expect(auth.restoreSession()).resolves.toEqual({
      status: 'AUTHENTICATED',
      user: { id: user.id, email: user.email },
    })
  })

  it('clears private text and authenticated user caches on local sign-out', async () => {
    storage.setItem('bday:v1:snapshot', '{"memories":[],"messages":[]}')
    storage.setItem(
      'bday:v2:authenticated-user',
      JSON.stringify({ id: user.id, email: user.email }),
    )
    mocks.auth.signOut.mockResolvedValue({ error: null })

    const auth = await loadAuth()
    await auth.signOut()

    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(storage.getItem('bday:v1:snapshot')).toBeNull()
    expect(storage.getItem('bday:v2:authenticated-user')).toBeNull()
  })
})
