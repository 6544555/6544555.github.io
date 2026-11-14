import { describe, expect, it } from 'vitest'
import { resolveMusicUrl } from '../src/ui/BackgroundMusic'

describe('background music configuration', () => {
  it('uses the bundled loop under the deployed base path', () => {
    expect(resolveMusicUrl('/birthday-memory/')).toBe(
      '/birthday-memory/audio/memory-theme.ogg',
    )
  })

  it('accepts a custom local or remote track', () => {
    expect(resolveMusicUrl('/birthday-memory/', ' audio/ours.mp3 ')).toBe(
      'audio/ours.mp3',
    )
    expect(
      resolveMusicUrl(
        '/birthday-memory/',
        'https://media.example.invalid/memory.ogg',
      ),
    ).toBe('https://media.example.invalid/memory.ogg')
  })
})
