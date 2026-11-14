import { useEffect, useMemo, useRef, useState } from 'react'
import { COPY } from '../copy'
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

export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const src = useMemo(
    () =>
      resolveMusicUrl(
        import.meta.env.BASE_URL,
        import.meta.env.VITE_BACKGROUND_MUSIC_URL,
      ),
    [],
  )

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !savedPreference()) return

    void audio.play().catch(() => {
      // Browsers may require a fresh gesture after reopening the page.
      setPlaying(false)
    })
  }, [])

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
      try {
        localStorage.setItem(MUSIC_PREFERENCE_KEY, '0')
      } catch {
        // Playback still pauses when storage is unavailable.
      }
      return
    }

    try {
      await audio.play()
      try {
        localStorage.setItem(MUSIC_PREFERENCE_KEY, '1')
      } catch {
        // Playback remains available when preference storage is blocked.
      }
    } catch {
      setPlaying(false)
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
    </div>
  )
}
