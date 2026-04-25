import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'
import { shopifyGraphQL } from '@/lib/shopify'
import { ORDER_LINE_ITEMS_QUERY } from '@/lib/queries'
import { BinStop, ToteAssignment } from '@/types'
import { sortByBinLocation } from '@/lib/binSort'

interface OrderLineItemsResponse {
  order: {
    id: string
    name: string
    lineItems: {
      edges: {
        node: {
          id: string
          title: string
          quantity: number
          variant: {
            id: string
            title: string
            barcode: string | null
            metafield: { value: string } | null
          } | null
        }
      }[]
    }
  }
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { orderIds, toteAssignments }: {
      orderIds: string[]
      toteAssignments: ToteAssignment[]
    } = await req.json()

    if (!orderIds?.length) {
      return NextResponse.json({ error: 'orderIds required' }, { status: 400 })
    }

    // Fetch all orders in parallel (within Shopify rate limits)
    const orderDataArray = await Promise.all(
      orderIds.map((id) =>
        shopifyGraphQL<OrderLineItemsResponse>(ORDER_LINE_ITEMS_QUERY, { id })
      )
    )

    // Build a map: tote number → order ID
    const toteMap = new Map(toteAssignments.map((t) => [t.orderId, t.toteNumber]))

    // Aggregate: variantId+binLocation → BinStop
    const binStopMap = new Map<string, BinStop>()

    for (const orderData of orderDataArray) {
      const order = orderData.order
      const toteNumber = toteMap.get(order.id)
      if (toteNumber === undefined) continue

      for (const edge of order.lineItems.edges) {
        const item = edge.node
        const variant = item.variant
        if (!variant) continue

        const binLocation = variant.metafield?.value ?? null
        const key = `${variant.id}::${binLocation ?? '__no_bin__'}`

        if (binStopMap.has(key)) {
          const existing = binStopMap.get(key)!
          existing.totalQuantity += item.quantity

          const toteEntry = existing.toteBreakdown.find((t) => t.toteNumber === toteNumber)
          if (toteEntry) {
            toteEntry.quantity += item.quantity
          } else {
            existing.toteBreakdown.push({ toteNumber, quantity: item.quantity })
          }
        } else {
          binStopMap.set(key, {
            binLocation,
            variantId: variant.id,
            productTitle: item.title,
            variantTitle: variant.title,
            barcode: variant.barcode,
            totalQuantity: item.quantity,
            toteBreakdown: [{ toteNumber, quantity: item.quantity }],
            confirmed: false,
            skipped: false,
            missingTotes: [],
          })
        }
      }
    }

    // Sort tote breakdown within each bin stop by tote number
    const binStops = Array.from(binStopMap.values()).map((stop) => ({
      ...stop,
      toteBreakdown: stop.toteBreakdown.sort((a, b) => a.toteNumber - b.toteNumber),
    }))

    // Sort bin stops by location (nulls at end)
    const sorted = sortByBinLocation(binStops)

    const newToken = refreshToken(session)
    const cookie = createSessionCookie(newToken)
    const response = NextResponse.json({ binStops: sorted })
    response.cookies.set(cookie)

    return response
  } catch (err) {
    console.error('Line items fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch line items' }, { status: 500 })
  }
}
