import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params

  try {
    const {
      shopify_order_id,
      shopify_order_number,
      park_tote_number,
      reason,
      picked_line_items,
      missing_line_items,
    }: {
      shopify_order_id: string
      shopify_order_number: string
      park_tote_number: number
      reason: string
      picked_line_items?: object[]
      missing_line_items?: object[]
    } = await req.json()

    // Update pick_run_orders with park tote and status
    const { error: updateError } = await supabase
      .from('pick_run_orders')
      .update({
        park_tote_number,
        status: 'parked',
        picked_line_items: picked_line_items ?? null,
        missing_line_items: missing_line_items ?? null,
      })
      .eq('pick_run_id', id)
      .eq('shopify_order_id', shopify_order_id)

    if (updateError) throw new Error(updateError.message)

    // Upsert into persistent parked_orders table
    const { data: parkedOrder, error: parkError } = await supabase
      .from('parked_orders')
      .upsert(
        {
          shopify_order_id,
          shopify_order_number,
          reason,
          origin_pick_run_id: id,
          picked_line_items: picked_line_items ?? null,
          missing_line_items: missing_line_items ?? null,
          parked_at: new Date().toISOString(),
          resolved: false,
          resolved_at: null,
        },
        { onConflict: 'shopify_order_id' }
      )
      .select()
      .single()

    if (parkError) throw new Error(parkError.message)

    // Insert into parked_tote_assignments
    const { error: toteError } = await supabase
      .from('parked_tote_assignments')
      .insert({
        parked_order_id: parkedOrder.id,
        shopify_order_id,
        shopify_order_number,
        park_tote_number,
        assigned_by_session_id: session.session_id,
        assigned_at: new Date().toISOString(),
      })

    if (toteError) throw new Error(toteError.message)

    const newToken = refreshToken(session)
    const cookie = createSessionCookie(newToken)
    const response = NextResponse.json({ success: true, parked_order_id: parkedOrder.id })
    response.cookies.set(cookie)
    return response
  } catch (err) {
    console.error('Park order error:', err)
    return NextResponse.json({ error: 'Failed to park order' }, { status: 500 })
  }
}
