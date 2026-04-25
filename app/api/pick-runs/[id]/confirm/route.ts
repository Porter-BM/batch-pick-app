import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { ConfirmationMethod } from '@/types'

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
      variant_id,
      bin_location,
      quantity_confirmed,
      method,
      new_bin_index,
    }: {
      shopify_order_id: string
      variant_id: string
      bin_location: string | null
      quantity_confirmed: number
      method: ConfirmationMethod
      new_bin_index: number
    } = await req.json()

    // Insert confirmation record
    const { error: confirmError } = await supabase
      .from('pick_confirmations')
      .insert({
        pick_run_id: id,
        shopify_order_id,
        variant_id,
        bin_location,
        quantity_confirmed,
        method,
      })

    if (confirmError) throw new Error(confirmError.message)

    // Advance bin index — saves progress for resume
    const { error: updateError } = await supabase
      .from('pick_runs')
      .update({ current_bin_index: new_bin_index })
      .eq('id', id)

    if (updateError) throw new Error(updateError.message)

    const newToken = refreshToken(session)
    const cookie = createSessionCookie(newToken)
    const response = NextResponse.json({ success: true })
    response.cookies.set(cookie)
    return response
  } catch (err) {
    console.error('Confirm error:', err)
    return NextResponse.json({ error: 'Failed to confirm bin stop' }, { status: 500 })
  }
}
