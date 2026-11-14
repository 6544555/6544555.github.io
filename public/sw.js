const CACHE_NAME = 'birthday-memory-static-v4'
const scopeUrl = new URL(self.registration.scope)
const scopePath = scopeUrl.pathname.endsWith('/')
  ? scopeUrl.pathname
  : `${scopeUrl.pathname}/`
const shellUrl = new URL('./', scopeUrl).href

function resolveScopedAsset(rawUrl) {
  const absolute = new URL(rawUrl, scopeUrl)
  if (absolute.origin !== scopeUrl.origin) return null
  if (absolute.pathname.startsWith(scopePath)) return absolute.href
  if (rawUrl.startsWith('/')) {
    return new URL(rawUrl.replace(/^\/+/, ''), scopeUrl).href
  }
  return absolute.href
}

async function fetchAndCache(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload' })
    if (response.ok) await cache.put(url, response.clone())
    return response
  } catch {
    return null
  }
}

async function precacheStaticShell() {
  const cache = await caches.open(CACHE_NAME)
  const shellResponse = await fetchAndCache(cache, shellUrl)
  if (!shellResponse?.ok) return

  const html = await shellResponse.text()
  const assetUrls = new Set()
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const resolved = resolveScopedAsset(match[1])
    if (resolved) assetUrls.add(resolved)
  }

  await Promise.allSettled([...assetUrls].map((url) => fetchAndCache(cache, url)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheStaticShell().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scopePath)) return

  // Auth-gated content and protected media must always use the network.
  if (url.pathname.endsWith('/content.json') || url.pathname.includes('/memories/')) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      if (request.mode === 'navigate') {
        try {
          const response = await fetch(request)
          if (response.ok) await cache.put(shellUrl, response.clone())
          return response
        } catch {
          const fallback = await cache.match(shellUrl)
          if (fallback) return fallback
          throw new Error('offline shell unavailable')
        }
      }

      const cached = await cache.match(request, { ignoreSearch: false })
      if (cached) return cached

      try {
        const response = await fetch(request)
        if (response.ok) await cache.put(request, response.clone())
        return response
      } catch {
        throw new Error('static asset unavailable')
      }
    })(),
  )
})
