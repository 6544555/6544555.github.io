import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync(
  new URL('../.github/workflows/keepalive.yml', import.meta.url),
  'utf8',
)

describe('Supabase keepalive workflow', () => {
  it('requires the shared-account credentials and API configuration', () => {
    for (const secret of [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SHARED_EMAIL',
      'SUPABASE_SHARED_PASSWORD',
    ]) {
      expect(workflow).toContain(`secrets.${secret}`)
    }
  })

  it('signs in before reading protected data and masks the token', () => {
    expect(workflow).toContain('/auth/v1/token?grant_type=password')
    expect(workflow).toContain('jq -er')
    expect(workflow).toContain('::add-mask::')
    expect(workflow).toContain('Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}')
    expect(workflow).not.toContain('Authorization: Bearer ${SUPABASE_ANON_KEY}')
  })
})
