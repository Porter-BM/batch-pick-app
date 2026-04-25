'use client'

import { useSession } from './SessionProvider'

const IDLE_MS = 5 * 60 * 1000

export function SessionTimer() {
  const { remainingMs } = useSession()

  const minutes = Math.floor(remainingMs / 60000)
  const seconds = Math.floor((remainingMs % 60000) / 1000)
  const pct = remainingMs / IDLE_MS

  const colour = pct > 0.4 ? 'white' : pct > 0.15 ? '#fbbf24' : '#f87171'

  // Above 1 min: show "13 min", below 1 min: show "0:43"
  const display = minutes >= 1
    ? `${minutes} min`
    : `0:${String(seconds).padStart(2, '0')}`

  return (
    <span
      className="font-mono tabular-nums font-semibold"
      style={{ fontSize: '14px', color: colour }}
    >
      {display}
    </span>
  )
}
