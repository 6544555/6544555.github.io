import { useEffect, useState } from 'react'
import { COPY } from '../copy'
import type { CloudStore } from '../lib/storage'
import type { CloudState, PhotoItem } from '../types'
import { assetUrl } from './helpers'

interface PhotoImageProps {
  photo: PhotoItem
  store: CloudStore
  cloudState: CloudState
  className?: string
  eager?: boolean
}

type SourceState =
  | { kind: 'static'; url: string }
  | { kind: 'loading' }
  | { kind: 'cloud'; url: string }
  | { kind: 'unavailable' }

export function usePhotoSource(
  photo: PhotoItem,
  store: CloudStore,
  cloudState: CloudState,
): SourceState {
  const staticUrl = assetUrl(photo.src)
  const [source, setSource] = useState<SourceState>(
    staticUrl ? { kind: 'static', url: staticUrl } : { kind: 'loading' },
  )

  useEffect(() => {
    if (staticUrl) {
      setSource({ kind: 'static', url: staticUrl })
      return
    }
    if (!photo.storagePath) {
      setSource({ kind: 'unavailable' })
      return
    }
    if (cloudState === 'LOADING' || cloudState === 'PAUSED') {
      setSource({ kind: 'loading' })
      return
    }

    let active = true
    setSource({ kind: 'loading' })
    void store.getPhotoUrl(photo.storagePath).then((url) => {
      if (!active) return
      setSource(url ? { kind: 'cloud', url } : { kind: 'unavailable' })
    })

    return () => {
      active = false
    }
  }, [cloudState, photo.storagePath, staticUrl, store])

  return source
}

export function PhotoImage({
  photo,
  store,
  cloudState,
  className = '',
  eager = false,
}: PhotoImageProps) {
  const source = usePhotoSource(photo, store, cloudState)
  const alt = photo.note?.trim() || photo.filename

  if (source.kind === 'loading') {
    return <div className={`photo-placeholder ${className}`.trim()} aria-label={COPY.loadingAccessible} />
  }

  if (source.kind === 'unavailable') {
    return (
      <div className={`photo-placeholder ${className}`.trim()} role="img" aria-label={`${alt}，留白`}>
        <span>{COPY.photoPlaceholder}</span>
      </div>
    )
  }

  return (
    <img
      className={className}
      src={source.url}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  )
}
