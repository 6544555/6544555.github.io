import { useState } from 'react'
import { COPY } from '../copy'
import type { AuthState } from '../types'
import { authReasonMessage } from './authViewModel'

type PublicAuthState = Extract<AuthState, { status: 'LOADING' | 'DEGRADED' }>

interface AuthStatusProps {
  state: PublicAuthState
  onRetry: () => Promise<void>
}

export function AuthStatus({ state, onRetry }: AuthStatusProps) {
  const [busy, setBusy] = useState(false)
  const message =
    state.status === 'LOADING' ? COPY.authLoading : authReasonMessage(state.reason)

  const retry = async () => {
    if (busy) return
    setBusy(true)
    try {
      await onRetry()
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="gate-page">
      <section className="gate-letter auth-public-shell" aria-labelledby="auth-status-title">
        <div className="gate-seal" aria-hidden="true" />
        <p className="gate-kicker">PRIVATE ARCHIVE</p>
        <h1 id="auth-status-title" className="gate-title">
          {COPY.gateTitle}
        </h1>
        <p className="gate-subtitle" role="status" aria-live="polite">
          {message}
        </p>

        {state.status === 'DEGRADED' ? (
          <button
            type="button"
            className="primary-button"
            disabled={busy}
            onClick={() => void retry()}
          >
            {COPY.authRetry}
          </button>
        ) : null}
      </section>
    </main>
  )
}
