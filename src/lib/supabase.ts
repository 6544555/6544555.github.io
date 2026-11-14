import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { REQUEST_TIMEOUT_MS } from '../config'
import { CloudError } from '../types'

let client: SupabaseClient | undefined

const fetchWithTimeout: typeof fetch = async (input, init = {}) => {
  const controller = new AbortController()
  let timedOut = false
  const externalSignal = init.signal

  const abortFromExternalSignal = () => {
    controller.abort(externalSignal?.reason)
  }

  if (externalSignal?.aborted) {
    abortFromExternalSignal()
  } else {
    externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true })
  }

  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (timedOut) {
      throw new CloudError(
        'DEGRADED',
        'CLOUD_TIMEOUT',
        '云端请求超过 8 秒',
      )
    }

    if (externalSignal?.aborted) {
      throw new CloudError(
        'DEGRADED',
        'CLOUD_UNAVAILABLE',
        '云端请求已中止',
      )
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', abortFromExternalSignal)
  }
}

export function getClient(): SupabaseClient {
  if (client) return client

  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) {
    throw new CloudError(
      'DEGRADED',
      'CLOUD_UNAVAILABLE',
      '请检查 .env 是否配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY',
    )
  }

  // anon key 按设计会出现在浏览器产物中；访问权限必须由 RLS 承担。
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  })

  return client
}
