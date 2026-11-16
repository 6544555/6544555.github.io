import { useEffect, useState } from 'react'
import { elapsedSince } from '../lib/content'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function startLabel(startAt: string): string {
  const date = new Date(startAt)
  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}.${value.month}.${value.day} ${value.hour}:${value.minute}:${value.second}`
}

export function RelationshipClock({
  startAt: configuredStartAt,
  startDate,
}: {
  startAt?: string
  startDate: string
}) {
  const startAt =
    configuredStartAt?.trim() ||
    (startDate ? `${startDate}T00:00:00+08:00` : '')
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: number | undefined

    const tick = () => {
      const current = Date.now()
      setNow(new Date(current))
      timer = window.setTimeout(tick, 1_000 - (current % 1_000) + 20)
    }

    timer = window.setTimeout(tick, 1_000 - (Date.now() % 1_000) + 20)
    return () => {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [startAt])

  const elapsed = elapsedSince(startAt, now)
  if (!elapsed) {
    return (
      <p className="opening-line relationship-clock relationship-clock-unavailable">
        相识时间待确认
      </p>
    )
  }

  const hours = pad(elapsed.hours)
  const minutes = pad(elapsed.minutes)
  const seconds = pad(elapsed.seconds)
  const label = `相识 ${elapsed.days} 天 ${hours} 小时 ${minutes} 分 ${seconds} 秒`

  return (
    <p
      className="opening-line relationship-clock"
      role="timer"
      aria-live="off"
      aria-label={label}
      data-total-seconds={elapsed.totalSeconds}
    >
      <span className="relationship-clock-label">至今</span>
      <span className="relationship-clock-days">
        <strong>{elapsed.days}</strong>
        <span>天</span>
      </span>
      <span className="relationship-clock-time" aria-hidden="true">
        <span>{hours}</span>
        <span>:</span>
        <span>{minutes}</span>
        <span>:</span>
        <span>{seconds}</span>
      </span>
      <span className="relationship-clock-start">
        自 {startLabel(startAt)} 起
      </span>
    </p>
  )
}
