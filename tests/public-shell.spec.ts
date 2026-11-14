import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTENT } from '../src/defaultContent'

describe('public shell isolation', () => {
  it('keeps bundled and published content free of private memories', () => {
    const published = JSON.parse(
      readFileSync(new URL('../public/content.json', import.meta.url), 'utf8'),
    ) as {
      photos: unknown[]
      timeline: unknown[]
      messages: unknown[]
    }

    for (const content of [DEFAULT_CONTENT, published]) {
      expect(content.photos).toEqual([])
      expect(content.timeline).toEqual([])
      expect(content.messages).toEqual([])
    }
  })

  it('does not precache content data or photos in the service worker', () => {
    const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

    expect(source).toContain('birthday-memory-static-v4')
    expect(source).toContain("url.pathname.endsWith('/content.json')")
    expect(source).toContain("url.pathname.includes('/memories/')")
    expect(source).not.toContain('contentUrl')
    expect(source).not.toContain("content.photos")
  })
})
