import { useMemo, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { COPY } from '../copy'

const EGG_TYPES = [
  { glyph: '♥', color: '#b4233b', kind: 'heart' },
  { glyph: '♥', color: '#d78a9f', kind: 'heart' },
  { glyph: '♥', color: '#b68742', kind: 'heart' },
  { glyph: '♥', color: '#617f72', kind: 'heart' },
  { glyph: '♥', color: '#586f91', kind: 'heart' },
  { glyph: '✿', color: '#a61f32', kind: 'rose' },
  { glyph: '❀', color: '#7d2936', kind: 'bud' },
] as const

const EGG_COUNT = 70

interface HeartDrop {
  id: number
  glyph: string
  color: string
  kind: (typeof EGG_TYPES)[number]['kind']
  left: string
  delay: string
  duration: string
  drift: string
  size: string
  turn: string
}

function createRain(): HeartDrop[] {
  return Array.from({ length: EGG_COUNT }, (_, index) => {
    const egg = EGG_TYPES[index % EGG_TYPES.length]
    const duration = 4_200 + Math.round(Math.random() * 2_800)
    return {
      id: index,
      glyph: egg.glyph,
      color: egg.color,
      kind: egg.kind,
      left: `${1 + Math.random() * 97}%`,
      delay: `${-Math.round((index / EGG_COUNT) * duration + Math.random() * 240)}ms`,
      duration: `${duration}ms`,
      drift: `${Math.round(-96 + Math.random() * 192)}px`,
      size: `${egg.kind === 'heart' ? 9 + Math.round(Math.random() * 10) : 13 + Math.round(Math.random() * 10)}px`,
      turn: `${Math.round(90 + Math.random() * 420)}deg`,
    }
  })
}

export function HeartRain() {
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState('')
  const drops = useMemo(() => (enabled ? createRain() : []), [enabled])

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    setStatus(next ? COPY.heartRainOn : COPY.heartRainOff)
  }

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={COPY.heartRain}
        className={`heart-rain-trigger${enabled ? ' is-raining' : ''}`}
        onClick={toggle}
      >
        <span className="heart-rain-glyph" aria-hidden="true">
          {EGG_TYPES.map((egg) => (
            <span key={`${egg.kind}-${egg.color}`} style={{ color: egg.color }}>
              {egg.glyph}
            </span>
          ))}
        </span>
        <span>{COPY.heartRain}</span>
        <span className="heart-rain-switch-track" aria-hidden="true">
          <span />
        </span>
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {status}
      </span>
      {enabled
        ? createPortal(
            <div className="heart-rain-layer" aria-hidden="true">
              {drops.map((drop) => (
                <span
                  key={drop.id}
                  className={`heart-rain-drop egg-${drop.kind}`}
                  style={
                    {
                      '--heart-left': drop.left,
                      '--heart-delay': drop.delay,
                      '--heart-duration': drop.duration,
                      '--heart-drift': drop.drift,
                      '--heart-size': drop.size,
                      '--heart-turn': drop.turn,
                      color: drop.color,
                    } as CSSProperties
                  }
                >
                  {drop.glyph}
                </span>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
