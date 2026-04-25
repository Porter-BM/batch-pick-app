import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'
import { shopifyGraphQL } from '@/lib/shopify'
import { supabase } from '@/lib/supabase'
import { UNFULFILLED_ORDERS_QUERY } from '@/lib/queries'
import { OrderWithStatus } from '@/types'

interface ShopifyOrderNode {
  id: string
  name: string
  createdAt: string
  tags: string[]
  displayFulfillmentStatus: string
  shippingAddress: {
    country: string
    countryCodeV2: string
    province: string
  } | null
  lineItems: { edges: { node: { id: string; title: string; quantity: number } }[] }
  shippingLines: {
    edges: {
      node: { title: string; code: string }
    }[]
  }
}

interface ShopifyOrdersResponse {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string }
    edges: { node: ShopifyOrderNode }[]
  }
}

function parseOrderNumber(name: string): number {
  return parseInt(name.replace(/\D/g, ''), 10) || 0
}

// Build query string per tab - pushed to Shopify for server-side filtering
function buildShopifyQuery(tab: string): string {
  switch (tab) {
    case 'nz':
      // Open + (unfulfilled or partial) + NZ shipping
      return 'status:open (fulfillment_status:unfulfilled OR fulfillment_status:partial) shipping_address_country_code:NZ delivery_method:shipping'
    case 'pickups':
      // Open + pickup or local delivery (any fulfillment status)
      return 'status:open (delivery_method:pick-up OR delivery_method:local)'
    case 'international':
      // Open + (unfulfilled or partial) + shipping + NOT NZ
      return 'status:open (fulfillment_status:unfulfilled OR fulfillment_status:partial) delivery_method:shipping -shipping_address_country_code:NZ'
    default:
      return 'status:open fulfillment_status:unfulfilled'
  }
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const tab = req.nextUrl.searchParams.get('tab') ?? 'nz'

  try {
    let allOrders: ShopifyOrderNode[] = []
    let cursor: string | null = null
    let hasNextPage = true
    const shopifyQuery = buildShopifyQuery(tab)

    while (hasNextPage) {
      const pageData: ShopifyOrdersResponse = await shopifyGraphQL<ShopifyOrdersResponse>(
        UNFULFILLED_ORDERS_QUERY,
        { query: shopifyQuery, ...(cursor ? { cursor } : {}) }
      )
      allOrders = allOrders.concat(
        pageData.orders.edges.map((e: { node: ShopifyOrderNode }) => e.node)
      )
      hasNextPage = pageData.orders.pageInfo.hasNextPage
      cursor = pageData.orders.pageInfo.endCursor
    }

    // Get orders currently in active pick runs
    const { data: activeRuns } = await supabase
      .from('pick_runs')
      .select('id')
      .eq('status', 'active')

    const activeRunIds = (activeRuns ?? []).map((r: { id: string }) => r.id)

    const { data: activeRunOrders } = activeRunIds.length
      ? await supabase
          .from('pick_run_orders')
          .select('shopify_order_id, pick_run_id')
          .eq('status', 'pending')
          .in('pick_run_id', activeRunIds)
      : { data: [] }

    const activeOrderIds = new Set(
      (activeRunOrders ?? []).map((o: { shopify_order_id: string }) => o.shopify_order_id)
    )

    // Get unresolved parked orders
    const { data: parkedOrders } = await supabase
      .from('parked_orders')
      .select('shopify_order_id, reason, park_tote_number')
      .eq('resolved', false)

    const parkedMap = new Map(
      (parkedOrders ?? []).map((o: {
        shopify_order_id: string
        reason: string
        park_tote_number: number
      }) => [o.shopify_order_id, o])
    )

    // Build response
    const orders: OrderWithStatus[] = allOrders.map((order) => {
      const parked = parkedMap.get(order.id)
      const inProgress = activeOrderIds.has(order.id) && !parked

      return {
        id: order.id,
        name: order.name,
        orderNumber: parseOrderNumber(order.name),
        createdAt: order.createdAt,
        tags: order.tags,
        fulfillmentStatus: order.displayFulfillmentStatus,
        shippingAddress: order.shippingAddress
          ? {
              country: order.shippingAddress.country,
              countryCode: order.shippingAddress.countryCodeV2,
              province: order.shippingAddress.province,
            }
          : null,
        lineItems: order.lineItems.edges.map((e) => ({
          id: e.node.id,
          title: e.node.title,
          quantity: e.node.quantity,
          variant: null,
        })),
        deliveryMethod: tab === 'pickups' ? 'PICK_UP' : 'SHIPPING',
        pickStatus: parked ? 'parked' : inProgress ? 'in_progress' : 'available',
        parkReason: parked?.reason,
        parkToteNumber: parked?.park_tote_number,
      }
    })

    // Sort: parked first, then by order number ascending
    orders.sort((a, b) => {
      if (a.pickStatus === 'parked' && b.pickStatus !== 'parked') return -1
      if (b.pickStatus === 'parked' && a.pickStatus !== 'parked') return 1
      return a.orderNumber - b.orderNumber
    })

    const newToken = refreshToken(session)
    const cookie = createSessionCookie(newToken)
    const response = NextResponse.json({ orders })
    response.cookies.set(cookie)

    return response
  } catch (err) {
    console.error('Orders fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}
