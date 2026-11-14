import { MAX_PHOTO_BYTES, PHOTO_BUCKET, REQUEST_TIMEOUT_MS } from '../config'
import {
  CloudError,
  InputError,
  type CloudErrorReason,
  type CloudState,
  type ExportBundle,
  type ExportedPhoto,
  type MemoryItem,
  type MessageItem,
  type NewMemoryInput,
  type NewPhotoInput,
  type PhotoItem,
} from '../types'
import { getClient } from './supabase'

export interface CloudStore {
  init(): Promise<CloudState>
  listPhotos(): Promise<PhotoItem[]>
  addPhoto(input: NewPhotoInput): Promise<PhotoItem>
  deletePhoto(photoId: string): Promise<void>
  listMemories(): Promise<MemoryItem[]>
  addMemory(input: NewMemoryInput): Promise<MemoryItem>
  updateMemory(
    id: string,
    patch: Partial<Omit<MemoryItem, 'id' | 'createdAt'>>,
  ): Promise<MemoryItem>
  deleteMemory(id: string): Promise<void>
  listMessages(): Promise<MessageItem[]>
  addMessage(text: string): Promise<MessageItem>
  deleteMessage(id: string): Promise<void>
  uploadPhoto(path: string, blob: Blob): Promise<string>
  getPhotoUrl(path: string, expiresIn?: number): Promise<string | null>
  exportAll(): Promise<ExportBundle>
  clearRuntimeCache(): void
}

interface PhotoRow {
  id: string
  filename: string
  taken_at: string
  note: string | null
  storage_path: string
  created_at: string
}

interface MemoryRow {
  id: string
  date: string
  title: string
  body: string
  photo_id: string | null
  created_at: string
}

interface MessageRow {
  id: string
  text: string
  created_at: string
}

interface ErrorLike {
  name?: string
  message?: string
  status?: number
  statusCode?: number
  code?: string
  details?: string
  hint?: string
}

interface SignedUrlCacheItem {
  url: string
  expiresAt: number
}

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FILE_PATTERN = /^[A-Za-z0-9._-]+\.(webp|jpe?g|png)$/i

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function assertOnline(): void {
  if (isOffline()) {
    throw new CloudError('OFFLINE', 'CLIENT_OFFLINE', '浏览器当前处于离线状态')
  }
}

async function withRequestTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new CloudError('DEGRADED', 'CLOUD_TIMEOUT', '云端请求超过 8 秒'),
          )
        }, REQUEST_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function asErrorLike(error: unknown): ErrorLike {
  if (typeof error === 'object' && error !== null) {
    return error as ErrorLike
  }

  return { message: typeof error === 'string' ? error : undefined }
}

function cloudReasonFor(error: ErrorLike): {
  state: CloudError['state']
  reason: CloudErrorReason
} {
  const message = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  const status = error.status ?? error.statusCode

  if (error.name === 'AbortError' || message.includes('timed out') || message.includes('timeout')) {
    return { state: 'DEGRADED', reason: 'CLOUD_TIMEOUT' }
  }

  if (
    status === 401 ||
    status === 403 ||
    message.includes('permission denied') ||
    message.includes('row-level security')
  ) {
    return { state: 'DEGRADED', reason: 'PERMISSION_POLICY' }
  }

  if (
    status === 413 ||
    message.includes('payload too large') ||
    message.includes('entity too large') ||
    /(?:storage|database|row|record|file size).{0,40}(?:quota|limit|exceeded)/.test(message) ||
    /(?:quota|limit|exceeded).{0,40}(?:storage|database|row|record|file size)/.test(message)
  ) {
    const isDatabaseQuota =
      message.includes('database') ||
      message.includes('row limit') ||
      message.includes('record limit')
    return {
      state: 'QUOTA',
      reason: isDatabaseQuota ? 'DATABASE_QUOTA' : 'STORAGE_QUOTA',
    }
  }

  if (message.includes('paused') || message.includes('project unavailable')) {
    return { state: 'PAUSED', reason: 'CLOUD_PAUSED' }
  }

  return { state: 'DEGRADED', reason: 'CLOUD_UNAVAILABLE' }
}

function toCloudError(error: unknown): CloudError {
  if (error instanceof CloudError) return error
  if (error instanceof InputError) {
    throw error
  }

  const errorLike = asErrorLike(error)
  const classified = cloudReasonFor(errorLike)
  const safeCause =
    typeof errorLike.status === 'number' || typeof errorLike.statusCode === 'number'
      ? { status: errorLike.status ?? errorLike.statusCode }
      : undefined

  const safeMessage =
    classified.reason === 'PERMISSION_POLICY'
      ? '权限策略可能未配置'
      : classified.reason === 'CLOUD_TIMEOUT'
        ? '云端请求超过 8 秒'
        : '云端请求暂未完成'

  return new CloudError(classified.state, classified.reason, safeMessage, safeCause)
}

