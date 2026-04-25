import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    // Fetch unresolved parked orders with their current tote assignment
    const { data: parkedOrders, error } = await supabase
      .from('parked_orders')
      .select(`
        id,
        shopify_order_id,
        shopify_order_number,
        reason,
        parked_at,
        picked_line_items,
        missing_line_items,
        origin_pick_run_id,
        resume_pick_run_id
      `)
      .eq('resolved', false)
      .order('parked_at', { ascending: false })

    if (error) throw new Error(error.message)

    // Fetch current tote assignments for these orders
    const orderIds = (parkedOrders ?? []).map(o => o.id)
    const { data: toteAssignments } = await supabase
      .from('parked_tote_assignments')
      .select('parked_order_id, park_tote_number, assigned_at')
      .in('parked_order_id', orderIds.length > 0 ? orderIds : ['none'])
      .is('released_at', null)

    // Merge tote info into orders
    const orders = (parkedOrders ?? []).map(o => {
      const tote = (toteAssignments ?? []).find(t => t.parked_order_id === o.id)
      return {
        ...o,
        park_tote_number: tote?.park_tote_number ?? null,
        tote_assigned_at: tote?.assigned_at ?? null,
      }
    })

    const newToken = refreshToken(session)
    const cookie = createSessionCookie(newToken)
    const response = NextResponse.json({ parkedOrders: orders, count: orders.length })
    response.cookies.set(cookie)
    return response
  } catch (err) {
    console.error('Parked orders error:', err)
    return NextResponse.json({ error: 'Failed to fetch parked orders' }, { status: 500 })
  }
}
