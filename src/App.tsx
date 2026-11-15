import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { COPY } from './copy'
import { DEFAULT_CONTENT } from './defaultContent'
import { buildExportZip } from './export'
import {
  restoreSession,
  signIn as authSignIn,
  signOut as authSignOut,
  subscribeToAuth,
} from './lib/auth'
import { daysTogether, loadStaticContent, mergeContent } from './lib/content'
import { readSnapshot, saveSnapshot } from './lib/localcache'
import { createCloudStore, type CloudStore } from './lib/storage'
import {
  CloudError,
  type AuthState,
  type CloudState,
  type ContentBundle,
  type ExportBundle,
  type MemoryItem,
  type MessageItem,
  type PhotoItem,
} from './types'
import { AuthStatus } from './ui/AuthStatus'
import { BackgroundMusic } from './ui/BackgroundMusic'
import { recoverFromPermissionFailure } from './ui/authViewModel'
import { ConfirmDialog, EntryDialog } from './ui/EntryDialog'
import { Gate } from './ui/Gate'
import { HeartbeatDivider } from './ui/HeartbeatDivider'
import { HeartRain } from './ui/HeartRain'
import {
  cloudStateFrom,
  isValidStartDate,
  localDateValue,
  saveBlob,
} from './ui/helpers'
import { Messages } from './ui/Messages'
import { PhotoWall } from './ui/PhotoWall'
import { Timeline } from './ui/Timeline'
import { useRevealSections } from './ui/useRevealSections'
import './styles.css'

const INTRO_SESSION_KEY = 'bday:v1:intro-seen'

type DeleteTarget =
  | { kind: 'photo'; item: PhotoItem }
  | { kind: 'memory'; item: MemoryItem }
  | { kind: 'message'; item: MessageItem }

interface ExportStatus {
  busy: boolean
  message: string
}

function introHasPlayed(): boolean {
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState>({ status: 'LOADING' })

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    try {
      unsubscribe = subscribeToAuth((state) => {
        if (active) setAuthState(state)
      })
    } catch {
      setAuthState({ status: 'DEGRADED', reason: 'CLOUD_UNAVAILABLE' })
    }
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const retryAuth = useCallback(async () => {
    setAuthState({ status: 'LOADING' })
    setAuthState(await restoreSession())
  }, [])

  const handleSignIn = useCallback(async (email: string, password: string) => {
    const next = await authSignIn(email, password)
    setAuthState(next)
    return next
  }, [])

  const handleSignOut = useCallback(() => {
    setAuthState({ status: 'SIGNED_OUT', reason: 'AUTH_REQUIRED' })
    void authSignOut().catch(() => {
      // The local session and private in-memory state are already removed from the view.
    })
  }, [])

  if (authState.status === 'LOADING') {
    return <AuthStatus state={authState} onRetry={retryAuth} />
  }
  if (authState.status === 'DEGRADED') {
    return <AuthStatus state={authState} onRetry={retryAuth} />
  }
  if (authState.status === 'SIGNED_OUT') {
    return <Gate reason={authState.reason} onSignIn={handleSignIn} />
  }

  return (
    <MemorySite
      user={authState.user}
      onSignOut={handleSignOut}
      onAuthStateChange={setAuthState}
    />
  )
}

