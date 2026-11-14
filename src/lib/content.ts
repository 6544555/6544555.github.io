import type {
  ContentBundle,
  MemoryItem,
  MessageItem,
  PhotoItem,
  SiteInfo,
} from '../types'

const EMPTY_SITE: SiteInfo = {
  herName: '',
  startDate: '',
  openingLine: '',
  passHint: '',
}

function emptyBundle(staticLoadFailed = false): ContentBundle {
  return {
    site: { ...EMPTY_SITE },
    photos: [],
    timeline: [],
    messages: [],
    staticLoadFailed,
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeSite(value: unknown): SiteInfo {
  if (!isObject(value)) return { ...EMPTY_SITE }

  return {
    herName: typeof value.herName === 'string' ? value.herName : '',
    startDate: typeof value.startDate === 'string' ? value.startDate : '',
    openingLine: typeof value.openingLine === 'string' ? value.openingLine : '',
    passHint: typeof value.passHint === 'string' ? value.passHint : '',
  }
}

function arraysFrom(value: unknown): {
  photos: PhotoItem[]
  timeline: MemoryItem[]
  messages: MessageItem[]
} {
  if (!isObject(value)) return { photos: [], timeline: [], messages: [] }

  return {
    photos: Array.isArray(value.photos) ? (value.photos as PhotoItem[]) : [],
    timeline: Array.isArray(value.timeline) ? (value.timeline as MemoryItem[]) : [],
    messages: Array.isArray(value.messages) ? (value.messages as MessageItem[]) : [],
  }
}

export async function loadStaticContent(url?: string): Promise<ContentBundle> {
  const base = import.meta.env.BASE_URL || '/'
  const requestUrl = url ?? `${base}content.json`.replace(/\/{2,}/g, '/')

  try {
    const response = await fetch(requestUrl)
    if (!response.ok) return emptyBundle(true)
    const payload = (await response.json()) as unknown
    const arrays = arraysFrom(payload)
    return {
      site: normalizeSite(isObject(payload) ? payload.site : undefined),
      photos: sortPhotos(arrays.photos),
      timeline: sortMemories(arrays.timeline, 'desc'),
      messages: sortMessages(arrays.messages),
      staticLoadFailed: false,
    }
  } catch {
    return emptyBundle(true)
  }
}

export function mergeContent(
  staticBundle: ContentBundle,
  cloud: {
    photos?: PhotoItem[]
    memories?: MemoryItem[]
    messages?: MessageItem[]
  },
): ContentBundle {
  const photoMap = new Map(staticBundle.photos.map((item) => [item.id, item]))
  for (const item of cloud.photos ?? []) photoMap.set(item.id, item)

  const memoryMap = new Map(staticBundle.timeline.map((item) => [item.id, item]))
  for (const item of cloud.memories ?? []) memoryMap.set(item.id, item)

  const messageMap = new Map(staticBundle.messages.map((item) => [item.id, item]))
  for (const item of cloud.messages ?? []) messageMap.set(item.id, item)

  return {
    site: staticBundle.site,
    photos: sortPhotos([...photoMap.values()]),
    timeline: sortMemories([...memoryMap.values()], 'desc'),
    messages: sortMessages([...messageMap.values()]),
    staticLoadFailed: staticBundle.staticLoadFailed,
  }
}

export function sortPhotos(items: PhotoItem[]): PhotoItem[] {
  return [...items].sort((left, right) => {
    const byDate = right.takenAt.localeCompare(left.takenAt)
    if (byDate !== 0) return byDate
    return (right.createdAt ?? '').localeCompare(left.createdAt ?? '')
  })
}

export function sortMemories(items: MemoryItem[], order: 'desc' | 'asc' = 'desc'): MemoryItem[] {
  const direction = order === 'desc' ? 1 : -1
  return [...items].sort((left, right) => {
    const byDate = right.date.localeCompare(left.date)
    if (byDate !== 0) return byDate * direction
    return (right.createdAt ?? '').localeCompare(left.createdAt ?? '') * direction
  })
}

export function sortMessages(items: MessageItem[]): MessageItem[] {
  return [...items].sort((left, right) =>
    (right.createdAt ?? '').localeCompare(left.createdAt ?? ''),
  )
}

function parseDateParts(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return [year, month, day]
}

export function daysTogether(startDate: string, now = new Date()): number {
  const start = parseDateParts(startDate)
  if (!start) return 0

  const current: [number, number, number] = [
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
  ]
  const startUtc = Date.UTC(start[0], start[1] - 1, start[2])
  const currentUtc = Date.UTC(current[0], current[1] - 1, current[2])
  return Math.floor((currentUtc - startUtc) / 86_400_000)
}
