import { MAX_PHOTO_BYTES } from '../config'
import { InputError } from '../types'

export interface CompressImageOptions {
  maxEdge?: number
  quality?: number
  format?: 'webp' | 'jpeg'
}

export interface CompressedImage {
  blob: Blob
  width: number
  height: number
  bytes: number
  originalBytes: number
  format: 'webp' | 'jpeg'
  mimeType: 'image/webp' | 'image/jpeg'
}

interface LoadedImage {
  source: ImageBitmap | HTMLImageElement
  width: number
  height: number
  cleanup: () => void
}

const SUPPORTED_FILE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function calculateSize(width: number, height: number, maxEdge: number): [number, number] {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      }
    } catch {
      // 老浏览器可能不支持 imageOrientation 选项，再按默认方向解析一次。
      try {
        const bitmap = await createImageBitmap(file)
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => bitmap.close(),
        }
      } catch {
        // 继续走 HTMLImageElement 兜底。
      }
    }
  }

  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new InputError('IMAGE_PROCESSING', '当前浏览器无法读取这张照片')
  }

  const objectUrl = URL.createObjectURL(file)
  const image = new Image()
  try {
    image.src = objectUrl
    await image.decode()
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => {
        image.src = ''
        URL.revokeObjectURL(objectUrl)
      },
    }
  } catch {
    URL.revokeObjectURL(objectUrl)
    throw new InputError('IMAGE_PROCESSING', '这张照片暂时读不出来')
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  if (typeof document === 'undefined') {
    throw new InputError('IMAGE_PROCESSING', '当前环境无法处理照片')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function drawImage(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  source: ImageBitmap | HTMLImageElement,
  width: number,
  height: number,
): void {
  const context = canvas.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null

  if (!context) {
    throw new InputError('IMAGE_PROCESSING', '当前环境无法处理照片')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source as CanvasImageSource, 0, 0, width, height)
}

async function encodeCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mimeType: 'image/webp' | 'image/jpeg',
  quality: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: mimeType, quality })
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('canvas encoding returned null'))
      },
      mimeType,
      quality,
    )
  })
}

function releaseCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): void {
  try {
    canvas.width = 0
    canvas.height = 0
  } catch {
    // Canvas 已不可用时无需额外清理。
  }
}

export async function compressImage(
  file: File,
  opts: CompressImageOptions = {},
): Promise<CompressedImage> {
  const maxEdge = Math.max(1, Math.round(opts.maxEdge ?? 1_600))
  const quality = Math.min(1, Math.max(0.1, opts.quality ?? 0.82))
  const requestedFormat = opts.format ?? 'webp'

  if (!SUPPORTED_FILE_TYPES.has(file.type)) {
    throw new InputError('UNSUPPORTED_FORMAT', '只支持 JPEG、PNG 或 WebP')
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new InputError('FILE_TOO_LARGE', '这张照片太大，换一张或先压缩')
  }

  const loaded = await loadImage(file)
  let canvas: HTMLCanvasElement | OffscreenCanvas | undefined

  try {
    const [width, height] = calculateSize(loaded.width, loaded.height, maxEdge)
    canvas = createCanvas(width, height)
    drawImage(canvas, loaded.source, width, height)

    let format: 'webp' | 'jpeg' = requestedFormat
    let mimeType: 'image/webp' | 'image/jpeg' =
      requestedFormat === 'webp' ? 'image/webp' : 'image/jpeg'
    let blob = await encodeCanvas(canvas, mimeType, quality)

    if (requestedFormat === 'webp' && blob.type !== 'image/webp') {
      format = 'jpeg'
      mimeType = 'image/jpeg'
      blob = await encodeCanvas(canvas, mimeType, quality)
    }

    if (blob.size > MAX_PHOTO_BYTES) {
      throw new InputError('FILE_TOO_LARGE', '压缩后的照片仍然太大')
    }

    return {
      blob,
      width,
      height,
      bytes: blob.size,
      originalBytes: file.size,
      format,
      mimeType,
    }
  } catch (error) {
    if (error instanceof InputError) throw error
    throw new InputError('IMAGE_PROCESSING', '这张照片暂时读不出来')
  } finally {
    if (canvas) releaseCanvas(canvas)
    loaded.cleanup()
  }
}
