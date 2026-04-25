'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const IDLE_MS = 5 * 60 * 1000
const WARN_MS = 4 * 60 * 1000

interface SessionContextType {
  remainingMs: number
  showWarning: boolean
  resetTimer: () => void
  role: string | null
  sessionId: string | null
}

const SessionContext = createContext<SessionContextType>({
  remainingMs: IDLE_MS,
  showWarning: false,
  resetTimer: () => {},
  role: null,
  sessionId: null,
})

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [remainingMs, setRemainingMs] = useState(IDLE_MS)
  const [showWarning, setShowWarning] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const lastActivityRef = useRef(Date.now())
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const resetTimer = useCallback(async () => {
    lastActivityRef.current = Date.now()
    setShowWarning(false)
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setRemainingMs(data.remaining_ms ?? IDLE_MS)
        setRole(data.role)
        setSessionId(data.session_id)
      } else {
        router.push('/login')
      }
    } catch {
      // Network error — don't log out, just continue
    }
  }, [router])

  // Check session validity on mount
  useEffect(() => {
    fetch('/api/auth/refresh')
      .then((r) => r.json())
      .then((data) => {
        if (!data.valid) {
          router.push('/login')
        } else {
          setRole(data.role)
          setSessionId(data.session_id)
          setRemainingMs(data.remaining_ms ?? IDLE_MS)
        }
      })
      .catch(() => router.push('/login'))
  }, [router])

  // Countdown ticker
  useEffect(() => {
    timerRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current
      const remaining = Math.max(0, IDLE_MS - idle)
      setRemainingMs(remaining)

      if (remaining <= 0) {
        router.push('/login?reason=timeout')
      } else if (remaining <= IDLE_MS - WARN_MS) {
        setShowWarning(true)
      }
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [router])

  // Reset on user activity
  useEffect(() => {
    const events = ['touchstart', 'touchend', 'mousedown', 'keydown']
    const handler = () => {
      lastActivityRef.current = Date.now()
      setShowWarning(false)
    }
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }))
    return () => events.forEach((e) => window.removeEventListener(e, handler))
  }, [])

  return (
    <SessionContext.Provider value={{ remainingMs, showWarning, resetTimer, role, sessionId }}>
      {children}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
          <div className="bg-amber-500 text-black rounded-2xl p-5 w-full max-w-sm shadow-2xl pointer-events-auto">
            <p className="font-bold text-lg mb-1">Still picking?</p>
            <p className="text-sm mb-4 opacity-80">
              Session will expire in {Math.ceil(remainingMs / 1000)}s
            </p>
            <button
              onClick={resetTimer}
              className="w-full bg-black text-white rounded-xl py-3 font-bold text-base active:scale-95 transition-transform"
            >
              Yes, keep going
            </button>
          </div>
        </div>
      )}
    </SessionContext.Provider>
  )
}

export const useSession = () => useContext(SessionContext)
