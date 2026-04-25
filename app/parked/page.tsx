'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SessionTimer } from '@/components/SessionTimer'

interface LineItem {
  variant_id: string
  product_title: string
  variant_title: string
  bin_location: string | null
  quantity: number
  tote_number: number
}

interface ParkedOrder {
  id: string
  shopify_order_id: string
  shopify_order_number: string
  reason: string
  parked_at: string
  park_tote_number: number | null
  tote_assigned_at: string | null
  picked_line_items: LineItem[] | null
  missing_line_items: LineItem[] | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function ParkedPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<ParkedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const fetchParked = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/parked-orders')
      if (res.status === 401) { router.push('/login'); return }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOrders(data.parkedOrders)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load parked orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchParked() }, [])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">

      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pb-4 pt-safe flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/orders')}
            style={{ width: '48px', height: '48px', fontSize: '24px', borderRadius: '16px', color: '#d4d4d8', backgroundColor: '#27272a', border: '1px solid #3f3f46' }}
            className="flex items-center justify-center active:bg-zinc-700 active:scale-95 transition-all"
          >←</button>
          <h1
            style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '24px', fontWeight: '900', color: 'white', letterSpacing: '-0.025em' }}
          >
            PARKED ORDERS
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <SessionTimer />
          <button
            onClick={fetchParked}
            style={{ width: '48px', height: '48px', fontSize: '24px', borderRadius: '16px', color: '#a1a1aa', backgroundColor: '#27272a', border: '1px solid #3f3f46' }}
            className="flex items-center justify-center active:scale-95 transition-all"
          >↻</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-zinc-600 border-t-amber-400 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl px-4 py-3 mb-4" style={{ backgroundColor: '#450a0a', border: '1px solid #991b1b', color: '#f87171', fontSize: '14px' }}>
            {error}
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="text-center py-20">
            <p style={{ fontSize: '48px', marginBottom: '12px' }}>📦</p>
            <p style={{ fontSize: '18px', color: '#52525b' }}>No parked orders</p>
          </div>
        )}

        {!loading && orders.map(order => {
          const isExpanded = expanded.has(order.id)
          const missingCount = (order.missing_line_items ?? []).reduce((s, i) => s + i.quantity, 0)
          const pickedCount = (order.picked_line_items ?? []).reduce((s, i) => s + i.quantity, 0)

          return (
            <div key={order.id} className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>

              {/* Order header row — tap to expand */}
              <button
                onClick={() => toggleExpand(order.id)}
                className="w-full text-left px-4 py-4 active:bg-zinc-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span style={{ fontSize: '20px', fontWeight: 'bold', color: 'white' }}>
                        {order.shopify_order_number}
                      </span>
                      {order.park_tote_number ? (
                        <span style={{ fontSize: '13px', color: '#fbbf24', fontWeight: '600', fontFamily: 'monospace', backgroundColor: 'rgba(251,191,36,0.1)', padding: '2px 8px', borderRadius: '8px' }}>
                          TOTE-{String(order.park_tote_number).padStart(4,'0')}
                        </span>
                      ) : (
                        <span style={{ fontSize: '13px', color: '#d97706', fontWeight: '600', backgroundColor: 'rgba(217,119,6,0.1)', padding: '2px 8px', borderRadius: '8px' }}>
                          No tote assigned
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '13px', color: '#71717a' }}>{formatDate(order.parked_at)}</p>
                    <p style={{ fontSize: '13px', color: '#a1a1aa', marginTop: '2px' }}>
                      Reason: {order.reason}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span style={{ fontSize: '12px', color: '#4ade80', fontWeight: '600' }}>
                      ✓ {pickedCount} picked
                    </span>
                    <span style={{ fontSize: '12px', color: '#f87171', fontWeight: '600' }}>
                      ✗ {missingCount} missing
                    </span>
                    <span style={{ fontSize: '20px', color: '#52525b', marginTop: '4px' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #27272a' }}>

                  {/* Picked items */}
                  {(order.picked_line_items ?? []).length > 0 && (
                    <div style={{ borderBottom: '1px solid #27272a' }}>
                      <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 16px 4px' }}>
                        In Tote — Picked
                      </p>
                      {(order.picked_line_items ?? []).map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2">
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: '14px', color: '#d4d4d8', fontWeight: '500' }}>{item.product_title}</p>
                            {item.variant_title && item.variant_title !== 'Default Title' && (
                              <p style={{ fontSize: '12px', color: '#71717a' }}>{item.variant_title}</p>
                            )}
                            {item.bin_location && (
                              <p style={{ fontSize: '12px', color: '#71717a', fontFamily: 'monospace' }}>{item.bin_location}</p>
                            )}
                          </div>
                          <span style={{ fontSize: '16px', color: '#4ade80', fontWeight: 'bold', marginLeft: '12px' }}>×{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Missing items */}
                  {(order.missing_line_items ?? []).length > 0 && (
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 'bold', color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 16px 4px' }}>
                        Still Missing — To Find
                      </p>
                      {(order.missing_line_items ?? []).map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2">
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: '14px', color: '#fca5a5', fontWeight: '500' }}>{item.product_title}</p>
                            {item.variant_title && item.variant_title !== 'Default Title' && (
                              <p style={{ fontSize: '12px', color: '#71717a' }}>{item.variant_title}</p>
                            )}
                            {item.bin_location && (
                              <p style={{ fontSize: '12px', color: '#71717a', fontFamily: 'monospace' }}>{item.bin_location}</p>
                            )}
                          </div>
                          <span style={{ fontSize: '16px', color: '#f87171', fontWeight: 'bold', marginLeft: '12px' }}>×{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No line item data yet */}
                  {!(order.picked_line_items ?? []).length && !(order.missing_line_items ?? []).length && (
                    <p style={{ fontSize: '14px', color: '#52525b', padding: '12px 16px' }}>
                      Line item detail not available for this order.
                    </p>
                  )}

                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
