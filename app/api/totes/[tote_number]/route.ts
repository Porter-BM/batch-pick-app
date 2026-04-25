import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { shopifyGraphQL } from '@/lib/shopify'
import { ORDER_LINE_ITEMS_QUERY } from '@/lib/queries'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tote_number: string }> }
) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { tote_number } = await params
  const toteNum = parseInt(tote_number, 10)

  if (isNaN(toteNum)) {
    return NextResponse.json({ error: 'Invalid tote number' }, { status: 400 })
  }

  try {
    // Find the pick_run_order for this tote in the most recent completed/active run
    const { data: pickRunOrder, error } = await supabase
      .from('pick_run_orders')
      .select('*, pick_runs!inner(status, created_at)')
      .eq('tote_number', toteNum)
      .in('status', ['picked', 'pending', 'parked'])
      .order('created_at', { ascending: false, referencedTable: 'pick_runs' })
      .limit(1)
      .single()

    if (error || !pickRunOrder) {
      return NextResponse.json({ error: 'Tote not found in any active pick run' }, { status: 404 })
    }

    if (pickRunOrder.status === 'parked') {
      return NextResponse.json({
        toteNumber: toteNum,
        orderNumber: pickRunOrder.shopify_order_number,
        orderId: pickRunOrder.shopify_order_id,
        status: 'parked',
        parkToteNumber: pickRunOrder.park_tote_number,
        lineItems: [],
      })
    }

    // Fetch line items from Shopify for packing display
    const orderData = await shopifyGraphQL<{
      order: {
        id: string
        name: string
        lineItems: {
          edges: {
            node: {
              id: string
              title: string
              quantity: number
              variant: { id: string; title: string } | null
            }
          }[]
        }
      }
    }>(ORDER_LINE_ITEMS_QUERY, { id: pickRunOrder.shopify_order_id })

    const lineItems = orderData.order.lineItems.edges.map((e) => ({
      title: e.node.title,
      variantTitle: e.node.variant?.title ?? '',
      quantity: e.node.quantity,
    }))

    return NextResponse.json({
      toteNumber: toteNum,
      orderNumber: pickRunOrder.shopify_order_number,
      orderId: pickRunOrder.shopify_order_id,
      status: pickRunOrder.status,
      lineItems,
    })
  } catch (err) {
    console.error('Tote lookup error:', err)
    return NextResponse.json({ error: 'Failed to look up tote' }, { status: 500 })
  }
}
