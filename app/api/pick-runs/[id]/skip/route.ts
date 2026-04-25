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
      missing_tote_numbers, // specific totes missing this item
      all_tote_breakdown,   // full tote breakdown at this stop [{toteNumber, quantity}]
      variant_id,
      bin_location,
      reason,
      new_bin_index,
      tote_assignments,     // [{toteNumber, orderId, orderNumber}]
    }: {
      missing_tote_numbers: number[]
      all_tote_breakdown: { toteNumber: number; quantity: number }[]
      variant_id: string
      bin_location: string | null
      reason: string
      new_bin_index: number
      tote_assignments: { toteNumber: number; orderId: string; orderNumber: string }[]
    } = await req.json()

    // Record a 'missing' confirmation for each affected tote
    const confirmations = missing_tote_numbers.map(toteNumber => {
      const breakdown = all_tote_breakdown.find(t => t.toteNumber === toteNumber)
      const assignment = tote_assignments.find(t => t.toteNumber === toteNumber)
      return {
        pick_run_id: id,
        shopify_order_id: assignment?.orderId ?? '',
        variant_id,
        bin_location,
        quantity_confirmed: 0,
        quantity_missing: breakdown?.quantity ?? 1,
        tote_number: toteNumber,
        supervisor_reason: reason || 'Item could not be picked',
        supervisor_session_id: session.session_id,
        method: 'missing' as const,
      }
    })

    const { error: confirmError } = await supabase
      .from('pick_confirmations')
      .insert(confirmations)

    if (confirmError) throw new Error(confirmError.message)

    // Mark affected orders as partially_picked (NOT fully parked)
    // Orders stay in the pick walk — just flagged
    const affectedOrderIds = missing_tote_numbers
      .map(tn => tote_assignments.find(t => t.toteNumber === tn)?.orderId)
      .filter(Boolean) as string[]

    for (const order_id of affectedOrderIds) {
      const { error } = await supabase
        .from('pick_run_orders')
        .update({
          is_partially_picked: true,
          parked_reason: reason || 'Item could not be picked',
        })
        .eq('pick_run_id', id)
        .eq('shopify_order_id', order_id)

      if (error) throw new Error(error.message)
    }

    // Advance bin index
    await supabase
      .from('pick_runs')
      .update({ current_bin_index: new_bin_index })
      .eq('id', id)

    const newToken = refreshToken(session)
    const cookie = createSessionCookie(newToken)
    const response = NextResponse.json({
      success: true,
      partially_picked_order_ids: affectedOrderIds,
    })
    response.cookies.set(cookie)
    return response
  } catch (err) {
    console.error('Skip error:', err)
    return NextResponse.json({ error: 'Failed to record missing items' }, { status: 500 })
  }
}
