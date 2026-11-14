import {
  useCallback,
  useEffect,
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

export const PHOTO_FRAME_CLASSES = [
  'frame-gallery',
  'frame-matte',
  'frame-rule',
  'frame-archive',
  'frame-inset',
] as const

export function photoCardClass(index: number, isRecent = false): string {
  const frame = PHOTO_FRAME_CLASSES[index % PHOTO_FRAME_CLASSES.length]
  const composition =
    index % 7 === 0
      ? 'photo-feature photo-landscape'
      : index % 5 === 2
        ? 'photo-square'
        : index % 5 === 3
          ? 'photo-tall'
          : index % 7 === 4
            ? 'photo-offset'
            : ''

  return `photo-card ${frame} ${composition}${isRecent ? ' is-new' : ''}`.trim()
}

export function photoLayoutGroups(count: number): number[][] {
  const groups: number[][] = []

  for (let index = 0; index < count; index += 1) {
    if (index % 7 === 0) groups.push([index])
    else groups[groups.length - 1].push(index)
  }

  return groups
}

export function photoColumnCount(viewportWidth: number): number {
  if (viewportWidth >= 1200) return 4
  if (viewportWidth >= 768) return 3
  return 2
}

export function photoColumnBuckets(indexes: number[], count: number): number[][] {
  const buckets = Array.from({ length: count }, () => [] as number[])
  const heights = Array.from({ length: count }, () => 0)

  for (const index of indexes) {
    const target = heights.indexOf(Math.min(...heights))
    buckets[target].push(index)
    heights[target] +=
      index % 5 === 2 ? 1 : index % 5 === 3 ? 4 / 3 : 5 / 4
  }

  return buckets
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

function UploadPreview({ file }: { file: File }) {
  const [src, setSrc] = useState('')

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  return (
    <span className="upload-preview" aria-hidden="true">
      {src ? <img src={src} alt="" /> : null}
    </span>
  )
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
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [recentIds, setRecentIds] = useState<Set<string>>(new Set())
  const [columnCount, setColumnCount] = useState(() =>
    photoColumnCount(typeof window === 'undefined' ? 375 : window.innerWidth),
  )

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1200px)')
    const tablet = window.matchMedia('(min-width: 768px)')
    const sync = () => setColumnCount(photoColumnCount(window.innerWidth))

    sync()
    desktop.addEventListener('change', sync)
    tablet.addEventListener('change', sync)
    return () => {
      desktop.removeEventListener('change', sync)
      tablet.removeEventListener('change', sync)
    }
  }, [])

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
    }, 2_600)
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

  const renderPhotoCard = (photo: PhotoItem, index: number) => (
    <article key={photo.id} className={photoCardClass(index, recentIds.has(photo.id))}>
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
      {recentIds.has(photo.id) ? (
        <span className="photo-fresh-label" aria-hidden="true">
          新入册
        </span>
      ) : null}
    </article>
  )

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
            className="secondary-button photo-library-button"
            onClick={() => setLibraryOpen(true)}
            disabled={photos.length === 0}
          >
            {COPY.photoLibrary}
          </button>
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
          <div className="photo-album">
            {photoLayoutGroups(photos.length).map((group) => {
              const [featureIndex, ...columnIndexes] = group
              const visibleColumns = Math.min(columnCount, columnIndexes.length)
              const columns = photoColumnBuckets(columnIndexes, visibleColumns)
              return (
                <div className="photo-album-group" key={photos[featureIndex].id}>
                  {renderPhotoCard(photos[featureIndex], featureIndex)}
                  {visibleColumns > 0 ? (
                    <div className="photo-columns" data-columns={visibleColumns}>
                      {columns.map((indexes, columnIndex) => (
                        <div className="photo-column" key={columnIndex}>
                          {indexes.map((index) => renderPhotoCard(photos[index], index))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {tasks.length > 0 ? (
        <div className="upload-queue" aria-live="polite">
          {tasks.map((task) => (
            <div className={`upload-row is-${task.status}`} key={task.id}>
              <UploadPreview file={task.file} />
              <span className="upload-content">
                <span className="upload-name">{task.file.name}</span>
                <span className="upload-detail">{task.detail}</span>
              </span>
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

      {libraryOpen ? (
        <Dialog
          title={COPY.photoLibraryTitle}
          onClose={() => setLibraryOpen(false)}
          className="photo-library-dialog"
        >
          <div className="photo-library-heading">
            <p>{COPY.photoLibraryHint}</p>
            <span>{COPY.photoCount(photos.length)}</span>
          </div>
          <div className="photo-library-grid">
            {photos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                className={`photo-library-card ${
                  PHOTO_FRAME_CLASSES[index % PHOTO_FRAME_CLASSES.length]
                }`}
                aria-label={`${photo.note || photo.filename}，${formatDate(photo.takenAt)}`}
                onClick={() => {
                  setLibraryOpen(false)
                  setSelected(photo)
                }}
              >
                <span className="photo-frame photo-library-frame">
                  <PhotoImage
                    photo={photo}
                    store={store}
                    cloudState={cloudState}
                    className="photo-library-image"
                    eager={index < 12}
                  />
                </span>
                <span className="photo-library-caption">
                  <time dateTime={photo.takenAt}>{formatDate(photo.takenAt)}</time>
                  {photo.note ? <span>{photo.note}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </Dialog>
      ) : null}

      {selected ? (
        <Dialog
          title={selected.note || selected.filename}
          onClose={closeViewer}
          className="photo-viewer"
        >
          <div className="photo-viewer-scroll">
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
          </div>
          {selected.storagePath ? (
            <div className="photo-viewer-actions">
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
            </div>
          ) : null}
        </Dialog>
      ) : null}
    </section>
  )
}
