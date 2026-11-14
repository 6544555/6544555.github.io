import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { MAX_PHOTO_BYTES } from '../config'
import { COPY, inputErrorMessage } from '../copy'
import { compressImage } from '../lib/image'
import type { CloudStore } from '../lib/storage'
import {
  CloudError,
  InputError,
  type CloudState,
  type PhotoItem,
} from '../types'
import { Dialog } from './Dialog'
import { formatDate, localDateValue, makeStoragePath } from './helpers'
import { PhotoImage } from './PhotoImage'
import { StatusSlot } from './StatusSlot'

type UploadStatus = 'waiting' | 'compressing' | 'uploading' | 'done' | 'rejected'

interface UploadTask {
  id: string
  file: File
  status: UploadStatus
  detail: string
}

interface PhotoWallProps {
  photos: PhotoItem[]
  cloudState: CloudState
  online: boolean
  store: CloudStore
  onCloudStateChange: (state: CloudState) => void
  onPhotoAdded: (photo: PhotoItem) => void
  onRequestDelete: (photo: PhotoItem) => void
  onRetryCloud: () => void
  onExport: () => void
}

function taskId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

function filenameDate(file: File): string {
  return localDateValue(new Date(file.lastModified || Date.now()))
}

export function PhotoWall({
  photos,
  cloudState,
  online,
  store,
  onCloudStateChange,
  onPhotoAdded,
  onRequestDelete,
  onRetryCloud,
  onExport,
}: PhotoWallProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const processingRef = useRef(false)
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [dragging, setDragging] = useState(false)
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<PhotoItem | null>(null)
  const [recentIds, setRecentIds] = useState<Set<string>>(new Set())

  const closeViewer = useCallback(() => setSelected(null), [])
  const writable =
    online &&
    cloudState !== 'LOADING' &&
    cloudState !== 'OFFLINE' &&
    cloudState !== 'PAUSED' &&
    cloudState !== 'QUOTA'

  const updateTask = (id: string, patch: Partial<UploadTask>) => {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    )
  }

  const highlight = (id: string) => {
    setRecentIds((current) => new Set(current).add(id))
    window.setTimeout(() => {
      setRecentIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }, 520)
  }

  const processFiles = async (files: File[]) => {
    if (processingRef.current || files.length === 0) return
    processingRef.current = true
    setNotice('')

    const nextTasks: UploadTask[] = files.slice(0, 20).map((file) => ({
      id: taskId(),
      file,
      status: 'waiting',
      detail: '',
    }))
    setTasks((current) => [...nextTasks, ...current.filter((task) => task.status !== 'done')])

    let completed = 0
    let rejected = 0
    let stopped = false

    for (const [index, task] of nextTasks.entries()) {
      if (stopped) break
      try {
        updateTask(task.id, { status: 'compressing', detail: COPY.compressing })
        if (task.file.size > MAX_PHOTO_BYTES) {
          throw new InputError('FILE_TOO_LARGE', 'file too large')
        }

        const compressed = await compressImage(task.file)
        const extension = compressed.format === 'webp' ? 'webp' : 'jpg'
        const storagePath = makeStoragePath(extension)
        updateTask(task.id, { status: 'uploading', detail: COPY.uploading })
        await store.uploadPhoto(storagePath, compressed.blob)
        const item = await store.addPhoto({
          filename: storagePath.split('/').pop() || `photo.${extension}`,
          takenAt: filenameDate(task.file),
          storagePath,
        })
        onPhotoAdded(item)
        highlight(item.id)
        updateTask(task.id, { status: 'done', detail: COPY.saveSuccess })
        completed += 1
      } catch (error) {
        rejected += 1
        if (error instanceof InputError) {
          updateTask(task.id, {
            status: 'rejected',
            detail: inputErrorMessage(error.reason),
          })
          continue
        }
        if (error instanceof CloudError) {
          onCloudStateChange(error.state)
          updateTask(task.id, { status: 'rejected', detail: COPY.uploadRetry })
          for (const pending of nextTasks.slice(index + 1)) {
            updateTask(pending.id, { status: 'rejected', detail: COPY.uploadRetry })
          }
          stopped = true
          continue
        }
        updateTask(task.id, { status: 'rejected', detail: COPY.uploadRetry })
      }
    }

    if (completed > 0 && rejected > 0) setNotice(COPY.uploadPartial)
    else if (rejected > 0) setNotice(COPY.uploadRetry)
    processingRef.current = false
  }

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    void processFiles(files)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (!writable) return
    void processFiles([...event.dataTransfer.files])
  }

  const retryTask = (task: UploadTask) => {
    setTasks((current) => current.filter((item) => item.id !== task.id))
    void processFiles([task.file])
  }

  return (
    <section id="photos" className="section photo-section" aria-labelledby="photos-title">
      <header className="section-header">
        <div>
          <p className="section-index">01</p>
          <h1 id="photos-title">{COPY.photoSection}</h1>
        </div>
        <div className="section-actions">
          <span className="quiet-count">{COPY.photoCount(photos.length)}</span>
          <button
            type="button"
            className="secondary-button"
            onClick={() => inputRef.current?.click()}
            disabled={!writable}
          >
            {COPY.addPhoto}
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            tabIndex={-1}
            onChange={handleInput}
          />
        </div>
      </header>

      <div className="photo-scrapbook" aria-hidden="true">
        <span className="memory-balloon balloon-a" />
        <span className="memory-balloon balloon-b" />
        <span className="memory-heart heart-a">♡</span>
        <span className="memory-heart heart-b">♡</span>
      </div>

      <div
        className={`photo-drop ${dragging ? 'is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          if (writable) setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragging(false)
        }}
        onDrop={handleDrop}
      >
        {photos.length === 0 && cloudState === 'LOADING' ? (
          <div className="photo-grid" aria-label={COPY.loadingAccessible}>
            {[0, 1, 2].map((item) => (
              <div key={item} className="photo-skeleton" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="empty-state photo-empty">
            <div className="blank-paper" aria-hidden="true" />
            <p>{COPY.emptyPhoto}</p>
            <button
              type="button"
              className="primary-button"
              disabled={!writable}
              onClick={() => inputRef.current?.click()}
            >
              {COPY.emptyPhotoAction}
            </button>
          </div>
        ) : (
          <div className="photo-grid">
            {photos.map((photo, index) => (
              <article
                key={photo.id}
                className={`photo-card tilt-${index % 3} ${
                  index % 7 === 0 ? 'photo-feature' : index % 7 === 4 ? 'photo-offset' : ''
                } ${recentIds.has(photo.id) ? 'is-new' : ''}`.trim()}
              >
                <button
                  type="button"
                  className="photo-open"
                  aria-label={`${photo.note || photo.filename}，${formatDate(photo.takenAt)}`}
                  onClick={() => setSelected(photo)}
                >
                  <span className="photo-frame">
                    <PhotoImage
                      photo={photo}
                      store={store}
                      cloudState={cloudState}
                      className="photo-image"
                      eager={index < 4}
                    />
                  </span>
                  <span className="photo-caption">
                    <time dateTime={photo.takenAt}>{formatDate(photo.takenAt)}</time>
                    {photo.note ? <span>{photo.note}</span> : null}
                  </span>
                </button>
              </article>
            ))}
          </div>
        )}
      </div>

      {tasks.length > 0 ? (
        <div className="upload-queue" aria-live="polite">
          {tasks.map((task) => (
            <div className="upload-row" key={task.id}>
              <span className="upload-name">{task.file.name}</span>
              <span className="upload-detail">{task.detail}</span>
              {task.status === 'rejected' ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => retryTask(task)}
                  disabled={processingRef.current || !writable}
                >
                  {COPY.retry}
                </button>
              ) : null}
            </div>
          ))}
          {notice ? <p className="queue-notice">{notice}</p> : null}
        </div>
      ) : null}

      <StatusSlot
        state={cloudState}
        variant="photo"
        online={online}
        onRetry={onRetryCloud}
        onExport={onExport}
      />

      {selected ? (
        <Dialog
          title={selected.note || selected.filename}
          onClose={closeViewer}
          className="photo-viewer"
        >
          <div className="photo-viewer-image">
            <PhotoImage
              photo={selected}
              store={store}
              cloudState={cloudState}
              eager
            />
          </div>
          <div className="photo-viewer-meta">
            <time dateTime={selected.takenAt}>{formatDate(selected.takenAt)}</time>
            {selected.note ? <p>{selected.note}</p> : null}
          </div>
          {selected.storagePath ? (
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                closeViewer()
                onRequestDelete(selected)
              }}
              disabled={!writable}
            >
              {COPY.deletePhotoAction}
            </button>
          ) : null}
        </Dialog>
      ) : null}
    </section>
  )
}
