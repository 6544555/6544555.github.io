import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../supabase/migrations/0003_authenticated_access.sql', import.meta.url),
  'utf8',
)
const historicalStoragePolicy = readFileSync(
  new URL('../supabase/migrations/0002_storage_policy.sql', import.meta.url),
  'utf8',
)

describe('historical migration safety', () => {
  it('does not reopen anonymous policies after the authenticated migration', () => {
    expect(historicalStoragePolicy).toContain("policyname = 'photos_authenticated_access'")
    expect(historicalStoragePolicy).toContain('0002 skipped because the authenticated access migration is active')
    expect(historicalStoragePolicy.indexOf('0002 skipped')).toBeLessThan(
      historicalStoragePolicy.indexOf('photos_public_access'),
    )
  })
})

describe('0003 single-account authenticated access migration', () => {
  it('removes the superseded allowlist objects', () => {
    expect(migration).toContain('drop function if exists public.is_allowed_user()')
    expect(migration).toContain('drop table if exists public.allowed_users')
    expect(migration).not.toContain('create table if not exists public.allowed_users')
    expect(migration).not.toContain('create policy photos_allowed_users')
  })

  it('removes anonymous table access and old open policies', () => {
    for (const statement of [
      'drop policy if exists photos_public_access on public.photos',
      'drop policy if exists memories_public_access on public.memories',
      'drop policy if exists messages_public_access on public.messages',
      'drop policy if exists memories_bucket_select on storage.objects',
      'revoke all on table public.photos from anon',
      'revoke all on table public.memories from anon',
      'revoke all on table public.messages from anon',
    ]) {
      expect(migration).toContain(statement)
    }
  })

  it('allows every operation only to an authenticated user', () => {
    for (const policy of [
      'photos_authenticated_access',
      'memories_authenticated_access',
      'messages_authenticated_access',
      'memories_authenticated_select',
      'memories_authenticated_insert',
      'memories_authenticated_update',
      'memories_authenticated_delete',
    ]) {
      expect(migration).toContain(policy)
    }

    expect(migration.match(/to authenticated/g)?.length).toBeGreaterThanOrEqual(7)
    expect(migration.match(/auth\.uid\(\) is not null/g)?.length).toBeGreaterThanOrEqual(7)
    expect(migration).not.toMatch(/create policy[\s\S]*?to anon/)
    expect(migration).not.toMatch(/create table[^;]*allowed_users/i)
    expect(migration).not.toMatch(/create policy[^;]*allowed_users/i)
    expect(migration).not.toMatch(/from\s+public\.allowed_users/i)
  })

  it('is re-runnable by dropping every final policy before recreating it', () => {
    for (const policy of [
      'photos_authenticated_access',
      'memories_authenticated_access',
      'messages_authenticated_access',
      'memories_authenticated_select',
      'memories_authenticated_insert',
      'memories_authenticated_update',
      'memories_authenticated_delete',
    ]) {
      expect(migration).toContain(`drop policy if exists ${policy}`)
      expect(migration).toContain(`create policy ${policy}`)
    }
  })
})
