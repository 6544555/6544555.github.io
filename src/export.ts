import type { ContentBundle, ExportBundle, PhotoItem } from './types'
import { assetUrl } from './ui/helpers'

interface BuildExportOptions {
  content: ContentBundle
  cloud: ExportBundle | null
  onProgress: (done: number, total: number) => void
}

function archivePhotoPath(photo: PhotoItem): string {
  if (photo.storagePath) return `photos/${photo.storagePath.replace(/^\/+/, '')}`
  return `photos/${photo.filename}`
}

function restorablePhoto(photo: PhotoItem) {
  return {
    id: photo.id,
    src: `/memories/${photo.filename}`,
    filename: photo.filename,
    takenAt: photo.takenAt,
    ...(photo.note ? { note: photo.note } : {}),
  }
}

function restorationDocument(): string {
  return [
    '纪念备份',
    '',
    'content.json 使用站点静态内容结构。',
    'photos/ 中保存本次可见照片。',
    '替换站点时，把 content.json 放到 public/content.json。',
    '把 photos/ 中对应照片按 content.json 的 src 文件名放入 public/memories/。',
    '云端存储路径可能保留在 photos/ 的子目录中，复制时以 content.json 的文件名为准。',
    '',
    `导出日期：${new Date().toISOString()}`,
  ].join('\n')
}

export async function buildExportZip({
  content,
  cloud,
  onProgress,
}: BuildExportOptions): Promise<Blob> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const cloudPhotoByPath = new Map(
    (cloud?.photos ?? []).map((photo) => [photo.path, photo.blob]),
  )
  const total = content.photos.length

  let done = 0
  onProgress(done, total)
  for (const photo of content.photos) {
    let blob: Blob | undefined
    if (photo.storagePath) blob = cloudPhotoByPath.get(photo.storagePath)
    if (!blob && photo.src) {
      const url = assetUrl(photo.src)
      if (url) {
        const response = await fetch(url)
        if (!response.ok) throw new Error('static photo unavailable')
        blob = await response.blob()
      }
    }
    if (!blob) throw new Error('photo blob unavailable')
    zip.file(archivePhotoPath(photo), blob)
    done += 1
    onProgress(done, total)
  }

  const restorableContent = {
    site: content.site,
    photos: content.photos.map(restorablePhoto),
    timeline: content.timeline.map((entry) => ({
      id: entry.id,
      date: entry.date,
      title: entry.title,
      body: entry.body,
      ...(entry.photoId ? { photoId: entry.photoId } : {}),
    })),
    messages: content.messages.map((message) => ({
      id: message.id,
      text: message.text,
      ...(message.createdAt ? { createdAt: message.createdAt } : {}),
    })),
  }

  zip.file('content.json', JSON.stringify(restorableContent, null, 2))
  zip.file('README.txt', restorationDocument())
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}
