import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearSnapshot,
  readSnapshot,
  saveSnapshot,
} from '../src/lib/localcache'
import type { MemoryItem, MessageItem } from '../src/types'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('local text snapshot', () => {
  it('round-trips cloud text without photos', () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    const memories: MemoryItem[] = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        date: '2024-07-12',
        title: '<MEMORY_TITLE>',
        body: '<MEMORY_BODY>',
      },
    ]
    const messages: MessageItem[] = [
      {
        id: '20000000-0000-4000-8000-000000000001',
        text: '<MESSAGE_TEXT>',
      },
    ]

    saveSnapshot({ memories, messages })
    expect(readSnapshot()).toEqual({ memories, messages })
    clearSnapshot()
    expect(readSnapshot()).toBeNull()
  })

  it('returns null when storage access throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })

    expect(readSnapshot()).toBeNull()
    expect(() =>
      saveSnapshot({
        memories: [],
        messages: [],
      }),
    ).not.toThrow()
  })
})
