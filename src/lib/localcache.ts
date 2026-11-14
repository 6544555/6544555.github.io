import type { MemoryItem, MessageItem } from '../types'

const SNAPSHOT_KEY = 'bday:v1:snapshot'

export interface TextSnapshot {
  memories: MemoryItem[]
  messages: MessageItem[]
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function saveSnapshot(data: TextSnapshot): void {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.setItem(SNAPSHOT_KEY, JSON.stringify(data))
  } catch {
    // 隐私模式或额度不足时，缓存失败不能阻断正文内容。
  }
}

export function readSnapshot(): TextSnapshot | null {
  const storage = getStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<TextSnapshot>
    if (!Array.isArray(parsed.memories) || !Array.isArray(parsed.messages)) {
      return null
    }
    return {
      memories: parsed.memories as MemoryItem[],
      messages: parsed.messages as MessageItem[],
    }
  } catch {
    return null
  }
}

export function clearSnapshot(): void {
  const storage = getStorage()
  if (!storage) return

  try {
    storage.removeItem(SNAPSHOT_KEY)
  } catch {
    // 清理失败保持静默，下一次写入仍可正常尝试。
  }
}
