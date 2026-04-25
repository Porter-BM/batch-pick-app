'use client'

import { useState } from 'react'

interface ToteBreakdown {
  toteNumber: number
  quantity: number
}

interface AdminOverrideModalProps {
  toteBreakdown: ToteBreakdown[]
  onSuccess: (reason: string, missingToteNumbers: number[]) => void
  onCancel: () => void
}

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', '⌫'],
]

export function AdminOverrideModal({ toteBreakdown, onSuccess, onCancel }: AdminOverrideModalProps) {
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState('')
  const [step, setStep] = useState<'reason' | 'totes' | 'pin'>('reason')
  const [missingTotes, setMissingTotes] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const multipleTotes = toteBreakdown.length > 1

  const handleKey = (key: string) => {
    if (key === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (!key || pin.length >= 8) return
    const next = pin + key
    setPin(next)
    if (next.length >= 4) setTimeout(() => attemptVerify(next), 150)
  }

  const attemptVerify = async (code: string) => {
    if (code.length < 4) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/admin-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      })
      if (res.ok) {
        const affected = missingTotes.size > 0
          ? [...missingTotes]
          : toteBreakdown.map(t => t.toteNumber)
        onSuccess(reason || 'Item could not be picked', affected)
      } else {
        setError('Incorrect supervisor PIN')
        setPin('')
      }
    } catch {
      setError('Connection error')
      setPin('')
    } finally {
      setLoading(false)
    }
  }

  const toggleTote = (toteNumber: number) => {
    setMissingTotes(prev => {
      const next = new Set(prev)
      next.has(toteNumber) ? next.delete(toteNumber) : next.add(toteNumber)
      return next
    })
  }

  const handleNext = () => {
    if (multipleTotes) {
      setStep('totes')
    } else {
      setMissingTotes(new Set(toteBreakdown.map(t => t.toteNumber)))
      setStep('pin')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end">
      <div className="w-full bg-zinc-900 rounded-t-3xl p-6 pb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-white" style={{ fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '20px' }}>
            SUPERVISOR OVERRIDE
          </h2>
          <button onClick={onCancel} style={{ fontSize: '24px', color: '#71717a' }}>✕</button>
        </div>

        {step === 'reason' && (
          <>
            <p style={{ fontSize: '14px', color: '#a1a1aa', marginBottom: '16px' }}>
              Enter a reason for the missing item/s, then enter supervisor PIN.
            </p>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Out of stock — bin empty"
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-2xl px-4 py-3 resize-none focus:outline-none focus:border-amber-400 mb-4"
              style={{ fontSize: '16px' }}
            />
            <button
              onClick={handleNext}
              className="w-full rounded-2xl font-black active:scale-95 transition-transform"
              style={{ height: '48px', backgroundColor: '#fbbf24', color: 'black', fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '24px', borderRadius: '16px' }}
            >
              NEXT →
            </button>
          </>
        )}

        {step === 'totes' && (
          <>
            <p style={{ fontSize: '14px', color: '#a1a1aa', marginBottom: '16px' }}>
              Select which tote/s are missing this item:
            </p>
            <div className="space-y-2 mb-4">
              {toteBreakdown.map(t => {
                const isMissing = missingTotes.has(t.toteNumber)
                return (
                  <button
                    key={t.toteNumber}
                    onClick={() => toggleTote(t.toteNumber)}
                    className="w-full flex items-center justify-between px-4 transition-all active:scale-[0.98]"
                    style={{
                      height: '56px',
                      borderRadius: '16px',
                      backgroundColor: isMissing ? 'rgba(251,191,36,0.15)' : '#27272a',
                      border: isMissing ? '2px solid #fbbf24' : '1px solid #3f3f46',
                    }}
                  >
                    <span style={{ fontSize: '20px', fontWeight: 'bold', color: isMissing ? '#fbbf24' : '#d4d4d8', fontFamily: 'monospace' }}>
                      TOTE-{String(t.toteNumber).padStart(4, '0')}
                    </span>
                    <span style={{ fontSize: '16px', color: '#a1a1aa' }}>
                      {t.quantity} {t.quantity === 1 ? 'item' : 'items'}
                    </span>
                    <span style={{ fontSize: '24px', color: isMissing ? '#fbbf24' : '#52525b' }}>
                      {isMissing ? '✓' : '○'}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setStep('reason')}
                style={{ height: '48px', width: '23%', fontSize: '20px', borderRadius: '16px', backgroundColor: '#27272a', color: '#d4d4d8', border: '1px solid #3f3f46' }}
                className="font-bold active:scale-95 transition-all"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep('pin')}
                disabled={missingTotes.size === 0}
                style={{ height: '48px', width: '75%', backgroundColor: '#fbbf24', color: 'black', fontFamily: 'var(--font-barlow-condensed), sans-serif', fontSize: '24px', borderRadius: '16px' }}
                className="font-black active:scale-95 transition-all disabled:opacity-40"
              >
                ENTER PIN →
              </button>
            </div>
          </>
        )}

        {step === 'pin' && (
          <>
            <p style={{ fontSize: '14px', color: '#a1a1aa', marginBottom: '16px' }}>
              Supervisor: enter your PIN to authorise.
            </p>

            <div className="flex justify-center gap-5 mb-4 h-14 items-center">
              {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all"
                  style={i < pin.length
                    ? { width: '28px', height: '28px', backgroundColor: '#fbbf24' }
                    : { width: '20px', height: '20px', backgroundColor: 'transparent', border: '2px solid #52525b' }
                  }
                />
              ))}
            </div>

            {error && (
              <p style={{ fontSize: '14px', color: '#f87171', textAlign: 'center', marginBottom: '12px' }}>{error}</p>
            )}

            <div className="grid grid-cols-3 gap-4 mb-4" style={{ width: '260px', margin: '0 auto' }}>
              {KEYS.flat().map((key, i) => (
                <button
                  key={i}
                  onClick={() => handleKey(key)}
                  disabled={loading || !key}
                  style={{ width: '72px', height: '72px', color: key === '⌫' ? '#a1a1aa' : 'white', borderRadius: '50%', fontSize: '30px' }}
                  className={`
                    flex items-center justify-center mx-auto font-semibold
                    transition-all duration-100 active:scale-90
                    ${!key ? 'invisible' : ''}
                    ${key === '⌫'
                      ? 'bg-transparent hover:bg-zinc-800/60'
                      : 'bg-zinc-800 hover:shadow-[0_0_0_4px_rgba(251,191,36,0.25)] hover:bg-zinc-700 active:bg-zinc-600'
                    }
                    ${loading ? 'opacity-50' : ''}
                  `}
                >
                  {key}
                </button>
              ))}
            </div>

            <button
              onClick={() => setStep(multipleTotes ? 'totes' : 'reason')}
              style={{ height: '48px', width: '100%', fontSize: '20px', borderRadius: '16px', color: '#71717a' }}
              className="active:scale-95 transition-all"
            >
              ← Back
            </button>
          </>
        )}
      </div>
    </div>
  )
}
