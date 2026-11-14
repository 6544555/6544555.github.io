import { useRef, useState, type FormEvent } from 'react'
import { COPY } from '../copy'
import type { CloudStore } from '../lib/storage'
import {
  CloudError,
  InputError,
  type CloudState,
  type MessageItem,
} from '../types'
import { formatDateTime } from './helpers'
import { StatusSlot } from './StatusSlot'

interface MessagesProps {
  items: MessageItem[]
  cloudState: CloudState
  online: boolean
  store: CloudStore
  onCloudStateChange: (state: CloudState) => void
  onAdded: (message: MessageItem) => void
  onRetryCloud: () => void
  onExport: () => void
}

export function Messages({
  items,
  cloudState,
  online,
  store,
  onCloudStateChange,
  onAdded,
  onRetryCloud,
  onExport,
}: MessagesProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const writable =
    online &&
    cloudState !== 'LOADING' &&
    cloudState !== 'OFFLINE' &&
    cloudState !== 'PAUSED' &&
    cloudState !== 'QUOTA'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !writable || !draft.trim()) return

    setBusy(true)
    setMessage('')
    try {
      const item = await store.addMessage(draft)
      onAdded(item)
      setDraft('')
      setMessage(COPY.saveSuccess)
    } catch (error) {
      if (error instanceof InputError) {
        setMessage(COPY.fieldRequired)
      } else {
        if (error instanceof CloudError) onCloudStateChange(error.state)
        setMessage(COPY.draftKept)
      }
    } finally {
      setBusy(false)
    }
  }

  const focusComposer = () => inputRef.current?.focus()

  return (
    <section id="messages" className="section message-section" aria-labelledby="messages-title">
      <header className="section-header">
        <div>
          <p className="section-index">03</p>
          <h1 id="messages-title">{COPY.messageSection}</h1>
        </div>
        <span className="quiet-count">{COPY.messageCount(items.length)}</span>
      </header>

      <div className="message-layout">
        <form className="message-composer" onSubmit={handleSubmit}>
          <label className="stack-field">
            <span>
              留言 <small>{draft.length}/500</small>
            </span>
            <textarea
              ref={inputRef}
              rows={4}
              maxLength={500}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={COPY.emptyMessage}
            />
          </label>
          <div className="composer-actions">
            <button
              type="submit"
              className="primary-button"
              disabled={busy || !writable || !draft.trim()}
            >
              {COPY.addMessage}
            </button>
          </div>
          <div className="form-message" aria-live="polite">
            {message ? <span>{message}</span> : null}
          </div>
        </form>

        <div className="message-list" aria-live="polite">
          {items.map((item) => (
            <article className="message-line" key={item.id}>
              <span className="message-mark" aria-hidden="true">
                “
              </span>
              <p>{item.text}</p>
              {item.createdAt ? (
                <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
              ) : null}
            </article>
          ))}
          {items.length === 0 && cloudState === 'LOADING' ? (
            <div className="message-skeleton" aria-label={COPY.loadingAccessible}>
              <span />
              <span />
              <span />
            </div>
          ) : null}
          {items.length === 0 && cloudState !== 'LOADING' ? (
            <div className="empty-state message-empty">
              <div className="blank-paper" aria-hidden="true" />
              <p>{COPY.emptyMessage}</p>
              <button type="button" className="primary-button" onClick={focusComposer}>
                {COPY.addMessage}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <StatusSlot
        state={cloudState}
        variant="write"
        online={online}
        onRetry={onRetryCloud}
        onExport={onExport}
      />
    </section>
  )
}
