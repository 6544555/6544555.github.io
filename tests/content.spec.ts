import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  daysTogether,
  loadStaticContent,
  mergeContent,
  sortMemories,
} from '../src/lib/content'
import type { ContentBundle, MemoryItem, MessageItem, PhotoItem } from '../src/types'

const staticBundle: ContentBundle = {
  site: {
    herName: '<HER_NAME>',
    startDate: '2024-07-12',
    openingLine: '<OPENING_LINE>',
    passHint: '<PASS_HINT>',
  },
  photos: [
    {
      id: '00000000-0000-4000-8000-000000000001',
      filename: 'old.webp',
      takenAt: '2024-01-01',
      src: '/memories/old.webp',
    },
  ],
  timeline: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      date: '2024-01-01',
      title: '<MEMORY_TITLE>',
      body: '<MEMORY_BODY>',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ],
  messages: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      text: '<MESSAGE_TEXT>',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('content helpers', () => {
  it('deduplicates by id and lets cloud items win', () => {
    const cloudPhoto: PhotoItem = {
      ...staticBundle.photos[0],
      filename: 'cloud.webp',
      storagePath: 'photos/cloud.webp',
    }
    const cloudMemory: MemoryItem = {
      ...staticBundle.timeline[0],
      title: '云端标题',
      createdAt: '2024-02-01T00:00:00.000Z',
    }
    const cloudMessage: MessageItem = {
      ...staticBundle.messages[0],
      text: '云端留言',
      createdAt: '2024-02-01T00:00:00.000Z',
    }

    const merged = mergeContent(staticBundle, {
      photos: [cloudPhoto],
      memories: [cloudMemory],
      messages: [cloudMessage],
    })

    expect(merged.photos).toHaveLength(1)
    expect(merged.photos[0].filename).toBe('cloud.webp')
    expect(merged.timeline).toHaveLength(1)
    expect(merged.timeline[0].title).toBe('云端标题')
    expect(merged.messages).toHaveLength(1)
    expect(merged.messages[0].text).toBe('云端留言')
  })

  it('sorts memories by date then creation time descending', () => {
    const items: MemoryItem[] = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        date: '2024-08-20',
        title: 'A',
        body: 'A',
        createdAt: '2024-08-20T02:00:00.000Z',
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        date: '2024-08-20',
        title: 'B',
        body: 'B',
        createdAt: '2024-08-20T01:00:00.000Z',
      },
      {
        id: '10000000-0000-4000-8000-000000000003',
        date: '2024-09-01',
        title: 'C',
        body: 'C',
      },
    ]

    expect(sortMemories(items).map((item) => item.title)).toEqual(['C', 'A', 'B'])
  })

  it('computes natural-day differences across months and years', () => {
    expect(daysTogether('2024-07-12', new Date(2024, 6, 12, 23, 59))).toBe(0)
    expect(daysTogether('2024-07-12', new Date(2024, 7, 20))).toBe(39)
    expect(daysTogether('2023-12-31', new Date(2024, 0, 2))).toBe(2)
  })

  it('returns an empty marked bundle when static content is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    )

    const bundle = await loadStaticContent('/missing.json')
    expect(bundle.staticLoadFailed).toBe(true)
    expect(bundle.photos).toEqual([])
    expect(bundle.timeline).toEqual([])
    expect(bundle.messages).toEqual([])
  })

  it('loads and sorts valid static content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          site: staticBundle.site,
          photos: [
            { ...staticBundle.photos[0], takenAt: '2024-01-01' },
            { ...staticBundle.photos[0], id: '00000000-0000-4000-8000-000000000002', takenAt: '2024-03-01' },
          ],
          timeline: [],
          messages: [],
        }),
      }),
    )

    const bundle = await loadStaticContent('/content.json')
    expect(bundle.staticLoadFailed).toBe(false)
    expect(bundle.photos[0].takenAt).toBe('2024-03-01')
  })
})
