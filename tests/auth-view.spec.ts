import { describe, expect, it } from 'vitest'
import {
  authReasonMessage,
  authScreenFor,
  canMountPrivateContent,
  recoverFromPermissionFailure,
} from '../src/ui/authViewModel'
import type { AuthState } from '../src/types'

describe('auth view model', () => {
  it('mounts private content only for an authenticated state', () => {
    const states: AuthState[] = [
      { status: 'LOADING' },
      { status: 'SIGNED_OUT' },
      { status: 'SIGNED_OUT', reason: 'AUTH_REQUIRED' },
      { status: 'DEGRADED', reason: 'CLOUD_UNAVAILABLE' },
      { status: 'AUTHENTICATED', user: { id: 'user-1', email: 'a@example.com' } },
    ]

    expect(states.filter(canMountPrivateContent)).toHaveLength(1)
    expect(canMountPrivateContent(states[4])).toBe(true)
  })

  it('maps every auth state to a public or private screen', () => {
    expect(authScreenFor({ status: 'LOADING' })).toBe('LOADING')
    expect(authScreenFor({ status: 'SIGNED_OUT' })).toBe('LOGIN')
    expect(authScreenFor({ status: 'DEGRADED', reason: 'CLIENT_OFFLINE' })).toBe(
      'DEGRADED',
    )
    expect(
      authScreenFor({ status: 'AUTHENTICATED', user: { id: 'u', email: 'a@b.c' } }),
    ).toBe('PRIVATE')
  })

  it('keeps private content only when a permission failure re-confirms the session', async () => {
    const user = { id: 'user-1', email: 'a@example.com' }

    await expect(
      recoverFromPermissionFailure(async () => ({ status: 'AUTHENTICATED', user })),
    ).resolves.toEqual({ kind: 'KEEP_PRIVATE', cloudState: 'DEGRADED' })

    await expect(
      recoverFromPermissionFailure(async () => ({
        status: 'SIGNED_OUT',
        reason: 'AUTH_REQUIRED',
      })),
    ).resolves.toEqual({
      kind: 'UNMOUNT',
      authState: { status: 'SIGNED_OUT', reason: 'AUTH_REQUIRED' },
    })

    await expect(
      recoverFromPermissionFailure(async () => {
        throw new Error('network unavailable')
      }),
    ).resolves.toEqual({
      kind: 'UNMOUNT',
      authState: { status: 'DEGRADED', reason: 'CLOUD_UNAVAILABLE' },
    })
  })

  it('uses generic messages and never exposes technical auth errors', () => {
    const messages = [
      authReasonMessage('INVALID_CREDENTIALS'),
      authReasonMessage('AUTH_REQUIRED'),
      authReasonMessage('CLIENT_OFFLINE'),
      authReasonMessage('CLOUD_TIMEOUT'),
      authReasonMessage('CLOUD_UNAVAILABLE'),
    ].join('\n')

    expect(messages).toContain('再试一次')
    expect(messages).toContain('网络')
    expect(messages).not.toMatch(/401|403|HTTP|Supabase|服务器/i)
  })
})
