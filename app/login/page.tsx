'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)
  const timedOut = searchParams.get('reason') === 'timeout'

  useEffect(() => {
    fetch('/api/auth/refresh')
      .then((r) => r.json())
      .then((d) => { if (d.valid) router.push('/orders') })
      .catch(() => {})
  }, [router])

  const handleKey = (key: string) => {
    if (key === '⌫') { setPin((p) => p.slice(0, -1)); setError(''); return }
    if (!key || pin.length >= 8) return
    const next = pin + key
    setPin(next)
    setError('')
    if (next.length >= 4) setTimeout(() => attemptLogin(next), 150)
  }

  const attemptLogin = async (code: string) => {
    if (code.length < 4) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      })
      const data = await res.json()
      if (res.ok) {
        // Check for active pick run belonging to this user
        const resumeRes = await fetch('/api/pick-runs')
        const resumeData = await resumeRes.json()

        if (resumeData.pickRun && resumeData.orders?.length > 0) {
          // Restore sessionStorage for pick walk resume
          const pickRun = resumeData.pickRun
          const orders = resumeData.orders
          sessionStorage.setItem('pickRunId', pickRun.id)

          const toteAssignments = orders.map((o: {
            shopify_order_id: string
            shopify_order_number: string
            tote_number: number
          }) => ({
            orderId: o.shopify_order_id,
            orderNumber: o.shopify_order_number,
            toteNumber: o.tote_number,
          }))
          sessionStorage.setItem('toteAssignments', JSON.stringify(toteAssignments))
          sessionStorage.setItem('orderIds', JSON.stringify(orders.map((o: { shopify_order_id: string }) => o.shopify_order_id)))

          const partialIds = orders
            .filter((o: { is_partially_picked: boolean }) => o.is_partially_picked)
            .map((o: { shopify_order_id: string }) => o.shopify_order_id)
          sessionStorage.setItem('partialOrderIds', JSON.stringify(partialIds))

          // Route directly to pick walk at last confirmed stop
          router.push('/pick')
        } else {
          router.push('/orders')
        }
      } else {
        setError(data.error || 'Incorrect PIN')
        setShake(true)
        setPin('')
        setTimeout(() => setShake(false), 500)
      }
    } catch {
      setError('Connection error — try again')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  const maxDots = Math.max(4, pin.length)

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 select-none pt-safe">
      {/* Title */}
      <div className="mb-12 text-center">
        <h1
          className="text-4xl font-black tracking-tight text-white mb-1"
          style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', letterSpacing: '-0.02em' }}
        >
          BATCH PICK
        </h1>
        <p className="text-zinc-500 text-sm font-medium tracking-widest uppercase">Bear & Moo</p>
      </div>

      {/* Timeout notice */}
      {timedOut && !error && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-400 text-sm text-center">
          Session timed out — please sign in again
        </div>
      )}

      {/* PIN dot display */}
      <div
        className="flex gap-5 mb-3 h-14 items-center justify-center"
        style={shake ? { animation: 'shake 0.4s ease-in-out' } : {}}
      >
        {Array.from({ length: maxDots }).map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-150"
            style={i < pin.length
              ? { width: '28px', height: '28px', backgroundColor: '#fbbf24' }
              : { width: '20px', height: '20px', backgroundColor: '#3f3f46' }
            }
          />
        ))}
      </div>

      {/* Error */}
      <div className="h-6 mb-8">
        {error && <p className="text-red-400 text-base font-medium text-center">{error}</p>}
      </div>

      {/* Keypad — w-12 h-12 circular buttons (48px), grid width 260px */}
      <div className="grid grid-cols-3 gap-4" style={{ width: '260px' }}>
        {KEYS.map((key, i) => {
          if (!key) return <div key={i} style={{ width: '72px', height: '72px' }} />
          const isBackspace = key === '⌫'
          return (
            <button
              key={i}
              onClick={() => handleKey(key)}
              disabled={loading}
              style={{ width: '72px', height: '72px', color: isBackspace ? '#a1a1aa' : 'white', fontSize: '30px' }}
              className={`
                rounded-full
                flex items-center justify-center mx-auto
                text-3xl font-semibold
                transition-all duration-150
                active:scale-90
                ${isBackspace
                  ? 'bg-transparent hover:bg-zinc-800/60'
                  : 'bg-zinc-800 hover:shadow-[0_0_0_4px_rgba(251,191,36,0.25)] hover:bg-zinc-700 active:bg-zinc-600'
                }
                ${loading ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {key}
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="mt-10 flex items-center gap-2 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-amber-400 rounded-full animate-spin" />
          <span className="text-base">Verifying…</span>
        </div>
      )}

      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-700 border-t-amber-400 rounded-full animate-spin" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
