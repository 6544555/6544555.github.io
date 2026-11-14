import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REQUEST_TIMEOUT_MS } from '../src/config'
import { createCloudStore } from '../src/lib/storage'

const mocks = vi.hoisted(() => {
  const storageBucket = {
    upload: vi.fn(),
    createSignedUrl: vi.fn(),
    remove: vi.fn(),
    download: vi.fn(),
  }
  const client = {
    from: vi.fn(),
    storage: {
      from: vi.fn(),
    },
  }
  return { client, storageBucket }
})

vi.mock('../src/lib/supabase', () => ({
  getClient: vi.fn(() => mocks.client),
}))

interface QueryResult {
  data?: unknown
  error?: unknown
}

function builder(result: QueryResult) {
  const query: Record<string, unknown> = {}
  for (const method of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'order',
    'limit',
    'single',
    'maybeSingle',
  ]) {
    query[method] = vi.fn(() => query)
  }
  query.then = (
    resolve: (value: QueryResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject)
  return query
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('navigator', { onLine: true })
  mocks.client.storage.from.mockReturnValue(mocks.storageBucket)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('CloudStore failure mapping', () => {
  it('settles init as DEGRADED when the client promise never resolves', async () => {
    vi.useFakeTimers()
    const neverQuery: Record<string, unknown> = {}
    for (const method of ['select', 'limit']) {
      neverQuery[method] = vi.fn(() => neverQuery)
    }
    neverQuery.then = () => undefined
    mocks.client.from.mockReturnValue(neverQuery)

    const pending = createCloudStore().init()
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await expect(pending).resolves.toBe('DEGRADED')
    vi.useRealTimers()
  })

  it('maps AbortError to DEGRADED / CLOUD_TIMEOUT', async () => {
    mocks.client.from.mockReturnValue(
      builder({
        error: { name: 'AbortError', message: 'aborted', status: 408 },
      }),
    )

    await expect(createCloudStore().listMessages()).rejects.toMatchObject({
      state: 'DEGRADED',
      reason: 'CLOUD_TIMEOUT',
    })
  })

  it('does not call Supabase while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })

    await expect(createCloudStore().listMessages()).rejects.toMatchObject({
      state: 'OFFLINE',
      reason: 'CLIENT_OFFLINE',
    })
    expect(mocks.client.from).not.toHaveBeenCalled()
  })

  it('maps an explicit paused signal to PAUSED', async () => {
    mocks.client.from.mockReturnValue(
      builder({
        error: { status: 503, message: 'project paused' },
      }),
    )

    await expect(createCloudStore().listMessages()).rejects.toMatchObject({
      state: 'PAUSED',
      reason: 'CLOUD_PAUSED',
    })
  })

  it('does not treat every 503 response as PAUSED', async () => {
    mocks.client.from.mockReturnValue(
      builder({
        error: { status: 503, message: 'service unavailable' },
      }),
    )

    await expect(createCloudStore().listMessages()).rejects.toMatchObject({
      state: 'DEGRADED',
      reason: 'CLOUD_UNAVAILABLE',
    })
  })

  it('does not classify a transient rate limit as storage quota', async () => {
    mocks.client.from.mockReturnValue(
      builder({
        error: { status: 429, message: 'rate limit exceeded' },
      }),
    )

    await expect(createCloudStore().listMessages()).rejects.toMatchObject({
      state: 'DEGRADED',
      reason: 'CLOUD_UNAVAILABLE',
    })
  })

  it('maps 413 to QUOTA', async () => {
    mocks.client.from.mockReturnValue(
      builder({
        error: { status: 413, message: 'payload too large' },
      }),
    )

    await expect(createCloudStore().listMessages()).rejects.toMatchObject({
      state: 'QUOTA',
    })
  })

  it('maps 401 to DEGRADED with permission context', async () => {
    mocks.client.from.mockReturnValue(
      builder({
        error: { status: 401, message: 'permission denied' },
      }),
    )

    await expect(createCloudStore().listMessages()).rejects.toMatchObject({
      state: 'DEGRADED',
      reason: 'PERMISSION_POLICY',
      message: expect.stringContaining('权限'),
    })
  })
})

describe('CloudStore photos and validation', () => {
  it('caches signed photo URLs in memory', async () => {
    mocks.storageBucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.invalid/signed-photo' },
      error: null,
    })
    const store = createCloudStore()

    const first = await store.getPhotoUrl('photos/one.webp')
    const second = await store.getPhotoUrl('photos/one.webp')

    expect(first).toBe('https://example.invalid/signed-photo')
    expect(second).toBe(first)
    expect(mocks.storageBucket.createSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('clears in-memory signed URLs on logout', async () => {
    mocks.storageBucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.invalid/signed-photo' },
      error: null,
    })
    const store = createCloudStore()

    await store.getPhotoUrl('photos/one.webp')
    store.clearRuntimeCache()
    await store.getPhotoUrl('photos/one.webp')

    expect(mocks.storageBucket.createSignedUrl).toHaveBeenCalledTimes(2)
  })

  it('returns null when signing a photo URL fails', async () => {
    mocks.storageBucket.createSignedUrl.mockResolvedValue({
      data: null,
      error: { status: 500, message: 'temporary failure' },
    })

    await expect(createCloudStore().getPhotoUrl('photos/one.webp')).resolves.toBeNull()
  })

  it('rejects an oversized blob before any upload request', async () => {
    const blob = new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], {
      type: 'image/jpeg',
    })

    await expect(
      createCloudStore().uploadPhoto('photos/large.jpg', blob),
    ).rejects.toMatchObject({
      reason: 'FILE_TOO_LARGE',
    })
    expect(mocks.storageBucket.upload).not.toHaveBeenCalled()
  })

  it('trims and writes a valid message', async () => {
    const message = {
      id: '20000000-0000-4000-8000-000000000001',
      text: '新留言',
      created_at: '2026-11-13T12:00:00.000Z',
    }
    const query = builder({ data: message, error: null })
    mocks.client.from.mockReturnValue(query)

    const saved = await createCloudStore().addMessage('  新留言  ')

    expect(saved.text).toBe('新留言')
    expect((query.insert as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      text: '新留言',
    })
  })

  it('keeps photo paths and blobs together during export', async () => {
    const photo = {
      id: '00000000-0000-4000-8000-000000000001',
      filename: 'memory.webp',
      taken_at: '2024-07-12',
      note: null,
      storage_path: 'photos/memory.webp',
      created_at: '2026-11-13T12:00:00.000Z',
    }
    mocks.client.from.mockImplementation((table: string) => {
      if (table === 'photos') return builder({ data: [photo], error: null })
      return builder({ data: [], error: null })
    })
    mocks.storageBucket.download.mockResolvedValue({
      data: new Blob(['photo']),
      error: null,
    })

    const exported = await createCloudStore().exportAll()

    expect(exported.photos).toHaveLength(1)
    expect(exported.photos[0].path).toBe('photos/memory.webp')
    expect(exported.photos[0].filename).toBe('memory.webp')
    expect(exported.photos[0].blob).toBeInstanceOf(Blob)
    expect(JSON.parse(exported.json).photos[0].storagePath).toBe('photos/memory.webp')
  })
})
