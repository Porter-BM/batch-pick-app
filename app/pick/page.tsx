'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { SessionTimer } from '@/components/SessionTimer'
import { BarcodeScanner } from '@/components/scanner/BarcodeScanner'
import { AdminOverrideModal } from '@/components/ui/AdminOverrideModal'
import { BinStop, ToteAssignment } from '@/types'

type ScanState = 'idle' | 'scanning' | 'success' | 'error' | 'no_barcode'

export default function PickPage() {
  const router = useRouter()
  const [pickRunId, setPickRunId] = useState<string>('')
  const [binStops, setBinStops] = useState<BinStop[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [toteAssignments, setToteAssignments] = useState<ToteAssignment[]>([])
  const [partialOrderIds, setPartialOrderIds] = useState<Set<string>>(new Set())
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanError, setScanError] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [showOverride, setShowOverride] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Animation state
  const [animating, setAnimating] = useState(false)
  const [slideOut, setSlideOut] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const runId = sessionStorage.getItem('pickRunId')
    const storedTotes = sessionStorage.getItem('toteAssignments')
    const orderIds = sessionStorage.getItem('orderIds')

    if (!runId || !storedTotes || !orderIds) {
      router.push('/orders')
      return
    }

    setPickRunId(runId)
    setToteAssignments(JSON.parse(storedTotes))

    fetch(`/api/pick-runs/${runId}`)
      .then(r => r.json())
      .then(async data => {
        if (data.pickRun) {
          setCurrentIndex(data.pickRun.current_bin_index)
          const partial = (data.orders || [])
            .filter((o: { is_partially_picked: boolean }) => o.is_partially_picked)
            .map((o: { shopify_order_id: string }) => o.shopify_order_id)
          setPartialOrderIds(new Set(partial))
        }

        const lineRes = await fetch('/api/orders/line-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderIds: JSON.parse(orderIds),
            toteAssignments: JSON.parse(storedTotes),
          }),
        })
        const lineData = await lineRes.json()
        if (!lineRes.ok) throw new Error(lineData.error)

        const confirmed = new Set(
          (data.confirmations || []).map(
            (c: { variant_id: string; bin_location: string | null }) =>
              `${c.variant_id}::${c.bin_location ?? '__no_bin__'}`
          )
        )

        const stops: BinStop[] = lineData.binStops.map((stop: BinStop) => ({
          ...stop,
          confirmed: confirmed.has(`${stop.variantId}::${stop.binLocation ?? '__no_bin__'}`),
          missingTotes: [],
        }))

        setBinStops(stops)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message || 'Failed to load pick walk')
        setLoading(false)
      })
  }, [router])

  const currentStop = binStops[currentIndex]
  const nextStop = binStops[currentIndex + 1] ?? null
  const totalStops = binStops.length
  const isNoBin = !currentStop?.binLocation
  const isLastStop = currentIndex >= totalStops - 1

  const getAffectedOrderIds = useCallback(() => {
    if (!currentStop) return []
    return toteAssignments
      .filter(t => currentStop.toteBreakdown.some(tb => tb.toteNumber === t.toteNumber))
      .map(t => t.orderId)
  }, [currentStop, toteAssignments])

  const advanceToNext = useCallback((newIndex: number, newPartialIds?: Set<string>) => {
    setSlideOut(true)
    setAnimating(true)
    setTimeout(() => {
      setCurrentIndex(newIndex)
      setScanState('idle')
      setScanError('')
      setSlideOut(false)
      setAnimating(false)
      if (contentRef.current) contentRef.current.scrollTop = 0
      if (newPartialIds) setPartialOrderIds(newPartialIds)
    }, 320)
  }, [])

  const confirmStop = async (method: 'scan' | 'manual') => {
    if (!currentStop || saving) return
    setSaving(true)
    try {
      const newIndex = currentIndex + 1
      const affectedOrderIds = getAffectedOrderIds()
      for (const orderId of affectedOrderIds) {
        const tote = toteAssignments.find(t => t.orderId === orderId)
        const qty = currentStop.toteBreakdown.find(tb => tb.toteNumber === tote?.toteNumber)?.quantity ?? 0
        await fetch(`/api/pick-runs/${pickRunId}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopify_order_id: orderId,
            variant_id: currentStop.variantId,
            bin_location: currentStop.binLocation,
            quantity_confirmed: qty,
            method,
            new_bin_index: newIndex,
          }),
        })
      }
      setBinStops(prev => prev.map((s, i) => i === currentIndex ? { ...s, confirmed: true } : s))
      if (isLastStop) {
        await fetch(`/api/pick-runs/${pickRunId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ current_bin_index: newIndex }),
        })
        sessionStorage.setItem('partialOrderIds', JSON.stringify([...partialOrderIds]))
        router.push('/complete')
      } else {
        advanceToNext(newIndex)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save confirmation')
    } finally {
      setSaving(false)
    }
  }

  const handleScan = (barcode: string) => {
    setShowScanner(false)
    if (!currentStop) return
    if (!currentStop.barcode) { setScanState('no_barcode'); return }
    if (barcode.trim() === currentStop.barcode.trim()) {
      setScanState('success')
    } else {
      setScanState('error')
      setScanError(`Scanned: ${barcode}`)
    }
  }

  const handleOverrideSuccess = async (reason: string, missingToteNumbers: number[]) => {
    setShowOverride(false)
    if (!currentStop || saving) return
    setSaving(true)
    try {
      const newIndex = currentIndex + 1

      await fetch(`/api/pick-runs/${pickRunId}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missing_tote_numbers: missingToteNumbers,
          all_tote_breakdown: currentStop.toteBreakdown,
          variant_id: currentStop.variantId,
          bin_location: currentStop.binLocation,
          reason,
          new_bin_index: newIndex,
          tote_assignments: toteAssignments,
        }),
      })

      // Mark affected orders as partial in local state
      const newPartialIds = new Set(partialOrderIds)
      missingToteNumbers.forEach(tn => {
        const assignment = toteAssignments.find(t => t.toteNumber === tn)
        if (assignment) newPartialIds.add(assignment.orderId)
      })

      // Mark stop with missing totes — order stays in walk (not skipped)
      setBinStops(prev => prev.map((s, i) =>
        i === currentIndex
          ? { ...s, missingTotes: missingToteNumbers, confirmed: true }
          : s
      ))

      if (isLastStop) {
        sessionStorage.setItem('partialOrderIds', JSON.stringify([...newPartialIds]))
        router.push('/complete')
      } else {
        advanceToNext(newIndex, newPartialIds)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to record missing items')
    } finally {
      setSaving(false)
    }
  }

  const goToPrev = () => {
    if (currentIndex > 0 && !animating) {
      setCurrentIndex(i => i - 1)
      setScanState('idle')
      setScanError('')
      if (contentRef.current) contentRef.current.scrollTop = 0
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-zinc-700 border-t-amber-400 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-400 text-lg">Loading pick walk…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-4">{error}</p>
          <button onClick={() => router.push('/orders')} className="text-zinc-400 underline text-base">
            Back to orders
          </button>
        </div>
      </div>
    )
  }

  if (!currentStop) return null

  const confirmedCount = binStops.filter(s => s.confirmed).length

  return (
    <div className="h-screen bg-zinc-950 flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-none bg-zinc-900 border-b border-zinc-800 px-4 pb-4 pt-safe">
        <div className="flex items-center justify-between mb-1">
          <p
            className="text-2xl font-black text-white tracking-tight"
            style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '24px' }}
          >
            PICK WALK
          </p>
          <div className="flex items-center gap-2">
            <SessionTimer />
            <button
              onClick={() => router.push('/admin')}
              style={{ height: '48px', width: '48px', fontSize: '24px', borderRadius: '16px' }}
              className="flex items-center justify-center bg-zinc-800 border border-zinc-700 text-zinc-400 active:bg-zinc-700 active:scale-95 transition-all"
            >
              ⚙
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold text-white" style={{ fontSize: '16px' }}>
            Stop {currentIndex + 1} of {totalStops}
          </p>
          <p className="text-base text-white" style={{ fontSize: '16px' }}>
            {confirmedCount} / {totalStops} confirmed
          </p>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="flex-none h-1.5 bg-zinc-800">
        <div
          className="h-full bg-amber-400 transition-all duration-300"
          style={{ width: `${(confirmedCount / Math.max(totalStops, 1)) * 100}%` }}
        />
      </div>

      {/* ── Scrollable content ── */}
      <div ref={contentRef} className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ════════════════════════════════════════
            CURRENT STOP TILE — fully expanded
        ════════════════════════════════════════ */}
        <div
          className={`transition-all duration-300 ease-in-out ${
            slideOut
              ? 'opacity-0 -translate-y-8 scale-95'
              : 'opacity-100 translate-y-0 scale-100'
          }`}
        >
          {/* Warnings */}
          {isNoBin && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4 mb-4 flex items-center gap-3">
              <span className="text-amber-400 text-2xl">⚠</span>
              <p className="text-amber-400 text-lg font-bold">No bin assigned — check with supervisor</p>
            </div>
          )}
          

          {/* Bin location */}
          <div
            className="rounded-2xl text-center mb-4"
            style={{
              backgroundColor: isNoBin ? 'rgba(39,39,42,0.5)' : '#27272a',
              border: isNoBin ? '2px dashed #3f3f46' : '2px solid #52525b',
              padding: '0',
              borderRadius: '16px'
            }}
          >
            <p className="text-sm uppercase tracking-widest font-bold" style={{ fontSize: '14px', margin: '0', padding: '6px 0 0 0', color: '#71717a' }}>
              Current Bin
            </p>
            <p
              style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '60px', lineHeight: '1', color: '#fbbf24', fontWeight: '900', letterSpacing: '-0.025em', margin: '0', padding: '0 0 6px 0' }}
            >
              {currentStop.binLocation ?? '— —'}
            </p>
          </div>

          {/* Product card */}
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden mb-4">
            <div className="px-5 border-b border-zinc-800" style={{ paddingTop: '4px', paddingBottom: '4px' }}>
              <p className="text-white font-bold text-xl leading-snug mb-1" style={{ fontSize: '20px' }}>
                {currentStop.productTitle}
              </p>
              {currentStop.variantTitle && currentStop.variantTitle !== 'Default Title' && (
                <p className="text-zinc-400 text-lg" style={{ fontSize: '18px', paddingBottom: '4px' }}>{currentStop.variantTitle}</p>
              )}
            </div>
            <div className="px-5 py-5 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-zinc-400 text-lg font-semibold" style={{ fontSize: '24px' }}>Total to pick</span>
              <span className="text-5xl font-black text-white" style={{ fontSize: '48px', paddingRight: '20px' }}>{currentStop.totalQuantity}</span>
            </div>
            {currentStop.toteBreakdown.length > 0 && (
              <div className="divide-y divide-zinc-800">
                {currentStop.toteBreakdown.map(tb => (
                  <div key={tb.toteNumber} className="flex items-center justify-between px-5 py-4">
                    <span className="text-zinc-300 text-base font-mono font-semibold" style={{ fontSize: '24px' }}>
                      TOTE-{String(tb.toteNumber).padStart(4, '0')}
                    </span>
                    <span className="text-white font-black text-3xl" style={{ fontSize: '30px', paddingRight: '20px' }}>
                      {tb.quantity}{' '}
                      <span className="text-zinc-500 text-base font-normal" style={{ fontSize: '16px', paddingLeft: '20px' }}>
                        {tb.quantity === 1 ? 'item' : 'items'}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scan feedback */}
          {scanState === 'success' && (
            <div className="bg-green-950 border border-green-700 rounded-2xl px-5 py-4 mb-4 flex items-center gap-4">
              <span className="text-green-400 text-3xl">✓</span>
              <p className="text-green-400 font-bold text-xl" style={{ fontSize: '20px' }}>Barcode matched!</p>
            </div>
          )}
          {scanState === 'error' && (
            <div className="bg-red-950 border border-red-800 rounded-2xl px-5 py-4 mb-4">
              <p className="text-red-400 font-bold text-xl mb-2" style={{ fontSize: '20px' }}>Wrong product scanned</p>
              <p className="text-red-400/70 text-base mb-1" style={{ fontSize: '16px' }}>{scanError}</p>
              <p className="text-red-300 text-base" style={{ fontSize: '16px' }}>Please rescan the correct product</p>
            </div>
          )}
          {scanState === 'no_barcode' && (
            <div className="bg-amber-950 border border-amber-800 rounded-2xl px-5 py-4 mb-4">
              <p className="text-amber-400 font-bold text-xl mb-2" style={{ fontSize: '20px' }}>⚠ No barcode on file</p>
              <p className="text-amber-300 text-base leading-relaxed" style={{ fontSize: '16px' }}>
                Visually confirm <strong>{currentStop.productTitle}</strong>
                {currentStop.variantTitle && currentStop.variantTitle !== 'Default Title'
                  ? ` — ${currentStop.variantTitle}` : ''} and tap confirm below.
              </p>
            </div>
          )}
          {currentStop.confirmed && (
            <div
              className="rounded-2xl px-5 py-4 mb-4"
              style={{
                backgroundColor: (currentStop.missingTotes?.length ?? 0) > 0 ? 'rgba(245,158,11,0.1)' : '#052e16',
                border: (currentStop.missingTotes?.length ?? 0) > 0 ? '1px solid #92400e' : '1px solid #15803d'
              }}
            >
              {(currentStop.missingTotes?.length ?? 0) > 0 ? (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <span style={{ fontSize: '20px' }}>⚠</span>
                    <p style={{ fontSize: '16px', color: '#fbbf24', fontWeight: 'bold' }}>Missing items recorded</p>
                  </div>
                  <p style={{ fontSize: '14px', color: '#d97706' }}>
                    {currentStop.missingTotes!.map(tn => `TOTE-${String(tn).padStart(4, '0')}`).join(', ')} — will be parked at end of walk
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: '24px', color: '#4ade80' }}>✓</span>
                  <p style={{ fontSize: '18px', color: '#4ade80', fontWeight: 'bold' }}>Confirmed</p>
                </div>
              )}
            </div>
          )}

          {/* Action buttons — embedded in content, not fixed */}
          <div className="space-y-3 mb-2">
            {!currentStop.confirmed && (
              <>
                {!currentStop.barcode && (
                  <div className="bg-amber-950/60 border border-amber-800/60 rounded-2xl px-5 py-3 text-center">
                    <p className="text-amber-400 text-base font-semibold">⚠ No barcode — visual confirm required</p>
                  </div>
                )}
                {currentStop.barcode && (scanState === 'idle' || scanState === 'error') && (
                  <button
                    onClick={() => { setScanState('idle'); setShowScanner(true) }}
                    className="w-full rounded-2xl font-bold active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                    style={{ height: '48px', fontSize: '30px', borderRadius: '16px', backgroundColor: '#fbbf24', color: 'black' }}
                  >
                    <span style={{ fontSize: '30px' }}>📷</span> Scan Product
                  </button>
                )}
                {(scanState === 'success' || !currentStop.barcode) && (
                  <button
                    onClick={() => confirmStop(currentStop.barcode ? 'scan' : 'manual')}
                    disabled={saving || animating}
                    className="w-full rounded-2xl font-black active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
                    style={{ height: '48px', backgroundColor: '#fbbf24', color: 'black', fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '30px', borderRadius: '16px' }}
                  >
                    {saving ? 'Saving…' : isLastStop ? 'CONFIRM & FINISH' : 'CONFIRM & NEXT →'}
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={goToPrev}
                    disabled={currentIndex === 0 || animating}
                    style={{ height: '48px', fontSize: '24px', borderRadius: '16px', width: '23%', backgroundColor: '#27272a', color: '#d4d4d8', border: '1px solid #3f3f46' }}
                    className="font-bold disabled:opacity-30 active:scale-95 transition-all"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setShowOverride(true)}
                    style={{ height: '48px', fontSize: '24px', borderRadius: '16px', width: '75%', color: '#d4d4d8', backgroundColor: 'transparent', border: '1px solid #3f3f46' }}
                  >
                    Can&apos;t Pick — Park Order/s
                  </button>
                </div>
              </>
            )}
            {currentStop.confirmed && (
              <button
                onClick={() => {
                  if (isLastStop) {
                    sessionStorage.setItem('partialOrderIds', JSON.stringify([...partialOrderIds]))
                    router.push('/complete')
                  } else {
                    advanceToNext(currentIndex + 1)
                  }
                }}
                disabled={animating}
                className="w-full rounded-2xl font-black text-3xl active:scale-[0.98] transition-all shadow-lg disabled:opacity-50"
                style={{ height: '48px', backgroundColor: '#fbbf24', color: 'black', fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '30px', borderRadius: '16px' }}
              >
                {isLastStop ? 'VIEW SUMMARY →' : 'NEXT STOP →'}
              </button>
            )}

            {/* Counter */}
            <div className="flex justify-center pt-1">
              <span className="text-zinc-500 text-sm" style={{ fontSize: '14px' }}>
                {confirmedCount} / {totalStops} confirmed
              </span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════
            NEXT STOP PREVIEW TILE — dimmed, no interaction
        ════════════════════════════════════════ */}
        {nextStop && !isLastStop && (
          <div
            className={`transition-all duration-300 ease-in-out ${
              slideOut
                ? 'opacity-60 translate-y-0'
                : 'opacity-40'
            }`}
          >
            {/* Next bin location */}
            <div className="rounded-2xl text-center" style={{ backgroundColor: '#18181b', border: '1px solid #27272a', padding: '0', borderRadius: '16px' }}>
              <p className="text-xs text-zinc-600 uppercase tracking-widest font-bold" style={{ fontSize: '12px', padding: '6px 0 0 0', margin: '0', color: '#52525b' }}>
                Next Bin
              </p>
              <p
                className="text-4xl font-black tracking-tight"
                style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '36px', lineHeight: '1', color: '#a1a1aa', padding: '0 0 6px 0', margin: '0' }}
              >
                {nextStop.binLocation ?? '— —'}
              </p>
            </div>
          </div>
        )}

        {/* Last stop indicator */}
        {isLastStop && (
          <div className="flex items-center gap-3 px-1 opacity-40">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-zinc-600 text-xs font-bold uppercase tracking-widest" style={{ fontSize: '12px' }}>
              Last stop
            </span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>
        )}

        {/* Bottom breathing room */}
        <div className="h-8" />
      </div>

      {/* Scanner overlay */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
          expectedBarcode={currentStop.barcode}
        />
      )}

      {/* Admin override modal */}
      {showOverride && (
        <AdminOverrideModal
          toteBreakdown={currentStop?.toteBreakdown ?? []}
          onSuccess={handleOverrideSuccess}
          onCancel={() => setShowOverride(false)}
        />
      )}
    </div>
  )
}
