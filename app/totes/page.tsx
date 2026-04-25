'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SessionTimer } from '@/components/SessionTimer'
import { OrderWithStatus, ToteAssignment } from '@/types'

export default function TotesPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderWithStatus[]>([])
  const [startTote, setStartTote] = useState('')
  const [toteCount, setToteCount] = useState('')
  const [error, setError] = useState('')
  const [assignments, setAssignments] = useState<ToteAssignment[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem('selectedOrders')
    if (!stored) { router.push('/orders'); return }
    try {
      const parsed = JSON.parse(stored)
      setOrders(parsed)
      setToteCount(String(parsed.length))
    } catch {
      router.push('/orders')
    }
  }, [router])

  const validate = () => {
    const start = parseInt(startTote, 10)
    const count = parseInt(toteCount, 10)

    if (!startTote || isNaN(start) || start < 1) {
      setError('Enter a valid starting tote number')
      return false
    }
    if (count !== orders.length) {
      setError(`Tote count (${count}) must equal selected orders (${orders.length})`)
      return false
    }
    setError('')
    return true
  }

  const handlePreview = () => {
    if (!validate()) return
    const start = parseInt(startTote, 10)
    const newAssignments: ToteAssignment[] = orders.map((order, i) => ({
      toteNumber: start + i,
      orderId: order.id,
      orderNumber: order.name,
    }))
    setAssignments(newAssignments)
    setConfirmed(true)
  }

  const handleStartPick = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pick-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toteAssignments: assignments }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Store pick run data for the pick walk
      sessionStorage.setItem('pickRunId', data.pickRun.id)
      sessionStorage.setItem('toteAssignments', JSON.stringify(assignments))
      sessionStorage.setItem('orderIds', JSON.stringify(orders.map(o => o.id)))

      router.push('/pick')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start pick run')
    } finally {
      setLoading(false)
    }
  }

  if (orders.length === 0) return null

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col overflow-x-hidden">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pb-4 pt-safe flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/orders')}
            style={{ width: '48px', height: '48px', fontSize: '30px', borderRadius: '16px', color: '#d4d4d8', backgroundColor: '#27272a', border: '1px solid #3f3f46' }}
          >
            ←
          </button>
          <h1
            className="text-2xl font-black tracking-tight"
            style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '24px', color: 'white' }}
          >
            ASSIGN TOTES
          </h1>
        </div>
        <SessionTimer />
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-32">
        {!confirmed ? (
          <>
            <p className="text-zinc-400 text-sm mb-6" style={{ fontSize: '14px', color: '#a1a1aa' }}>
              {orders.length} order{orders.length !== 1 ? 's' : ''} selected. Enter tote details below.
            </p>

            {/* Inputs */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide" style={{ fontSize: '14px', color: '#a1a1aa', display: 'block', marginBottom: '8px' }}>
                  Starting Tote Number
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={startTote}
                  onChange={e => { setStartTote(e.target.value); setError('') }}
                  placeholder="e.g. 42"
                  className="w-full bg-zinc-800 border border-zinc-700 text-white font-bold rounded-2xl px-4 py-4 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                  style={{ fontSize: '28px' }}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide" style={{ fontSize: '14px', color: '#a1a1aa', display: 'block', marginBottom: '8px' }}>
                  Number of Totes
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={toteCount}
                  onChange={e => { setToteCount(e.target.value); setError('') }}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white font-bold rounded-2xl px-4 py-4 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                  style={{ fontSize: '28px' }}
                />
                {parseInt(toteCount) !== orders.length && toteCount !== '' && (
                  <p className="text-amber-500 text-xs mt-1" style={{ fontSize: '12px', color: '#f59e0b' }}>
                    Must match selected orders ({orders.length})
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-950 border border-red-800 rounded-2xl px-4 py-3 text-red-400 text-sm mb-4" style={{ fontSize: '14px', color: '#f87171' }}>
                {error}
              </div>
            )}

            <button
              onClick={handlePreview}
              className="w-full rounded-2xl font-black text-3xl active:scale-95 transition-transform"
              style={{ height: '64px', backgroundColor: '#fbbf24', color: 'black', fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '30px', borderRadius: '16px' }}
            >
              PREVIEW ASSIGNMENT
            </button>
          </>
        ) : (
          <>
            <p className="text-zinc-400 text-sm mb-4" style={{ fontSize: '14px', color: '#a1a1aa' }}>
              Confirm tote assignments before starting the pick walk.
            </p>

            {/* Assignment table */}
            <div className="w-full rounded-2xl overflow-hidden mb-6" style={{ maxWidth: '100%', border: '1px solid #27272a', backgroundColor: '#18181b' }}>
              <div className="grid grid-cols-2 px-4 py-2" style={{ backgroundColor: 'rgba(39,39,42,0.6)' }}>
                <span className="text-xs font-bold uppercase tracking-wide" style={{ fontSize: '24px', color: '#71717a' }}>Tote</span>
                <span className="text-xs font-bold uppercase tracking-wide" style={{ fontSize: '24px', color: '#71717a' }}>Order</span>
              </div>
              {assignments.map((a, i) => (
                <div
                  key={a.toteNumber}
                  style={{ borderBottom: i < assignments.length - 1 ? '1px solid rgba(39,39,42,0.6)' : 'none', padding: '12px 16px' }}
                  className="grid grid-cols-2"
                >
                  <span className="font-bold font-mono truncate pr-2" style={{ fontSize: '24px', color: '#fbbf24' }}>
                    TOTE-{String(a.toteNumber).padStart(4, '0')}
                  </span>
                  <span className="font-semibold truncate" style={{ fontSize: '24px', color: 'white' }}>{a.orderNumber}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="rounded-2xl px-4 py-3 mb-4" style={{ fontSize: '14px', color: '#f87171', backgroundColor: '#450a0a', border: '1px solid #991b1b' }}>
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmed(false)}
                className="flex-1 rounded-2xl font-bold active:scale-95 transition-transform"
                style={{ height: '64px', fontSize: '30px', borderRadius: '16px', backgroundColor: '#27272a', color: '#d4d4d8' }}
              >
                Back
              </button>
              <button
                onClick={handleStartPick}
                disabled={loading}
                className="flex-[2] rounded-2xl font-black active:scale-95 transition-transform disabled:opacity-50"
                style={{ height: '64px', backgroundColor: '#fbbf24', color: 'black', fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '30px', borderRadius: '16px' }}
              >
                {loading ? 'Starting…' : 'START PICK WALK'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
