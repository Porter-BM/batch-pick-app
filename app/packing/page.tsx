'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SessionTimer } from '@/components/SessionTimer'
import { BarcodeScanner } from '@/components/scanner/BarcodeScanner'
import { OrderBarcode } from '@/components/barcode/OrderBarcode'

interface ToteLookupResult {
  toteNumber: number
  orderNumber: string
  orderId: string
  status: 'pending' | 'picked' | 'parked'
  parkToteNumber?: number
  lineItems: { title: string; variantTitle: string; quantity: number }[]
}

export default function PackingPage() {
  const router = useRouter()
  const [showScanner, setShowScanner] = useState(false)
  const [scanError, setScanError] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ToteLookupResult | null>(null)
  const [scannedTotes, setScannedTotes] = useState<number[]>([])

  const parseToteNumber = (barcode: string): number | null => {
    const match = barcode.match(/^TOTE-(\d+)$/i)
    if (match) return parseInt(match[1], 10)
    const num = parseInt(barcode, 10)
    return isNaN(num) ? null : num
  }

  const handleScan = async (barcode: string) => {
    setShowScanner(false)
    setScanError('')

    const toteNum = parseToteNumber(barcode)
    if (!toteNum) {
      setScanError(`Invalid tote barcode: "${barcode}". Expected format: TOTE-XXXX`)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/totes/${toteNum}`)
      const data = await res.json()

      if (!res.ok) {
        setScanError(data.error || `Tote ${toteNum} not found in this pick run`)
        setResult(null)
        return
      }

      setResult(data)
      setScannedTotes(prev => [...new Set([...prev, toteNum])])
    } catch {
      setScanError('Failed to look up tote — check connection')
    } finally {
      setLoading(false)
    }
  }

  const handleScanNext = () => {
    setResult(null)
    setScanError('')
    setShowScanner(true)
  }

  const handleNewRun = () => {
    // Clear session storage
    sessionStorage.removeItem('pickRunId')
    sessionStorage.removeItem('selectedOrders')
    sessionStorage.removeItem('toteAssignments')
    sessionStorage.removeItem('orderIds')
    sessionStorage.removeItem('parkedOrderIds')
    router.push('/orders')
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 pb-4 pt-safe flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/complete')}
            style={{ width: '48px', height: '48px', fontSize: '30px', borderRadius: '16px' }}
          >←</button>
          <h1
            className="text-2xl font-black text-white tracking-tight"
            style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', borderRadius: '16px' }}
          >
            PACKING
          </h1>
        </div>
        <SessionTimer />
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-32">
        {/* Scanned count */}
        {scannedTotes.length > 0 && (
          <div className="text-center mb-4">
            <span className="text-zinc-500 text-sm" style={{ fontSize: '14px' }}>
              {scannedTotes.length} tote{scannedTotes.length !== 1 ? 's' : ''} packed
            </span>
          </div>
        )}

        {/* Error */}
        {scanError && (
          <div className="bg-red-950 border border-red-800 rounded-2xl px-4 py-3 mb-4 text-red-400 text-sm">
            {scanError}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-amber-400 rounded-full animate-spin" />
          </div>
        )}

        {/* Result — parked order */}
        {result && result.status === 'parked' && (
          <div className="bg-amber-950 border border-amber-800 rounded-2xl p-5 mb-4">
            <p className="text-amber-400 font-black text-xl mb-2" style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', borderRadius: '16px', fontSize: '20px' }}>
              ⚠ ORDER NOT READY
            </p>
            <p className="text-amber-400 font-semibold mb-1" style={{ fontSize: '16px' }}>{result.orderNumber}</p>
            <p className="text-amber-500/70 text-sm" style={{ fontSize: '14px' }}>
              This order is parked — not ready for packing.
              {result.parkToteNumber && (
                <> Check park tote TOTE-{String(result.parkToteNumber).padStart(4,'0')}.</>
              )}
            </p>
          </div>
        )}

        {/* Result — ready to pack */}
        {result && result.status !== 'parked' && (
          <>
            {/* Order header */}
            <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1" style={{ fontSize: '12px' }}>Order</p>
                  <p className="text-2xl font-black text-white" style={{ fontSize: '24px' }}>{result.orderNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1" style={{ fontSize: '12px' }}>Tote</p>
                  <p className="font-mono font-bold text-amber-400">
                    TOTE-{String(result.toteNumber).padStart(4,'0')}
                  </p>
                </div>
              </div>

              {/* Line items */}
              <div className="border-t border-zinc-800 pt-3 space-y-2">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2" style={{ fontSize: '12px' }}>Contents</p>
                {result.lineItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0 pr-3">
                      <p className="text-white text-sm font-medium leading-tight" style={{ fontSize: '14px' }}>{item.title}</p>
                      {item.variantTitle && item.variantTitle !== 'Default Title' && (
                        <p className="text-zinc-500 text-xs" style={{ fontSize: '12px' }}>{item.variantTitle}</p>
                      )}
                    </div>
                    <span className="text-white font-bold text-lg flex-shrink-0" style={{ fontSize: '18px' }}>×{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Order barcode */}
            <div className="mb-4">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-2 text-center">
                Scan into TMS
              </p>
              <OrderBarcode orderNumber={result.orderNumber} height={80} />
            </div>
          </>
        )}

        {/* Initial state — no result yet */}
        {!result && !loading && !scanError && (
          <div className="text-center py-12">
            <p className="text-6xl mb-4">📦</p>
            <p className="text-zinc-400 text-lg font-semibold mb-2">Ready to pack</p>
            <p className="text-zinc-600 text-sm">Scan a tote barcode to begin</p>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 inset-x-0 p-4 space-y-3 bg-gradient-to-t from-zinc-950 via-zinc-950/95 to-transparent">
        {result ? (
          <button
            onClick={handleScanNext}
            className="w-full rounded-2xl font-black text-3xl active:scale-95 transition-transform"
            style={{ height: '48px', backgroundColor: '#fbbf24', color: 'black', fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '30px', borderRadius: '16px' }}
          >
            SCAN NEXT TOTE →
          </button>
        ) : (
          <button
            onClick={() => setShowScanner(true)}
            className="w-full bg-zinc-800 border-2 border-zinc-600 text-white rounded-2xl font-bold text-3xl active:scale-95 transition-transform flex items-center justify-center gap-3"
            style={{ height: '48px', fontSize: '30px', borderRadius: '16px' }}
          >
            <span className="text-3xl">📷</span> Scan Tote Barcode
          </button>
        )}

        <button
          onClick={handleNewRun}
          className="w-full text-zinc-500 text-3xl rounded-2xl active:scale-95 transition-transform"
          style={{ height: '48px', fontSize: '30px', borderRadius: '16px' }}
        >
          Start New Pick Run
        </button>
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}
