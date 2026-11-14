import type { ReactNode } from 'react'
import { COPY, CLOUD_COPY } from '../copy'
import type { CloudState } from '../types'

interface StatusSlotProps {
  state: CloudState
  variant: 'photo' | 'timeline' | 'write'
  online: boolean
  onRetry?: () => void
  onExport?: () => void
  children?: ReactNode
}

export function StatusSlot({
  state,
  variant,
  online,
  onRetry,
  onExport,
  children,
}: StatusSlotProps) {
  const hideStatus = state === 'READY' || (state === 'QUOTA' && variant === 'timeline')
  if (hideStatus && !children) {
    return <div className={`status-slot status-slot-${variant}`} aria-hidden="true" />
  }

  const showRetry = (state === 'DEGRADED' || state === 'OFFLINE') && onRetry
  const message = state === 'READY' ? '' : CLOUD_COPY[state]

  return (
    <div
      className={`status-slot status-slot-${variant} status-slot-active status-${state.toLowerCase()}`}
      role="status"
      aria-live="polite"
    >
      {state === 'LOADING' && variant !== 'write' ? (
        <div className="status-loading-line" aria-hidden="true">
          <span />
          <span />
        </div>
      ) : null}
      {message ? <p>{message}</p> : null}
      {children}
      {showRetry ? (
        <button
          type="button"
          className="text-button"
          onClick={onRetry}
          disabled={!online && state === 'OFFLINE'}
        >
          {COPY.retry}
        </button>
      ) : null}
      {state === 'QUOTA' && variant === 'write' && onExport ? (
        <button type="button" className="text-button" onClick={onExport}>
          {COPY.exportAction}
        </button>
      ) : null}
    </div>
  )
}