function MemorySite({
  user,
  onSignOut,
  onAuthStateChange,
}: {
  user: Extract<AuthState, { status: 'AUTHENTICATED' }>['user']
  onSignOut: () => void
  onAuthStateChange: (state: AuthState) => void
}) {
  useRevealSections()
  const storeRef = useRef<CloudStore | null>(null)
  if (!storeRef.current) storeRef.current = createCloudStore()
  const store = storeRef.current
  const cached = useMemo(() => readSnapshot(), [])
  const [staticContent, setStaticContent] = useState<ContentBundle>(DEFAULT_CONTENT)
  const [cloudPhotos, setCloudPhotos] = useState<PhotoItem[]>([])
  const [cloudMemories, setCloudMemories] = useState<MemoryItem[]>(
    () => cached?.memories ?? [],
  )
  const [cloudMessages, setCloudMessages] = useState<MessageItem[]>(
    () => cached?.messages ?? [],
  )
  const [cloudState, setCloudState] = useState<CloudState>('LOADING')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [sealOpen, setSealOpen] = useState(false)
  const [entryEditor, setEntryEditor] = useState<MemoryItem | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [exportStatus, setExportStatus] = useState<ExportStatus>({
    busy: false,
    message: '',
  })
  const [showIntro, setShowIntro] = useState(
    () => !introHasPlayed() && !prefersReducedMotion(),
  )
  const [, setDayTick] = useState(0)

  useEffect(() => {
    let timer: number | undefined

    const scheduleNextDay = () => {
      const now = new Date()
      const nextDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      )
      timer = window.setTimeout(() => {
        setDayTick((tick) => tick + 1)
        scheduleNextDay()
      }, nextDay.getTime() - now.getTime() + 1_000)
    }

    scheduleNextDay()
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  useEffect(
    () => () => {
      store.clearRuntimeCache()
    },
    [store],
  )

  const reconcilePermissionFailure = useCallback(async () => {
    const recovery = await recoverFromPermissionFailure(restoreSession)
    if (recovery.kind === 'UNMOUNT') {
      onAuthStateChange(recovery.authState)
      return true
    }
    setCloudState(recovery.cloudState)
    return false
  }, [onAuthStateChange])

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch(() => {
        // Offline browsing remains optional when a browser blocks service workers.
      })
  }, [])

  const content = useMemo(
    () =>
      mergeContent(staticContent, {
        photos: cloudPhotos,
        memories: cloudMemories,
        messages: cloudMessages,
      }),
    [cloudMemories, cloudMessages, cloudPhotos, staticContent],
  )

  const cloudMemoryIds = useMemo(
    () => new Set(cloudMemories.map((entry) => entry.id)),
    [cloudMemories],
  )
  const cloudMessageIds = useMemo(
    () => new Set(cloudMessages.map((message) => message.id)),
    [cloudMessages],
  )

  const finishIntro = useCallback(() => {
    setShowIntro(false)
    try {
      sessionStorage.setItem(INTRO_SESSION_KEY, '1')
    } catch {
      // 会话存储不可用时，本次页面仍可正常进入。
    }
  }, [])

  useEffect(() => {
    if (!showIntro) return
    const timer = window.setTimeout(finishIntro, 280)
    return () => window.clearTimeout(timer)
  }, [finishIntro, showIntro])

  useEffect(() => {
    let active = true
    void loadStaticContent().then((bundle) => {
      if (active && !bundle.staticLoadFailed) setStaticContent(bundle)
    })
    return () => {
      active = false
    }
  }, [])

  const refreshCloud = useCallback(async (showLoading = true) => {
    if (showLoading) setCloudState('LOADING')
    try {
      const initial = await store.init()
      if (initial !== 'READY') {
        if (initial === 'DEGRADED' && (await reconcilePermissionFailure())) return
        setCloudState(initial)
        return
      }

      const [photos, memories, messages] = await Promise.all([
        store.listPhotos(),
        store.listMemories(),
        store.listMessages(),
      ])
      setCloudPhotos(photos)
      setCloudMemories(memories)
      setCloudMessages(messages)
      saveSnapshot({ memories, messages })
      setCloudState('READY')
    } catch (error) {
      if (error instanceof CloudError && error.reason === 'PERMISSION_POLICY') {
        await reconcilePermissionFailure()
        return
      }
      const nextState = cloudStateFrom(error)
      if (nextState) setCloudState(nextState)
      else setCloudState('DEGRADED')
    }
  }, [reconcilePermissionFailure, store])

  useEffect(() => {
    void refreshCloud()
  }, [refreshCloud])

  useEffect(() => {
    const handleOffline = () => {
      setOnline(false)
      setCloudState('OFFLINE')
    }
    const handleOnline = () => {
      setOnline(true)
      setCloudState((current) => (current === 'OFFLINE' ? 'DEGRADED' : current))
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  useEffect(() => {
    saveSnapshot({ memories: cloudMemories, messages: cloudMessages })
  }, [cloudMemories, cloudMessages])

  const updateCloudState = useCallback((state: CloudState) => {
    setCloudState(state)
  }, [])

  const handlePhotoAdded = (photo: PhotoItem) => {
    setCloudPhotos((current) => [photo, ...current.filter((item) => item.id !== photo.id)])
    setCloudState((current) => (current === 'QUOTA' ? 'READY' : current))
  }

  const handleEntrySaved = (entry: MemoryItem) => {
    setCloudMemories((current) => {
      const found = current.some((item) => item.id === entry.id)
      return found
        ? current.map((item) => (item.id === entry.id ? entry : item))
        : [entry, ...current]
    })
    setCloudState((current) => (current === 'QUOTA' ? 'READY' : current))
  }

  const handleMessageAdded = (message: MessageItem) => {
    setCloudMessages((current) => [message, ...current])
    setCloudState((current) => (current === 'QUOTA' ? 'READY' : current))
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'photo') {
      await store.deletePhoto(deleteTarget.item.id)
      setCloudPhotos((current) =>
        current.filter((photo) => photo.id !== deleteTarget.item.id),
      )
      setCloudMemories((current) =>
        current.map((entry) =>
          entry.photoId === deleteTarget.item.id ? { ...entry, photoId: undefined } : entry,
        ),
      )
    } else if (deleteTarget.kind === 'memory') {
      await store.deleteMemory(deleteTarget.item.id)
      setCloudMemories((current) =>
        current.filter((entry) => entry.id !== deleteTarget.item.id),
      )
    } else {
      await store.deleteMessage(deleteTarget.item.id)
      setCloudMessages((current) =>
        current.filter((message) => message.id !== deleteTarget.item.id),
      )
    }
    setCloudState('READY')
  }

  const handleExport = async () => {
    if (exportStatus.busy) return
    const total = content.photos.length
    setExportStatus({
      busy: true,
      message: COPY.exportProgress(0, total),
    })

    let cloudBundle: ExportBundle | null = null
    try {
      cloudBundle = await store.exportAll()
      setCloudState('READY')
    } catch (error) {
      if (error instanceof CloudError && error.reason === 'PERMISSION_POLICY') {
        await reconcilePermissionFailure()
      } else {
        const nextState = cloudStateFrom(error)
        if (nextState) setCloudState(nextState)
      }
      setExportStatus({ busy: false, message: COPY.exportBlocked })
      return
    }

    try {
      const blob = await buildExportZip({
        content,
        cloud: cloudBundle,
        onProgress: (done, totalPhotos) =>
          setExportStatus({
            busy: true,
            message: COPY.exportProgress(done, totalPhotos),
          }),
      })
      saveBlob(blob, `memories-${localDateValue()}.zip`)
      setExportStatus({ busy: false, message: COPY.exportSuccess })
    } catch {
      setExportStatus({ busy: false, message: COPY.exportBlocked })
    }
  }

  const days = daysTogether(content.site.startDate)
  const canShowDays = isValidStartDate(content.site.startDate) && days >= 0
  const deleteTitle = deleteTarget
    ? deleteTarget.kind === 'photo'
      ? COPY.deleteTitlePhoto
      : deleteTarget.kind === 'memory'
        ? COPY.deleteTitleMemory
        : COPY.deleteTitleMessage
    : ''

  return (
    <>
      <a className="skip-link" href="#main-content">
        {COPY.skipToContent}
      </a>

      {showIntro ? (
        <div className="intro-reveal">
          <div className="intro-half intro-top" aria-hidden="true">
            <span>{content.site.herName}</span>
          </div>
          <div className="intro-half intro-bottom" aria-hidden="true" />
          <button
            type="button"
            className="intro-skip"
            aria-label={COPY.openingSkip}
            onClick={finishIntro}
          >
            {COPY.openingSkip}
          </button>
        </div>
      ) : null}

      <div className="site-shell">
        <header className="site-header">
          <div className="masthead">
            <div className="masthead-copy">
              <p className="site-name">{content.site.herName}</p>
              <p className="opening-line">{content.site.openingLine}</p>
              <p className="masthead-deck">{COPY.heroDeck}</p>
              <div className="hero-actions">
                <a className="primary-button hero-primary" href="#photos">
                  <span>{COPY.browsePhotos}</span>
                  <span aria-hidden="true">↓</span>
                </a>
                {canShowDays ? (
                  <div className="seal-wrap">
                    <button
                      type="button"
                      className="date-seal"
                      aria-expanded={sealOpen}
                      onClick={() => setSealOpen((value) => !value)}
                    >
                      {COPY.daySeal(days)}
                    </button>
                    {sealOpen ? (
                      <p className="seal-reveal" role="status">
                        {COPY.daySeal(days)}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="masthead-actions">
              <HeartRain />
              <BackgroundMusic />
              <button
                type="button"
                className="text-button lock-button"
                onClick={onSignOut}
                title={user.email}
              >
                {COPY.authSignOut}
              </button>
            </div>
          </div>
          <nav className="site-nav" aria-label="主站导航">
            <a href="#photos">{COPY.navPhotos}</a>
            <a href="#timeline">{COPY.navTimeline}</a>
            <a href="#messages">{COPY.navMessages}</a>
          </nav>
        </header>

        <main id="main-content" tabIndex={-1}>
          <PhotoWall
            photos={content.photos}
            cloudState={cloudState}
            online={online}
            store={store}
            onCloudStateChange={updateCloudState}
            onPhotoAdded={handlePhotoAdded}
            onRequestDelete={(photo) => setDeleteTarget({ kind: 'photo', item: photo })}
            onRetryCloud={() => void refreshCloud(false)}
            onExport={() => void handleExport()}
          />

          <Timeline
            items={content.timeline}
            photos={content.photos}
            cloudMemoryIds={cloudMemoryIds}
            cloudState={cloudState}
            online={online}
            store={store}
            onAdd={() => setEntryEditor('new')}
            onEdit={(entry) => setEntryEditor(entry)}
            onDelete={(entry) => setDeleteTarget({ kind: 'memory', item: entry })}
            onRetryCloud={() => void refreshCloud(false)}
            onExport={() => void handleExport()}
          />

          <Messages
            items={content.messages}
            cloudState={cloudState}
            online={online}
            store={store}
            deletableIds={cloudMessageIds}
            onCloudStateChange={updateCloudState}
            onAdded={handleMessageAdded}
            onDelete={(message) => setDeleteTarget({ kind: 'message', item: message })}
            onRetryCloud={() => void refreshCloud(false)}
            onExport={() => void handleExport()}
          />
        </main>

        <HeartbeatDivider />

        <footer className="site-footer">
          <p className="footer-edition" aria-hidden="true">
            PRIVATE MEMORY / END NOTE
          </p>
          <button
            type="button"
            className="footer-export"
            onClick={() => void handleExport()}
            disabled={exportStatus.busy}
          >
            {exportStatus.busy
              ? COPY.exportProgress(0, content.photos.length)
              : COPY.exportAction}
          </button>
          <div className="export-status" aria-live="polite">
            {exportStatus.message}
          </div>
        </footer>
      </div>

      {entryEditor ? (
        <EntryDialog
          entry={entryEditor === 'new' ? undefined : entryEditor}
          photos={cloudPhotos}
          store={store}
          online={online}
          cloudState={cloudState}
          onClose={() => setEntryEditor(null)}
          onCloudStateChange={updateCloudState}
          onSaved={handleEntrySaved}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={deleteTitle}
          online={online}
          onCloudStateChange={updateCloudState}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  )
}
