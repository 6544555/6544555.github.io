import { useState } from 'react'
import { COPY } from '../copy'
import type { CloudStore } from '../lib/storage'
import type { CloudState, MemoryItem, PhotoItem } from '../types'
import { formatDate } from './helpers'
import { PhotoImage } from './PhotoImage'
import { StatusSlot } from './StatusSlot'

interface TimelineProps {
  items: MemoryItem[]
  photos: PhotoItem[]
  cloudMemoryIds: Set<string>
  cloudState: CloudState
  online: boolean
  store: CloudStore
  onAdd: () => void
  onEdit: (entry: MemoryItem) => void
  onDelete: (entry: MemoryItem) => void
  onRetryCloud: () => void
  onExport: () => void
}

export function Timeline({
  items,
  photos,
  cloudMemoryIds,
  cloudState,
  online,
  store,
  onAdd,
  onEdit,
  onDelete,
  onRetryCloud,
  onExport,
}: TimelineProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const writable =
    online &&
    cloudState !== 'LOADING' &&
    cloudState !== 'OFFLINE' &&
    cloudState !== 'PAUSED' &&
    cloudState !== 'QUOTA'
  const photoMap = new Map(photos.map((photo) => [photo.id, photo]))

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section id="timeline" className="section timeline-section" aria-labelledby="timeline-title">
      <header className="section-header">
        <div>
          <p className="section-index">02</p>
          <h1 id="timeline-title">{COPY.timelineSection}</h1>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={onAdd}
          disabled={!writable}
        >
          {COPY.addMemory}
        </button>
      </header>

      <div className="timeline-list">
        {items.length === 0 && cloudState === 'LOADING' ? (
          <div className="timeline-loading" aria-label={COPY.loadingAccessible}>
            <div className="text-skeleton" />
            <div className="text-skeleton short" />
            <div className="text-skeleton" />
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state timeline-empty">
            <div className="blank-paper" aria-hidden="true" />
            <p>{COPY.emptyTimeline}</p>
            <button
              type="button"
              className="primary-button"
              onClick={onAdd}
              disabled={!writable}
            >
              {COPY.emptyTimelineAction}
            </button>
          </div>
        ) : (
          items.map((entry) => {
            const photo = entry.photoId ? photoMap.get(entry.photoId) : undefined
            const isExpanded = expanded.has(entry.id)
            const canExpand = entry.body.length > 180 || entry.body.split('\n').length > 5
            const isCloud = cloudMemoryIds.has(entry.id)

            return (
              <article className="timeline-entry" key={entry.id}>
                <div className="timeline-date">
                  <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                  <span className="timeline-dot" aria-hidden="true" />
                </div>
                <div className="timeline-content">
                  <div className="timeline-heading">
                    <h2>{entry.title}</h2>
                    {isCloud && writable ? (
                      <div className="entry-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onEdit(entry)}
                        >
                          {COPY.timelineEdit}
                        </button>
                        <button
                          type="button"
                          className="text-button danger-text"
                          onClick={() => onDelete(entry)}
                        >
                          {COPY.delete}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {photo ? (
                    <div className="timeline-photo">
                      <PhotoImage
                        photo={photo}
                        store={store}
                        cloudState={cloudState}
                        className="timeline-photo-image"
                      />
                    </div>
                  ) : null}
                  <p
                    className={`timeline-body ${isExpanded ? 'is-expanded' : ''}`.trim()}
                  >
                    {entry.body}
                  </p>
                  {canExpand ? (
                    <button
                      type="button"
                      className="text-button disclosure-button"
                      onClick={() => toggleExpanded(entry.id)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? COPY.timelineCollapse : COPY.timelineExpand}
                    </button>
                  ) : null}
                </div>
              </article>
            )
          })
        )}
      </div>

      <StatusSlot
        state={cloudState}
        variant="timeline"
        online={online}
        onRetry={onRetryCloud}
        onExport={onExport}
      />
    </section>
  )
}
