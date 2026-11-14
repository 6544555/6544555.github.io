import { useEffect, useId, useState, type FormEvent } from 'react'
import { COPY, inputErrorMessage } from '../copy'
import type { CloudStore } from '../lib/storage'
import {
  CloudError,
  InputError,
  type CloudState,
  type MemoryItem,
  type PhotoItem,
} from '../types'
import { Dialog } from './Dialog'
import { localDateValue } from './helpers'

interface EntryDialogProps {
  entry?: MemoryItem
  photos: PhotoItem[]
  store: CloudStore
  online: boolean
  cloudState: CloudState
  onClose: () => void
  onCloudStateChange: (state: CloudState) => void
  onSaved: (entry: MemoryItem) => void
}

export function EntryDialog({
  entry,
  photos,
  store,
  online,
  cloudState,
  onClose,
  onCloudStateChange,
  onSaved,
}: EntryDialogProps) {
  const titleId = useId()
  const [date, setDate] = useState(entry?.date ?? localDateValue())
  const [title, setTitle] = useState(entry?.title ?? '')
  const [body, setBody] = useState(entry?.body ?? '')
  const [photoId, setPhotoId] = useState(entry?.photoId ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const writable =
    online &&
    cloudState !== 'LOADING' &&
    cloudState !== 'OFFLINE' &&
    cloudState !== 'PAUSED' &&
    cloudState !== 'QUOTA'

  useEffect(() => {
    setDate(entry?.date ?? localDateValue())
    setTitle(entry?.title ?? '')
    setBody(entry?.body ?? '')
    setPhotoId(entry?.photoId ?? '')
    setMessage('')
  }, [entry])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !writable) return
    if (!title.trim()) {
      setMessage(COPY.fieldRequired)
      return
    }
    if (title.trim().length > 30) {
      setMessage(COPY.fieldLimit(30))
      return
    }
    if (body.trim().length > 500) {
      setMessage(COPY.fieldLimit(500))
      return
    }

    setBusy(true)
    setMessage('')
    try {
      const input = {
        date,
        title,
        body,
        ...(photoId ? { photoId } : {}),
      }
      const saved = entry
        ? await store.updateMemory(entry.id, {
            date: input.date,
            title: input.title,
            body: input.body,
            photoId: photoId || '',
          })
        : await store.addMemory(input)
      onSaved(saved)
      onClose()
    } catch (error) {
      if (error instanceof InputError) {
        setMessage(inputErrorMessage(error.reason))
      } else {
        if (error instanceof CloudError) onCloudStateChange(error.state)
        setMessage(COPY.draftKept)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      title={entry ? COPY.timelineEdit : COPY.addMemory}
      onClose={onClose}
      className="entry-dialog"
      labelledBy={titleId}
    >
      <h3 id={titleId} className="visually-hidden">
        {entry ? COPY.timelineEdit : COPY.addMemory}
      </h3>
      <form className="entry-form" onSubmit={handleSubmit}>
        <div className="form-row form-row-two">
          <label className="stack-field">
            <span>日期</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="stack-field">
            <span>{COPY.memoryPhoto}</span>
            <select value={photoId} onChange={(event) => setPhotoId(event.target.value)}>
              <option value="">{COPY.noMemoryPhoto}</option>
              {photos.map((photo) => (
                <option key={photo.id} value={photo.id}>
                  {photo.note || photo.filename}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="stack-field">
          <span>
            标题 <small>{title.length}/30</small>
          </span>
          <input
            type="text"
            maxLength={30}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="stack-field">
          <span>
            正文 <small>{body.length}/500</small>
          </span>
          <textarea
            rows={7}
            maxLength={500}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        <div className="form-message" aria-live="polite">
          {message ? <span>{message}</span> : null}
          {!writable && !message ? <span>{COPY.offlineReadOnly}</span> : null}
        </div>
        <div className="form-actions">
          <button type="button" className="text-button" onClick={onClose}>
            {COPY.cancel}
          </button>
          <button type="submit" className="primary-button" disabled={busy || !writable}>
            {COPY.saveSuccess}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

interface ConfirmDialogProps {
  title: string
  onClose: () => void
  onConfirm: () => Promise<void>
  online: boolean
  onCloudStateChange: (state: CloudState) => void
}

export function ConfirmDialog({
  title,
  onClose,
  onConfirm,
  online,
  onCloudStateChange,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const confirm = async () => {
    if (busy || !online) return
    setBusy(true)
    setMessage('')
    try {
      await onConfirm()
      onClose()
    } catch (error) {
      if (error instanceof CloudError) onCloudStateChange(error.state)
      setMessage(COPY.retry)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={title} onClose={onClose} className="confirm-dialog">
      <p>{COPY.deleteBody}</p>
      <div className="form-message" role="status" aria-live="polite">
        {!online ? COPY.offlineReadOnly : message}
      </div>
      <div className="form-actions">
        <button type="button" className="text-button" onClick={onClose}>
          {COPY.cancel}
        </button>
        <button
          type="button"
          className="danger-button"
          onClick={() => void confirm()}
          disabled={busy || !online}
        >
          {COPY.deleteConfirm}
        </button>
      </div>
    </Dialog>
  )
}
