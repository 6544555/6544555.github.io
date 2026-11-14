import { COPY } from '../copy'
import type { AuthReason, AuthState } from '../types'

export type AuthScreen = 'LOADING' | 'LOGIN' | 'PRIVATE' | 'DEGRADED'

export function authScreenFor(state: AuthState): AuthScreen {
  if (state.status === 'AUTHENTICATED') return 'PRIVATE'
  if (state.status === 'SIGNED_OUT') return 'LOGIN'
  if (state.status === 'DEGRADED') return 'DEGRADED'
  return 'LOADING'
}

export function authReasonMessage(reason?: AuthReason): string {
  if (reason === 'INVALID_CREDENTIALS') return COPY.gateMismatch
  if (reason === 'AUTH_REQUIRED') return COPY.authExpired
  if (reason === 'CLIENT_OFFLINE') return COPY.authOffline
  if (reason === 'CLOUD_TIMEOUT' || reason === 'CLOUD_UNAVAILABLE') {
    return COPY.authDegraded
  }
  return ''
}

export function canMountPrivateContent(state: AuthState): boolean {
  return state.status === 'AUTHENTICATED'
}

export type PermissionRecovery =
  | { kind: 'KEEP_PRIVATE'; cloudState: 'DEGRADED' }
  | { kind: 'UNMOUNT'; authState: AuthState }

export async function recoverFromPermissionFailure(
  restore: () => Promise<AuthState>,
): Promise<PermissionRecovery> {
  let authState: AuthState
  try {
    authState = await restore()
  } catch {
    authState = { status: 'DEGRADED', reason: 'CLOUD_UNAVAILABLE' }
  }

  return authState.status === 'AUTHENTICATED'
    ? { kind: 'KEEP_PRIVATE', cloudState: 'DEGRADED' }
    : { kind: 'UNMOUNT', authState }
}
