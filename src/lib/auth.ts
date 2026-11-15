import type { Session, User } from '@supabase/supabase-js'
import { clearSnapshot } from './localcache'
import { getClient } from './supabase'
import type { AuthReason, AuthState, AuthUser } from '../types'

const AUTHENTICATED_USER_CACHE_KEY = 'bday:v2:authenticated-user'
export const SHARED_LOGIN_USERNAME = 'gt011120'
let authWarmPromise: Promise<void> | null = null

export function isLoginIdentifier(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized === SHARED_LOGIN_USERNAME ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  )
}

export function resolveLoginEmail(value: string): string {
  const normalized = value.trim()
  if (normalized.toLowerCase() !== SHARED_LOGIN_USERNAME) return normalized
  return import.meta.env.VITE_SHARED_LOGIN_EMAIL?.trim() || normalized
}

interface ErrorLike {
  message?: string
  status?: number
  statusCode?: number
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function toAuthUser(user: User): AuthUser | null {
  const email = user.email?.trim()
  if (!email) return null
  return { id: user.id, email }
}

function cacheAuthenticatedUser(user: AuthUser): void {
  try {
    getStorage()?.setItem(AUTHENTICATED_USER_CACHE_KEY, JSON.stringify(user))
  } catch {
    // 会话存储不可用时，在线登录仍可正常完成。
  }
}

function readCachedAuthenticatedUser(): AuthUser | null {
  try {
    const raw = getStorage()?.getItem(AUTHENTICATED_USER_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AuthUser>
    if (typeof parsed.id !== 'string' || typeof parsed.email !== 'string') return null
    return { id: parsed.id, email: parsed.email }
  } catch {
    return null
  }
}

function clearAuthenticatedUserCache(): void {
  try {
    getStorage()?.removeItem(AUTHENTICATED_USER_CACHE_KEY)
  } catch {
    // 清理失败不改变 Supabase Auth 的退出结果。
  }
}

function reasonFor(error: unknown): AuthReason {
  if (isOffline()) return 'CLIENT_OFFLINE'
  if (error instanceof Error && error.name === 'AbortError') return 'CLOUD_TIMEOUT'

  if (typeof error === 'object' && error !== null) {
    const value = error as ErrorLike
    const message = value.message?.toLowerCase() ?? ''
    const status = value.status ?? value.statusCode
    if (status === 408 || message.includes('timeout') || message.includes('timed out')) {
      return 'CLOUD_TIMEOUT'
    }
    if (message.includes('invalid login credentials')) return 'INVALID_CREDENTIALS'
  }

  return 'CLOUD_UNAVAILABLE'
}

function stateForSession(session: Session | null): AuthState {
  if (!session) {
    clearSnapshot()
    clearAuthenticatedUserCache()
    return { status: 'SIGNED_OUT', reason: 'AUTH_REQUIRED' }
  }

  const user = toAuthUser(session.user)
  if (!user) {
    clearSnapshot()
    clearAuthenticatedUserCache()
    return { status: 'SIGNED_OUT', reason: 'AUTH_REQUIRED' }
  }

  cacheAuthenticatedUser(user)
  return { status: 'AUTHENTICATED', user }
}

export function warmAuthConnection(): Promise<void> {
  if (authWarmPromise) return authWarmPromise
  if (isOffline()) return Promise.resolve()

  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return Promise.resolve()

  authWarmPromise = (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1200)
      try {
        const response = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/settings`, {
          headers: { apikey: anonKey },
          cache: 'no-store',
          signal: controller.signal,
        })
        if (response.ok) return
      } catch {
        // Retry within a bounded window, then allow the explicit sign-in attempt.
      } finally {
        clearTimeout(timeoutId)
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  })()

  return authWarmPromise
}

export async function restoreSession(): Promise<AuthState> {
  if (isOffline()) {
    const cached = readCachedAuthenticatedUser()
    return cached
      ? { status: 'AUTHENTICATED', user: cached }
      : { status: 'SIGNED_OUT', reason: 'CLIENT_OFFLINE' }
  }

  try {
    const { data, error } = await getClient().auth.getSession()
    if (error) return { status: 'DEGRADED', reason: reasonFor(error) }
    return stateForSession(data.session)
  } catch (error) {
    return { status: 'DEGRADED', reason: reasonFor(error) }
  }
}

export async function signIn(account: string, password: string): Promise<AuthState> {
  if (isOffline()) return { status: 'DEGRADED', reason: 'CLIENT_OFFLINE' }

  const startedAt = Date.now()
  let lastReason: AuthReason = 'CLOUD_UNAVAILABLE'

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const { data, error } = await getClient().auth.signInWithPassword({
        email: resolveLoginEmail(account),
        password,
      })
      if (!error) return stateForSession(data.session)

      const reason = reasonFor(error)
      if (reason === 'INVALID_CREDENTIALS') {
        return { status: 'SIGNED_OUT', reason }
      }
      lastReason = reason
    } catch (error) {
      lastReason = reasonFor(error)
    }

    if (
      lastReason !== 'CLOUD_UNAVAILABLE' ||
      attempt === 9 ||
      Date.now() - startedAt >= 1800
    ) {
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  return { status: 'DEGRADED', reason: lastReason }
}

export async function signOut(): Promise<void> {
  clearSnapshot()
  clearAuthenticatedUserCache()
  await getClient().auth.signOut({ scope: 'local' })
}

export function subscribeToAuth(listener: (state: AuthState) => void): () => void {
  listener({ status: 'LOADING' })
  void restoreSession().then(listener)

  const { data } = getClient().auth.onAuthStateChange((_event, session) => {
    queueMicrotask(() => listener(stateForSession(session)))
  })

  return () => data.subscription.unsubscribe()
}