function requireNonEmpty(value: string, label: string, maxLength: number): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new InputError('INVALID_INPUT', `${label}不能为空`)
  }
  if (normalized.length > maxLength) {
    throw new InputError('INVALID_INPUT', `${label}最多 ${maxLength} 个字`)
  }
  return normalized
}

function assertDate(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    throw new InputError('INVALID_INPUT', '日期必须是 YYYY-MM-DD')
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new InputError('INVALID_INPUT', '日期不是有效自然日')
  }
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new InputError('INVALID_INPUT', `${label}格式不正确`)
  }
}

function validatePhotoInput(input: NewPhotoInput): NewPhotoInput {
  const filename = input.filename.trim()
  if (!FILE_PATTERN.test(filename)) {
    throw new InputError('UNSUPPORTED_FORMAT', '照片文件名或格式不受支持')
  }
  assertDate(input.takenAt)
  assertStoragePath(input.storagePath)

  const note = input.note?.trim()
  if (note && note.length > 140) {
    throw new InputError('INVALID_INPUT', '照片说明最多 140 个字')
  }

  return {
    filename,
    takenAt: input.takenAt,
    storagePath: input.storagePath,
    ...(note ? { note } : {}),
  }
}

function validateMemoryInput(input: NewMemoryInput): NewMemoryInput {
  assertDate(input.date)
  if (input.photoId) assertUuid(input.photoId, '照片 ID')

  return {
    date: input.date,
    title: requireNonEmpty(input.title, '标题', 30),
    body: requireNonEmpty(input.body, '正文', 500),
    ...(input.photoId ? { photoId: input.photoId } : {}),
  }
}

function assertStoragePath(path: string): void {
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('..') ||
    path.length > 240 ||
    !/^[A-Za-z0-9/._-]+$/.test(path)
  ) {
    throw new InputError('INVALID_INPUT', '照片存储路径不正确')
  }
}

function mapPhoto(row: PhotoRow): PhotoItem {
  return {
    id: row.id,
    filename: row.filename,
    takenAt: row.taken_at,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    ...(row.note ? { note: row.note } : {}),
  }
}

function mapMemory(row: MemoryRow): MemoryItem {
  return {
    id: row.id,
    date: row.date,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    ...(row.photo_id ? { photoId: row.photo_id } : {}),
  }
}

function mapMessage(row: MessageRow): MessageItem {
  return {
    id: row.id,
    text: row.text,
    createdAt: row.created_at,
  }
}

