'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SessionTimer } from '@/components/SessionTimer'
import { OrderWithStatus } from '@/types'

type Tab = 'nz' | 'international' | 'pickups'

const TABS: { id: Tab; label: string }[] = [
  { id: 'nz', label: 'Unfulfilled' },
  { id: 'international', label: 'International' },
  { id: 'pickups', label: 'Pickups' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

function itemCount(order: OrderWithStatus) {
  return order.lineItems.reduce((sum, li) => sum + li.quantity, 0)
}

export default function OrdersPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('nz')
  const [orders, setOrders] = useState<OrderWithStatus[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [maxBatch, setMaxBatch] = useState(12)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [parkedCount, setParkedCount] = useState(0)

  const fetchOrders = useCallback(async (t: Tab) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/orders?tab=${t}`)
      if (res.status === 401) { router.push('/login'); return }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOrders(data.orders)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => { if (d.settings?.max_batch_size) setMaxBatch(d.settings.max_batch_size) })
      .catch(() => {})
    // Fetch parked orders count
    fetch('/api/parked-orders')
      .then(r => r.json())
      .then(d => { if (typeof d.count === 'number') setParkedCount(d.count) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchOrders(tab)
    setSelected(new Set())
  }, [tab, fetchOrders])

  const toggleOrder = (orderId: string, status: string) => {
    if (status === 'in_progress') return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) {
        next.delete(orderId)
      } else {
        if (next.size >= maxBatch) return prev
        next.add(orderId)
      }
      return next
    })
  }

  const handleReady = () => {
    const selectedOrders = orders.filter(o => selected.has(o.id))
    sessionStorage.setItem('selectedOrders', JSON.stringify(selectedOrders))
    router.push('/totes')
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">

      {/* ── Header ── */}
      <div className="bg-zinc-900 border-zinc-800 border-b px-4 pb-3 pt-safe">
        <div className="flex items-center justify-between mb-6">
          <h1
            className="text-2xl font-black text-white tracking-tight"
            style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '24px' }}
          >
            SELECT ORDERS
          </h1>
          <div className="flex items-center gap-2">
            <SessionTimer />

            {/* Parked orders button */}
            <button
              onClick={() => router.push('/parked')}
              style={{ height: '48px', paddingLeft: '12px', paddingRight: '12px', fontSize: '16px', borderRadius: '16px', color: parkedCount > 0 ? '#fbbf24' : '#52525b', backgroundColor: parkedCount > 0 ? 'rgba(251,191,36,0.1)' : '#27272a', border: parkedCount > 0 ? '1px solid rgba(251,191,36,0.4)' : '1px solid #3f3f46', fontWeight: 'bold' }}
              className="flex items-center gap-1 active:scale-95 transition-all"
            >
              📦 Parked {parkedCount > 0 && `(${parkedCount})`}
            </button>

            {/* Settings — h-12 (48px) */}
            <button
              onClick={() => router.push('/admin')}
              style={{ height: '48px', width: '48px', fontSize: '30px', borderRadius: '16px' }}
              className="rounded-2xl text-3xl flex items-center justify-center transition-all active:scale-95 text-zinc-500 hover:bg-zinc-800"
            >
              ⚙
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{ fontSize: '20px', paddingTop: '16px', paddingBottom: '16px', borderRadius: '16px 16px 0 0',
                color: tab === t.id ? '#fbbf24' : '#71717a',
                borderBottom: tab === t.id ? '2px solid #fbbf24' : '2px solid transparent'
              }}
              className="flex-1 text-xl font-semibold transition-colors"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selection counter */}
      <div className="px-4 py-2 bg-zinc-900/50 flex items-center justify-between">
        <span className="text-lg text-zinc-400" style={{ fontSize: '18px' }}>
          <span className="font-bold" style={{ color: selected.size > 0 ? '#fbbf24' : '#a1a1aa' }}>
            {selected.size}
          </span>
          <span> / {maxBatch} selected</span>
        </span>
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Set())}
            style={{ height: '36px', fontSize: '30px', borderRadius: '16px', color: '#71717a' }}
            className="text-3xl px-3 rounded-2xl hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Order list */}
      <div className="flex-1 overflow-y-auto pb-32">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-zinc-300 border-t-amber-400 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="m-4 rounded-2xl p-4 text-sm bg-red-950 border border-red-800 text-red-400">
            {error}
            <button onClick={() => fetchOrders(tab)} className="ml-3 underline">Retry</button>
          </div>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="text-center py-20">
            <p className="text-lg text-zinc-600" style={{ fontSize: '18px' }}>No orders in this tab</p>
          </div>
        )}

        {!loading && orders.map(order => {
          const isSelected = selected.has(order.id)
          const isInProgress = order.pickStatus === 'in_progress'
          const isParked = order.pickStatus === 'parked'
          const atMax = selected.size >= maxBatch && !isSelected
          const count = itemCount(order)

          return (
            <button
              key={order.id}
              onClick={() => toggleOrder(order.id, order.pickStatus)}
              disabled={isInProgress || atMax}
              style={{
                paddingTop: '16px',
                paddingBottom: '16px',
                backgroundColor: isSelected ? 'rgba(251,191,36,0.1)' : 'transparent',
              }}
              className={`
                w-full px-3 border-b border-zinc-700 text-left transition-colors duration-100
                ${isInProgress || (atMax && !isSelected) ? 'opacity-40 cursor-not-allowed' : ''}
                ${!isSelected ? 'active:bg-zinc-800/50' : ''}
              `}
            >
              {/* Single line: checkbox | order# · date · region | badges | item count */}
              <div className="flex items-center gap-3 min-w-0">

                {/* Checkbox */}
                <div
                  className="w-7 h-7 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all"
                  style={{ borderColor: isSelected ? '#fbbf24' : '#52525b', backgroundColor: isSelected ? '#fbbf24' : 'transparent' }}
                >
                  {isSelected && <span className="text-black text-sm font-bold leading-none">✓</span>}
                </div>

                {/* Order info — order# · date · region grouped together */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-2xl text-white flex-shrink-0 font-bold" style={{ fontSize: '20px' }}>
                    {order.name}
                  </span>
                  <span className="text-2xl text-zinc-500 flex-shrink-0 px-1" style={{ fontSize: '20px' }}>·</span>
                  <span className="text-2xl text-zinc-500 flex-shrink-0" style={{ fontSize: '20px' }}>
                    {formatDate(order.createdAt)}
                  </span>
                  <span className="text-2xl text-zinc-500 flex-shrink-0 px-1" style={{ fontSize: '20px' }}>·</span>
                  <span className="text-2xl text-zinc-500 truncate min-w-0" style={{ fontSize: '20px' }}>
                    {order.shippingAddress?.province || order.shippingAddress?.country || '—'}
                  </span>
                </div>

                {/* Badges */}
                {isParked && (
                  <span className="bg-amber-500/20 text-amber-600 text-xs px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                    Parked
                  </span>
                )}
                {isInProgress && (
                  <span className="bg-blue-500/20 text-blue-500 text-xs px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                    Active
                  </span>
                )}

                {/* Item count */}
                <span className="text-2xl text-zinc-400 flex-shrink-0 text-right" style={{ fontSize: '20px' }}>
                  {count} {count === 1 ? 'item' : 'items'}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Bottom CTA */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-zinc-950 via-transparent to-transparent">
          <button
            onClick={handleReady}
            className="w-full rounded-2xl font-black text-3xl active:scale-[0.98] transition-all shadow-lg"
            style={{ height: '48px', backgroundColor: '#fbbf24', color: 'black', fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '30px', borderRadius: '16px' }}
          >
            READY TO PICK — {selected.size} ORDER{selected.size !== 1 ? 'S' : ''}
          </button>
        </div>
      )}

      {/* Refresh button */}
      {selected.size === 0 && (
        <div className="fixed bottom-6 right-4">
          <button
            onClick={() => fetchOrders(tab)}
            className="rounded-full w-12 h-12 flex items-center justify-center text-3xl active:scale-95 transition-all bg-zinc-800 text-zinc-400 shadow-lg hover:bg-zinc-700"
            style={{ fontSize: '30px', borderRadius: '16px' }}
          >
            ↻
          </button>
        </div>
      )}
    </div>
  )
}
