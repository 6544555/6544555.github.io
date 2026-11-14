import { describe, expect, it } from 'vitest'
import { compressImage } from '../src/lib/image'
import { InputError } from '../src/types'

function makeFile(size: number, type: string): File {
  return new File([new Uint8Array(size)], 'photo.bin', { type })
}

describe('image input boundaries', () => {
  it('rejects unsupported formats before decoding', async () => {
    await expect(compressImage(makeFile(100, 'image/gif'))).rejects.toMatchObject<
      Partial<InputError>
    >({
      reason: 'UNSUPPORTED_FORMAT',
    })
  })

  it('rejects original files over 8MB before decoding', async () => {
    await expect(
      compressImage(makeFile(8 * 1024 * 1024 + 1, 'image/jpeg')),
    ).rejects.toMatchObject<Partial<InputError>>({
      reason: 'FILE_TOO_LARGE',
    })
  })
})