export function createCloudStore(): CloudStore {
  const signedUrlCache = new Map<string, SignedUrlCacheItem>()

  function clearRuntimeCache(): void {
    signedUrlCache.clear()
  }

  async function listPhotos(): Promise<PhotoItem[]> {
    assertOnline()
    const { data, error } = await getClient()
      .from('photos')
      .select('id, filename, taken_at, note, storage_path, created_at')
      .order('taken_at', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw toCloudError(error)
    return ((data ?? []) as PhotoRow[]).map(mapPhoto)
  }

  async function addPhoto(input: NewPhotoInput): Promise<PhotoItem> {
    assertOnline()
    const normalized = validatePhotoInput(input)
    const { data, error } = await getClient()
      .from('photos')
      .insert({
        filename: normalized.filename,
        taken_at: normalized.takenAt,
        note: normalized.note ?? null,
        storage_path: normalized.storagePath,
      })
      .select('id, filename, taken_at, note, storage_path, created_at')
      .single()

    if (error) throw toCloudError(error)
    return mapPhoto(data as PhotoRow)
  }

  async function deletePhoto(photoId: string): Promise<void> {
    assertOnline()
    assertUuid(photoId, '照片 ID')

    const client = getClient()
    const lookup = await client
      .from('photos')
      .select('storage_path')
      .eq('id', photoId)
      .maybeSingle()

    if (lookup.error) throw toCloudError(lookup.error)
    if (!lookup.data) return

    const path = (lookup.data as { storage_path: string }).storage_path
    const removed = await client.storage.from(PHOTO_BUCKET).remove([path])
    if (removed.error) throw toCloudError(removed.error)

    const deleted = await client.from('photos').delete().eq('id', photoId)
    if (deleted.error) throw toCloudError(deleted.error)
  }

  async function listMemories(): Promise<MemoryItem[]> {
    assertOnline()
    const { data, error } = await getClient()
      .from('memories')
      .select('id, date, title, body, photo_id, created_at')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw toCloudError(error)
    return ((data ?? []) as MemoryRow[]).map(mapMemory)
  }

  async function addMemory(input: NewMemoryInput): Promise<MemoryItem> {
    assertOnline()
    const normalized = validateMemoryInput(input)
    const { data, error } = await getClient()
      .from('memories')
      .insert({
        date: normalized.date,
        title: normalized.title,
        body: normalized.body,
        photo_id: normalized.photoId ?? null,
      })
      .select('id, date, title, body, photo_id, created_at')
      .single()

    if (error) throw toCloudError(error)
    return mapMemory(data as MemoryRow)
  }

  async function updateMemory(
    id: string,
    patch: Partial<Omit<MemoryItem, 'id' | 'createdAt'>>,
  ): Promise<MemoryItem> {
    assertOnline()
    assertUuid(id, '回忆 ID')

    const row: Record<string, string | null> = {}
    if (patch.date !== undefined) {
      assertDate(patch.date)
      row.date = patch.date
    }
    if (patch.title !== undefined) row.title = requireNonEmpty(patch.title, '标题', 30)
    if (patch.body !== undefined) row.body = requireNonEmpty(patch.body, '正文', 500)
    if (patch.photoId !== undefined) {
      if (patch.photoId) assertUuid(patch.photoId, '照片 ID')
      row.photo_id = patch.photoId || null
    }

    if (Object.keys(row).length === 0) {
      throw new InputError('INVALID_INPUT', '没有可更新的字段')
    }

    const { data, error } = await getClient()
      .from('memories')
      .update(row)
      .eq('id', id)
      .select('id, date, title, body, photo_id, created_at')
      .single()

    if (error) throw toCloudError(error)
    return mapMemory(data as MemoryRow)
  }

  async function deleteMemory(id: string): Promise<void> {
    assertOnline()
    assertUuid(id, '回忆 ID')
    const { error } = await getClient().from('memories').delete().eq('id', id)
    if (error) throw toCloudError(error)
  }

  async function listMessages(): Promise<MessageItem[]> {
    assertOnline()
    const { data, error } = await getClient()
      .from('messages')
      .select('id, text, created_at')
      .order('created_at', { ascending: false })

    if (error) throw toCloudError(error)
    return ((data ?? []) as MessageRow[]).map(mapMessage)
  }

  async function addMessage(text: string): Promise<MessageItem> {
    assertOnline()
    const normalized = requireNonEmpty(text, '留言', 500)
    const { data, error } = await getClient()
      .from('messages')
      .insert({ text: normalized })
      .select('id, text, created_at')
      .single()

    if (error) throw toCloudError(error)
    return mapMessage(data as MessageRow)
  }

  async function deleteMessage(id: string): Promise<void> {
    assertOnline()
    assertUuid(id, '留言 ID')
    const { error } = await getClient().from('messages').delete().eq('id', id)
    if (error) throw toCloudError(error)
  }

  async function uploadPhoto(path: string, blob: Blob): Promise<string> {
    assertOnline()
    assertStoragePath(path)
    if (blob.size > MAX_PHOTO_BYTES) {
      throw new InputError('FILE_TOO_LARGE', '这张照片太大，换一张或先压缩')
    }
    if (blob.size === 0 || !SUPPORTED_IMAGE_TYPES.has(blob.type)) {
      throw new InputError('UNSUPPORTED_FORMAT', '照片格式不受支持')
    }

    const { error } = await getClient()
      .storage.from(PHOTO_BUCKET)
      .upload(path, blob, {
        cacheControl: '3600',
        contentType: blob.type,
        upsert: false,
      })

    if (error) throw toCloudError(error)
    return path
  }

  async function getPhotoUrl(path: string, expiresIn = 86_400): Promise<string | null> {
    if (!path) return null
    const cacheKey = `${path}:${expiresIn}`
    const cached = signedUrlCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.url

    try {
      assertOnline()
      const { data, error } = await getClient()
        .storage.from(PHOTO_BUCKET)
        .createSignedUrl(path, expiresIn)

      if (error || !data?.signedUrl) return null
      signedUrlCache.set(cacheKey, {
        url: data.signedUrl,
        expiresAt: Date.now() + Math.max(0, expiresIn - 30) * 1_000,
      })
      return data.signedUrl
    } catch {
      return null
    }
  }

  async function init(): Promise<CloudState> {
    try {
      assertOnline()
      const { error } = await withRequestTimeout(
        getClient().from('messages').select('id').limit(1),
      )
      if (error) throw toCloudError(error)
      return 'READY'
    } catch (error) {
      return toCloudError(error).state
    }
  }

  async function exportAll(): Promise<ExportBundle> {
    assertOnline()
    const [photos, memories, messages] = await Promise.all([
      listPhotos(),
      listMemories(),
      listMessages(),
    ])

    const client = getClient()
    const exportedPhotos: ExportedPhoto[] = []

    for (const photo of photos) {
      if (!photo.storagePath) continue
      const { data, error } = await client.storage
        .from(PHOTO_BUCKET)
        .download(photo.storagePath)

      if (error || !data) throw toCloudError(error ?? new Error('photo download failed'))
      exportedPhotos.push({
        path: photo.storagePath,
        filename: photo.filename,
        blob: data,
      })
    }

    const json = JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        photos,
        memories,
        messages,
      },
      null,
      2,
    )

    return { json, photos: exportedPhotos }
  }

  return {
    init,
    listPhotos,
    addPhoto,
    deletePhoto,
    listMemories,
    addMemory,
    updateMemory,
    deleteMemory,
    listMessages,
    addMessage,
    deleteMessage,
    uploadPhoto,
    getPhotoUrl,
    exportAll,
    clearRuntimeCache,
  }
}
