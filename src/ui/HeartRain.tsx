import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { COPY } from '../copy'

const HEART_COUNT = 34
const BURST_MS = 5_200

interface HeartDrop {
  id: number
  left: string
  delay: string
  duration: string
  drift: string
  size: string
  turn: string
}

interface HeartBurst {
  id: number
  drops: HeartDrop[]
}

function createBurst(id: number): HeartBurst {
  return {
    id,
    drops: Array.from({ length: HEART_COUNT }, (_, index) => ({
      id: index,
      left: `${2 + Math.random() * 96}%`,
      delay: `${Math.round(Math.random() * 900)}ms`,
      duration: `${2_400 + Math.round(Math.random() * 1_600)}ms`,
      drift: `${Math.round(-72 + Math.random() * 144)}px`,
      size: `${8 + Math.round(Math.random() * 11)}px`,
      turn: `${Math.round(90 + Math.random() * 360)}deg`,
    })),
  }
}

export function HeartRain() {
  const [burst, setBurst] = useState<HeartBurst | null>(null)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const trigger = () => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
    setBurst(createBurst(Date.now()))
    timerRef.current = window.setTimeout(() => {
      setBurst(null)
      timerRef.current = undefined
    }, BURST_MS)
  }

  return (
    <>
      <button
        type="button"
        className={`heart-rain-trigger${burst ? ' is-raining' : ''}`}
        onClick={trigger}
      >
        <span className="heart-rain-glyph" aria-hidden="true">
          ♥
        </span>
        <span>{COPY.heartRain}</span>
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {burst ? COPY.heartRainStatus : ''}
      </span>
      {burst ? (
        <div key={burst.id} className="heart-rain-layer" aria-hidden="true">
          {burst.drops.map((drop) => (
            <span
              key={drop.id}
              className="heart-rain-drop"
              style={
                {
                  '--heart-left': drop.left,
                  '--heart-delay': drop.delay,
                  '--heart-duration': drop.duration,
                  '--heart-drift': drop.drift,
                  '--heart-size': drop.size,
                  '--heart-turn': drop.turn,
                } as CSSProperties
              }
            >
              ♥
            </span>
          ))}
        </div>
      ) : null}
    </>
  )
}
