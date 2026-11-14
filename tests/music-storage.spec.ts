import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const bucket = {
    upload: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
    createSignedUrl: vi.fn(),
  }
  return { bucket }
})

vi.mock('../src/lib/supabase', () => ({
  getClient: vi.fn(() => ({
    storage: {
      from: vi.fn(() => mocks.bucket),
    },
  })),
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('custom music storage', () => {
  it('retries a transient upload failure and signs the new track', async () => {
    vi.useFakeTimers()
    mocks.bucket.upload
      .mockResolvedValueOnce({ error: { status: 500, message: 'fetch failed' } })
      .mockResolvedValueOnce({ error: null })
    mocks.bucket.list.mockResolvedValue({ data: [], error: null })
    mocks.bucket.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.invalid/music.wav' },
      error: null,
    })

    const { uploadCustomMusic } = await import('../src/lib/music')
    const pending = uploadCustomMusic(
      new File([new Uint8Array([1, 2, 3])], 'theme.wav', { type: 'audio/wav' }),
    )
    await vi.advanceTimersByTimeAsync(300)
    await expect(pending).resolves.toMatchObject({
      path: 'theme/background.wav',
      url: 'https://example.invalid/music.wav',
    })

    expect(mocks.bucket.upload).toHaveBeenCalledTimes(2)
    expect(mocks.bucket.remove).not.toHaveBeenCalled()
  })

  it('rejects unsupported files before touching Storage', async () => {
    const { uploadCustomMusic } = await import('../src/lib/music')
    await expect(
      uploadCustomMusic(new File(['x'], 'notes.txt', { type: 'text/plain' })),
    ).rejects.toMatchObject({ reason: 'UNSUPPORTED_FORMAT' })
    expect(mocks.bucket.upload).not.toHaveBeenCalled()
  })
})
