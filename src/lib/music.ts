import { MAX_MUSIC_BYTES, MUSIC_BUCKET } from '../config'
import { CloudError, InputError } from '../types'
import { getClient } from './supabase'

const MUSIC_PREFIX = 'theme'
const SIGNED_URL_SECONDS = 86_400

interface MusicFileInfo {
  extension: 'mp3' | 'wav' | 'm4a'
  mimeType: string
}

export interface StoredMusicTrack extends MusicFileInfo {
  url: string
  path: string
}

const MIME_BY_EXTENSION: Record<MusicFileInfo['extension'], string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
}

const MIME_ALIASES: Record<string, MusicFileInfo['extension']> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
}

interface StorageErrorLike {
  status?: number
  statusCode?: number
  message?: string
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function musicFileInfo(filename: string, mimeType: string): MusicFileInfo | null {
  const extension = filename.trim().split('.').pop()?.toLowerCase()
  if (extension !== 'mp3' && extension !== 'wav' && extension !== 'm4a') {
    return null
  }

  const normalizedMime = mimeType.toLowerCase().split(';')[0]?.trim()
  if (normalizedMime && MIME_ALIASES[normalizedMime] !== extension) return null

  return {
    extension,
    mimeType: MIME_BY_EXTENSION[extension],
  }
}

function assertMusicFile(file: File): MusicFileInfo {
  if (file.size > MAX_MUSIC_BYTES) {
    throw new InputError('FILE_TOO_LARGE', '音乐文件不能超过 16MB')
  }

  const info = musicFileInfo(file.name, file.type)
  if (!info || file.size === 0) {
    throw new InputError('UNSUPPORTED_FORMAT', '请选择 MP3、WAV 或 M4A 音乐')
  }
  return info
}

function toCloudError(error: unknown): CloudError {
  if (error instanceof CloudError) return error
  if (error instanceof InputError) throw error
  if (isOffline()) {
    return new CloudError('OFFLINE', 'CLIENT_OFFLINE', '浏览器当前处于离线状态', error)
  }

  const value =
    typeof error === 'object' && error !== null ? (error as StorageErrorLike) : {}
  const status = value.status ?? value.statusCode
  const message = value.message?.toLowerCase() ?? ''

  if (status === 401 || status === 403) {
    return new CloudError('DEGRADED', 'PERMISSION_POLICY', '音乐权限不可用', error)
  }
  if (status === 413 || message.includes('quota') || message.includes('too large')) {
    return new CloudError('QUOTA', 'STORAGE_QUOTA', '音乐空间已满', error)
  }
  return new CloudError('DEGRADED', 'CLOUD_UNAVAILABLE', '音乐服务暂未完成', error)
}

async function listTracks(): Promise<Array<{ name: string; path: string; updatedAt: string }>> {
  const { data, error } = await getClient()
    .storage.from(MUSIC_BUCKET)
    .list(MUSIC_PREFIX, { limit: 20, sortBy: { column: 'updated_at', order: 'desc' } })

  if (error) throw toCloudError(error)
  return (data ?? [])
    .filter((item) => musicFileInfo(item.name, '') !== null)
    .map((item) => ({
      name: item.name,
      path: `${MUSIC_PREFIX}/${item.name}`,
      updatedAt: item.updated_at ?? item.created_at ?? '',
    }))
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function signTrack(path: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await getClient()
      .storage.from(MUSIC_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS)

    if (!error && data?.signedUrl) return data.signedUrl
    lastError = error ?? new Error('music signed URL unavailable')
    if (attempt < 2) await wait(250 * (attempt + 1))
  }
  throw toCloudError(lastError)
}

export async function loadCustomMusic(): Promise<StoredMusicTrack | null> {
  const tracks = await listTracks()
  const latest = tracks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  if (!latest) return null

  const info = musicFileInfo(latest.name, '')
  if (!info) return null
  return {
    path: latest.path,
    url: await signTrack(latest.path),
    ...info,
  }
}

async function removeOtherTracks(keepPath: string): Promise<void> {
  const others = (await listTracks()).filter((track) => track.path !== keepPath)
  if (others.length === 0) return

  const { error } = await getClient()
    .storage.from(MUSIC_BUCKET)
    .remove(others.map((track) => track.path))
  if (error) throw toCloudError(error)
}

export async function uploadCustomMusic(file: File): Promise<StoredMusicTrack> {
  const info = assertMusicFile(file)
  const path = `${MUSIC_PREFIX}/background.${info.extension}`
  let lastError: unknown

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await getClient()
      .storage.from(MUSIC_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        contentType: info.mimeType,
        upsert: true,
      })

    if (!error) {
      try {
        await removeOtherTracks(path)
      } catch {
        // The newly uploaded track remains usable if old-track cleanup is delayed.
      }
      return {
        path,
        url: await signTrack(path),
        ...info,
      }
    }

    lastError = error
    if (attempt < 2) await wait(300 * (attempt + 1))
  }

  throw toCloudError(lastError)
}

export async function resetCustomMusic(): Promise<void> {
  const tracks = await listTracks()
  if (tracks.length === 0) return

  const { error } = await getClient()
    .storage.from(MUSIC_BUCKET)
    .remove(tracks.map((track) => track.path))
  if (error) throw toCloudError(error)
}
