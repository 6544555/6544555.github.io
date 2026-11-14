import { useEffect, useRef, useState, type FormEvent } from 'react'
import { COPY } from '../copy'
import type { AuthReason, AuthState } from '../types'
import { warmAuthConnection } from '../lib/auth'
import { authReasonMessage } from './authViewModel'

interface GateProps {
  reason?: AuthReason
  onSignIn: (email: string, password: string) => Promise<AuthState>
}

export function Gate({ reason, onSignIn }: GateProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState(() => authReasonMessage(reason))
  const [busy, setBusy] = useState(false)
  const [connectionReady, setConnectionReady] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void warmAuthConnection().finally(() => {
      if (active) {
        setConnectionReady(true)
        emailRef.current?.focus()
      }
    })
    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !connectionReady) return
    if (!email.trim() || !password) {
      setMessage(COPY.gateMismatch)
      return
    }
    if (emailRef.current && !emailRef.current.validity.valid) {
      setMessage(COPY.gateEmailInvalid)
      emailRef.current.focus()
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const result = await onSignIn(email.trim(), password)
      if (result.status === 'SIGNED_OUT' || result.status === 'DEGRADED') {
        setMessage(authReasonMessage(result.reason))
      }
    } catch {
      setMessage(COPY.authDegraded)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="gate-page">
      <section className="gate-letter auth-public-shell" aria-labelledby="gate-title">
        <div className="gate-seal" aria-hidden="true" />
        <p className="gate-kicker">PRIVATE ARCHIVE</p>
        <h1 id="gate-title" className="gate-title">
          {COPY.gateTitle}
        </h1>
        <p className="gate-subtitle">{COPY.gateSubtitle}</p>

        <form className="gate-form" onSubmit={handleSubmit} noValidate>
          <label className="line-field">
            <span>{COPY.gateAccount}</span>
            <input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (message) setMessage('')
              }}
              aria-describedby="auth-message"
              aria-invalid={message === COPY.gateEmailInvalid}
              disabled={busy || !connectionReady}
            />
          </label>
          <label className="line-field">
            <span>{COPY.gatePassword}</span>
            <input
              type="password"
              autoComplete="current-password"
              spellCheck={false}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                if (message) setMessage('')
              }}
              aria-describedby="auth-message"
              aria-invalid={message === COPY.gateMismatch}
              disabled={busy || !connectionReady}
            />
          </label>
          <div id="auth-message" className="gate-message" aria-live="polite">
            {!connectionReady ? (
              <span>{COPY.authLoading}</span>
            ) : message ? (
              <span>{message}</span>
            ) : null}
          </div>
          <button
            type="submit"
            className="primary-button gate-submit"
            disabled={busy || !connectionReady}
          >
            {COPY.gateSubmit}
          </button>
        </form>
      </section>
    </main>
  )
}
