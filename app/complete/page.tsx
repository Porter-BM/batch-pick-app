'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SessionTimer } from '@/components/SessionTimer'
import { BarcodeScanner } from '@/components/scanner/BarcodeScanner'
import { ToteAssignment } from '@/types'

interface PartialOrderInfo {
  orderId: string
  orderNumber: string
  toteNumber: number
  reason: string
  pickedLineItems: object[]
  missingLineItems: object[]
}

export default function CompletePage() {
  const router = useRouter()
  const [pickRunId, setPickRunId] = useState('')
  const [toteAssignments, setToteAssignments] = useState<ToteAssignment[]>([])
  const [partialOrders, setPartialOrders] = useState<PartialOrderInfo[]>([])
  const [parkStep, setParkStep] = useState(0)
  const [parkTotes, setParkTotes] = useState<Map<string, number>>(new Map())
  const [showScanner, setShowScanner] = useState(false)
  const [scanError, setScanError] = useState('')
  const [saving, setSaving] = useState(false)
  const [allParksAssigned, setAllParksAssigned] = useState(false)
  const [pickRunStatus, setPickRunStatus] = useState<'active' | 'completed'>('active')

  useEffect(() => {
    const runId = sessionStorage.getItem('pickRunId')
    const storedTotes = sessionStorage.getItem('toteAssignments')
    const storedPartialIds = sessionStorage.getItem('partialOrderIds')

    if (!runId || !storedTotes) { router.push('/orders'); return }

    setPickRunId(runId)
    const totes: ToteAssignment[] = JSON.parse(storedTotes)
    setToteAssignments(totes)

    const partialIds: string[] = storedPartialIds ? JSON.parse(storedPartialIds) : []

    // Fetch pick run to get partial order details and confirmations
    fetch(`/api/pick-runs/${runId}`)
      .then(r => r.json())
      .then(data => {
        const partialRunOrders = (data.orders || []).filter(
          (o: { is_partially_picked: boolean }) => o.is_partially_picked
        )

        const infos: PartialOrderInfo[] = partialRunOrders.map((o: {
          shopify_order_id: string
          shopify_order_number: string
          parked_reason: string
          picked_line_items: object[] | null
          missing_line_items: object[] | null
        }) => {
          const tote = totes.find(t => t.orderId === o.shopify_order_id)
          return {
            orderId: o.shopify_order_id,
            orderNumber: o.shopify_order_number,
            toteNumber: tote?.toteNumber ?? 0,
            reason: o.parked_reason || 'Item could not be picked',
            pickedLineItems: o.picked_line_items ?? [],
            missingLineItems: o.missing_line_items ?? [],
          }
        })

        // Also include any from sessionStorage that might not be in DB yet
        const dbIds = new Set(infos.map((i: PartialOrderInfo) => i.orderId))
        const extraPartials = partialIds
          .filter(id => !dbIds.has(id))
          .map(id => {
            const tote = totes.find(t => t.orderId === id)
            return {
              orderId: id,
              orderNumber: tote?.orderNumber ?? id,
              toteNumber: tote?.toteNumber ?? 0,
              reason: 'Item could not be picked',
              pickedLineItems: [],
              missingLineItems: [],
            }
          })

        const allPartials = [...infos, ...extraPartials]
        setPartialOrders(allPartials)
        if (allPartials.length === 0) setAllParksAssigned(true)
      })
      .catch(() => {})
  }, [router])

  const parseToteNumber = (barcode: string): number | null => {
    const match = barcode.match(/^TOTE-(\d+)$/i)
    if (match) return parseInt(match[1], 10)
    const num = parseInt(barcode, 10)
    return isNaN(num) ? null : num
  }

  const handleParkToteScan = async (barcode: string) => {
    setShowScanner(false)
    const toteNum = parseToteNumber(barcode)

    if (!toteNum) {
      setScanError(`Invalid tote barcode: "${barcode}". Expected format: TOTE-XXXX`)
      return
    }

    // Can't reuse a pick tote
    const isPickTote = toteAssignments.some(t => t.toteNumber === toteNum)
    if (isPickTote) {
      setScanError(`TOTE-${String(toteNum).padStart(4,'0')} is a pick tote — use a different tote`)
      return
    }

    // Can't reuse a tote already assigned in this session
    const alreadyUsed = [...parkTotes.values()].includes(toteNum)
    if (alreadyUsed) {
      setScanError(`TOTE-${String(toteNum).padStart(4,'0')} already assigned — use a different tote`)
      return
    }

    setScanError('')
    const currentPartial = partialOrders[parkStep]
    if (!currentPartial) return

    setSaving(true)
    try {
      const res = await fetch(`/api/pick-runs/${pickRunId}/park`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopify_order_id: currentPartial.orderId,
          shopify_order_number: currentPartial.orderNumber,
          park_tote_number: toteNum,
          reason: currentPartial.reason,
          picked_line_items: currentPartial.pickedLineItems,
          missing_line_items: currentPartial.missingLineItems,
        }),
      })
      if (!res.ok) throw new Error('Failed to park order')

      setParkTotes(prev => new Map(prev).set(currentPartial.orderId, toteNum))

      if (parkStep + 1 >= partialOrders.length) {
        setAllParksAssigned(true)
        await fetch(`/api/pick-runs/${pickRunId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        })
        setPickRunStatus('completed')
      } else {
        setParkStep(s => s + 1)
      }
    } catch {
      setScanError('Failed to save park tote — try again')
    } finally {
      setSaving(false)
    }
  }

  const handleFinishWithoutParking = async () => {
    setSaving(true)
    await fetch(`/api/pick-runs/${pickRunId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    setSaving(false)
    setPickRunStatus('completed')
    setAllParksAssigned(true)
  }

  // Split orders: fully picked vs partially picked
  const fullyPickedOrders = toteAssignments.filter(
    t => !partialOrders.some(p => p.orderId === t.orderId)
  )

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pb-4 pt-safe flex items-center justify-between">
        <h1
          style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '24px', fontWeight: '900', color: 'white', letterSpacing: '-0.025em' }}
        >
          {allParksAssigned ? 'PICK COMPLETE' : 'ASSIGN PARK TOTES'}
        </h1>
        <SessionTimer />
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-32">

        {/* ── Fully picked orders ── */}
        {fullyPickedOrders.length > 0 && (
          <>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
              Ready for Packing ({fullyPickedOrders.length})
            </p>
            <div className="rounded-2xl overflow-hidden mb-6" style={{ backgroundColor: '#18181b', border: '1px solid #27272a' }}>
              {fullyPickedOrders.map((t, i) => (
                <div
                  key={t.toteNumber}
                  className="flex items-center justify-between px-4"
                  style={{
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    borderBottom: i < fullyPickedOrders.length - 1 ? '1px solid rgba(39,39,42,0.6)' : 'none'
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: '14px', color: '#a1a1aa', fontFamily: 'monospace' }}>
                      TOTE-{String(t.toteNumber).padStart(4, '0')}
                    </span>
                    <span style={{ color: '#52525b', fontSize: '14px' }}>→</span>
                    <span style={{ fontSize: '16px', color: 'white', fontWeight: 'bold' }}>{t.orderNumber}</span>
                  </div>
                  <span style={{ fontSize: '14px', color: '#4ade80', fontWeight: '600' }}>✓ Picked</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Partially picked orders ── */}
        {partialOrders.length > 0 && (
          <>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
              Partially Picked — Park Required ({partialOrders.length})
            </p>
            <div className="rounded-2xl overflow-hidden mb-6" style={{ backgroundColor: '#18181b', border: '1px solid #92400e' }}>
              {partialOrders.map((p, i) => {
                const assignedParkTote = parkTotes.get(p.orderId)
                return (
                  <div
                    key={p.orderId}
                    className="flex items-center justify-between px-4"
                    style={{
                      paddingTop: '12px',
                      paddingBottom: '12px',
                      borderBottom: i < partialOrders.length - 1 ? '1px solid rgba(146,64,14,0.3)' : 'none'
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: '14px', color: '#a1a1aa', fontFamily: 'monospace' }}>
                        TOTE-{String(p.toteNumber).padStart(4, '0')}
                      </span>
                      <span style={{ color: '#52525b', fontSize: '14px' }}>→</span>
                      <span style={{ fontSize: '16px', color: 'white', fontWeight: 'bold' }}>{p.orderNumber}</span>
                    </div>
                    {assignedParkTote ? (
                      <span style={{ fontSize: '14px', color: '#fbbf24', fontWeight: '600' }}>
                        → TOTE-{String(assignedParkTote).padStart(4,'0')}
                      </span>
                    ) : (
                      <span style={{ fontSize: '14px', color: '#d97706', fontWeight: '600' }}>⚠ Needs park tote</span>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Park tote assignment ── */}
        {!allParksAssigned && partialOrders.length > 0 && (
          <>
            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <p style={{ fontSize: '16px', color: '#fbbf24', fontWeight: 'bold', marginBottom: '4px' }}>
                Park Tote Required ({parkStep + 1} of {partialOrders.length})
              </p>
              <p style={{ fontSize: '14px', color: '#fcd34d', marginBottom: '4px' }}>
                Order <strong>{partialOrders[parkStep]?.orderNumber}</strong> has missing items.
              </p>
              <p style={{ fontSize: '12px', color: '#d97706', marginBottom: '12px' }}>
                Reason: {partialOrders[parkStep]?.reason}
              </p>
              <p style={{ fontSize: '14px', color: 'white' }}>
                Transfer items from{' '}
                <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#fbbf24' }}>
                  TOTE-{String(partialOrders[parkStep]?.toteNumber).padStart(4,'0')}
                </span>{' '}
                into a park tote, then scan the park tote barcode.
              </p>
            </div>

            {scanError && (
              <div className="rounded-2xl px-4 py-3 mb-4" style={{ backgroundColor: '#450a0a', border: '1px solid #991b1b', color: '#f87171', fontSize: '14px' }}>
                {scanError}
              </div>
            )}

            <button
              onClick={() => { setScanError(''); setShowScanner(true) }}
              disabled={saving}
              className="w-full rounded-2xl font-bold active:scale-95 transition-transform flex items-center justify-center gap-3 mb-3"
              style={{ height: '48px', fontSize: '24px', borderRadius: '16px', backgroundColor: '#27272a', color: 'white', border: '2px solid #52525b' }}
            >
              📷 Scan Park Tote Barcode
            </button>
          </>
        )}

        {/* ── Complete banner ── */}
        {allParksAssigned && pickRunStatus === 'completed' && (
          <div className="rounded-2xl p-4 mb-6" style={{ backgroundColor: '#052e16', border: '1px solid #15803d' }}>
            <p style={{ fontSize: '16px', color: '#4ade80', fontWeight: 'bold', marginBottom: '4px' }}>Pick run complete!</p>
            <p style={{ fontSize: '14px', color: '#16a34a' }}>
              {fullyPickedOrders.length} order{fullyPickedOrders.length !== 1 ? 's' : ''} ready for packing
              {partialOrders.length > 0 && `, ${partialOrders.length} parked for later`}.
            </p>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="fixed bottom-0 inset-x-0 p-4" style={{ background: 'linear-gradient(to top, #09090b, transparent)' }}>
        {allParksAssigned && fullyPickedOrders.length > 0 ? (
          <button
            onClick={() => router.push('/packing')}
            className="w-full rounded-2xl font-black active:scale-95 transition-transform shadow-lg"
            style={{ height: '48px', backgroundColor: '#fbbf24', color: 'black', fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '30px', borderRadius: '16px' }}
          >
            PROCEED TO PACKING →
          </button>
        ) : allParksAssigned && fullyPickedOrders.length === 0 ? (
          // All orders were partial — nothing to pack, go back to orders
          <button
            onClick={() => {
              sessionStorage.removeItem('pickRunId')
              sessionStorage.removeItem('toteAssignments')
              sessionStorage.removeItem('orderIds')
              sessionStorage.removeItem('partialOrderIds')
              router.push('/orders')
            }}
            className="w-full rounded-2xl font-black active:scale-95 transition-transform"
            style={{ height: '48px', backgroundColor: '#27272a', color: '#d4d4d8', fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '24px', borderRadius: '16px', border: '1px solid #3f3f46' }}
          >
            BACK TO ORDERS
          </button>
        ) : partialOrders.length === 0 ? (
          <button
            onClick={handleFinishWithoutParking}
            disabled={saving}
            className="w-full rounded-2xl font-black active:scale-95 transition-transform"
            style={{ height: '48px', backgroundColor: '#fbbf24', color: 'black', fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '30px', borderRadius: '16px' }}
          >
            {saving ? 'Saving…' : 'PROCEED TO PACKING →'}
          </button>
        ) : null}
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={handleParkToteScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}
