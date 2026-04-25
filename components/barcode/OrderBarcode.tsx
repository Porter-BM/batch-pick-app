'use client'

import { useEffect, useRef } from 'react'

interface OrderBarcodeProps {
  orderNumber: string // e.g. "#1042" or "1042"
  width?: number
  height?: number
}

export function OrderBarcode({ orderNumber, width = 2, height = 80 }: OrderBarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  // Strip leading # if present
  const code = orderNumber.replace(/^#/, '')

  useEffect(() => {
    if (!svgRef.current) return

    import('jsbarcode').then(({ default: JsBarcode }) => {
      JsBarcode(svgRef.current, code, {
        format: 'CODE128',
        width,
        height,
        displayValue: true,
        fontSize: 16,
        margin: 10,
        background: '#ffffff',
        lineColor: '#000000',
      })
    })
  }, [code, width, height])

  return (
    <div className="bg-white rounded-xl p-4 flex justify-center">
      <svg ref={svgRef} />
    </div>
  )
}
