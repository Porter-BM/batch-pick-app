'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
  onClose: () => void
  expectedBarcode?: string | null
}

export function BarcodeScanner({ onScan, onClose, expectedBarcode }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const readerRef = useRef<unknown>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function startScanner() {
      try {
        // Dynamically import ZXing to avoid SSR issues
        const { BrowserMultiFormatReader } = await import('@zxing/library')
        if (cancelled) return

        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        })

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        setScanning(true)

        // Poll for barcodes
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        const poll = async () => {
          if (cancelled || !videoRef.current || !ctx) return

          const video = videoRef.current
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            ctx.drawImage(video, 0, 0)

            try {
              // @ts-expect-error - ZXing types
              const result = await reader.decodeFromCanvas(canvas)
              if (result && !cancelled) {
                onScan(result.getText())
                return
              }
            } catch {
              // No barcode found in frame — continue
            }
          }

          if (!cancelled) setTimeout(poll, 150)
        }

        poll()
      } catch (err) {
        if (!cancelled) {
          setError('Camera access denied. Please allow camera permissions and try again.')
        }
      }
    }

    startScanner()

    return () => {
      cancelled = true
      stopCamera()
    }
  }, [onScan, stopCamera])

  const handleClose = () => {
    stopCamera()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80">
        <p className="text-white font-semibold text-base">
          {expectedBarcode ? 'Scan product barcode' : 'Scan barcode'}
        </p>
        <button
          onClick={handleClose}
          className="text-white bg-zinc-800 rounded-full w-10 h-10 flex items-center justify-center text-xl active:bg-zinc-700"
        >
          ✕
        </button>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Scanning overlay */}
        {scanning && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-40 border-2 border-amber-400 rounded-lg relative">
              <div className="absolute inset-x-0 top-0 h-0.5 bg-amber-400 animate-scan" />
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-amber-400 text-sm whitespace-nowrap">
                Align barcode within frame
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="bg-zinc-900 rounded-2xl p-6 text-center">
              <p className="text-red-400 text-base mb-4">{error}</p>
              <button
                onClick={handleClose}
                className="bg-zinc-700 text-white rounded-xl px-6 py-3"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes scan {
          0% { top: 0; }
          50% { top: calc(100% - 2px); }
          100% { top: 0; }
        }
        .animate-scan {
          animation: scan 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
