import { useEffect, useMemo, useRef, useState } from 'react'
import { COPY } from '../copy'
import {
  loadCustomMusic,
  resetCustomMusic,
  uploadCustomMusic,
} from '../lib/music'
import { InputError } from '../types'
import { Dialog } from './Dialog'
import './background-music.css'

const MUSIC_PREFERENCE_KEY = 'bday:v1:music-enabled'
const DEFAULT_MUSIC_FILE = 'audio/memory-theme.ogg'

export function resolveMusicUrl(baseUrl: string, configuredUrl?: string): string {
  const custom = configuredUrl?.trim()
  if (custom) return custom
  return `${baseUrl.replace(/\/?$/, '/')}${DEFAULT_MUSIC_FILE}`
}

function savedPreference(): boolean {
  try {
    return localStorage.getItem(MUSIC_PREFERENCE_KEY) === '1'
  } catch {
    return false
  }
}

function savePreference(enabled: boolean): void {
  try {
    localStorage.setItem(MUSIC_PREFERENCE_KEY, enabled ? '1' : '0')
  } catch {
    // Playback still works when preference storage is unavailable.
  }
}

export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const autoPlayRequestedRef = useRef(savedPreference())
  const defaultSrc = useMemo(
    () =>
      resolveMusicUrl(
        import.meta.env.BASE_URL,
        import.meta.env.VITE_BACKGROUND_MUSIC_URL,
      ),
    [],
  )
  const [src, setSrc] = useState(defaultSrc)
  const [playing, setPlaying] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [customTrack, setCustomTrack] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    void loadCustomMusic()
      .then((track) => {
        if (!active || !track) return
        autoPlayRequestedRef.current = savedPreference()
        setCustomTrack(true)
        setSrc(track.url)
      })
      .catch(() => {
        // A missing bucket or network failure falls back to the bundled track.
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    setUnavailable(false)
    audio.load()
    if (!autoPlayRequestedRef.current) return

    autoPlayRequestedRef.current = false
    void audio.play().catch(() => {
      // Browsers may require a fresh gesture after reopening the page.
      setPlaying(false)
    })
  }, [src])

  useEffect(
    () => () => {
      audioRef.current?.pause()
    },
    [],
  )

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio || unavailable) return

    if (!audio.paused) {
      audio.pause()
      savePreference(false)
      return
    }

    try {
      await audio.play()
      savePreference(true)
    } catch {
      setPlaying(false)
    }
  }

  const chooseFile = () => {
    if (!busy) inputRef.current?.click()
  }

  const handleFile = async (file: File | undefined) => {
    if (!file || busy) return

    setBusy(true)
    setMessage(COPY.musicUploading)
    try {
      const track = await uploadCustomMusic(file)
      autoPlayRequestedRef.current = true
      setCustomTrack(true)
      setSrc(track.url)
      setMessage(COPY.musicUploadSuccess)
      savePreference(true)
    } catch (error) {
      if (error instanceof InputError) {
        setMessage(
          error.reason === 'FILE_TOO_LARGE'
            ? COPY.musicTooLarge
            : COPY.musicUnsupported,
        )
      } else {
        setMessage(COPY.musicError)
      }
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const restoreDefault = async () => {
    if (busy || !customTrack) return

    setBusy(true)
    setMessage('')
    try {
      await resetCustomMusic()
      autoPlayRequestedRef.current = playing
      setCustomTrack(false)
      setSrc(defaultSrc)
      setMessage(COPY.musicResetSuccess)
    } catch {
      setMessage(COPY.musicError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="music-control">
      <audio
        ref={audioRef}
        src={src}
        loop
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setUnavailable(true)}
      />
      <button
        type="button"
        className={`music-toggle${playing ? ' is-playing' : ''}`}
        aria-pressed={playing}
        aria-label={playing ? COPY.musicPause : COPY.musicPlay}
        title={unavailable ? COPY.musicUnavailable : COPY.musicLabel}
        disabled={unavailable}
        onClick={() => void toggle()}
      >
        <span className="music-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{unavailable ? COPY.musicUnavailable : COPY.musicLabel}</span>
      </button>
      <button
        type="button"
        className="music-settings-button"
        aria-label={COPY.musicSettings}
        aria-haspopup="dialog"
        onClick={() => setSettingsOpen(true)}
      >
        {COPY.musicChange}
      </button>

      {settingsOpen ? (
        <Dialog
          title={COPY.musicSettings}
          onClose={() => setSettingsOpen(false)}
          className="music-settings-dialog"
        >
          <div className="music-settings">
            <p className="music-current">
              {customTrack ? COPY.musicCustomTrack : COPY.musicDefaultTrack}
            </p>
            <p className="music-format">{COPY.musicFormat}</p>
            <input
              ref={inputRef}
              className="visually-hidden"
              type="file"
              accept=".mp3,.ogg,.wav,.m4a,audio/mpeg,audio/ogg,audio/wav,audio/mp4"
              tabIndex={-1}
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <div className="music-settings-actions">
              <button
                type="button"
                className="primary-button"
                disabled={busy}
                onClick={chooseFile}
              >
                {busy ? COPY.musicUploading : COPY.musicChoose}
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={busy || !customTrack}
                onClick={() => void restoreDefault()}
              >
                {COPY.musicReset}
              </button>
            </div>
            <p className="music-message" role="status" aria-live="polite">
              {message}
            </p>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
