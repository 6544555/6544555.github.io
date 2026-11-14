import { describe, expect, it } from 'vitest'
import { musicFileInfo } from '../src/lib/music'
import { resolveMusicUrl } from '../src/ui/BackgroundMusic'

describe('background music configuration', () => {
  it('uses the bundled loop under the deployed base path', () => {
    expect(resolveMusicUrl('/birthday-memory/')).toBe(
      '/birthday-memory/audio/memory-theme.mp3',
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

  it('normalizes supported uploaded music types', () => {
    expect(musicFileInfo('our-song.MP3', 'audio/mpeg')).toEqual({
      extension: 'mp3',
      mimeType: 'audio/mpeg',
    })
    expect(musicFileInfo(' voice.wav ', 'audio/wave')).toEqual({
      extension: 'wav',
      mimeType: 'audio/wav',
    })
    expect(musicFileInfo('theme.m4a', 'audio/x-m4a')).toEqual({
      extension: 'm4a',
      mimeType: 'audio/mp4',
    })
  })

  it('rejects mismatched or unsupported music files', () => {
    expect(musicFileInfo('song.mp3', 'audio/ogg')).toBeNull()
    expect(musicFileInfo('song.ogg', 'audio/ogg')).toBeNull()
    expect(musicFileInfo('song.txt', 'text/plain')).toBeNull()
    expect(musicFileInfo('song', '')).toBeNull()
  })
})
