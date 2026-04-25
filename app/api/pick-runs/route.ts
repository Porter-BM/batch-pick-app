import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { ToteAssignment } from '@/types'

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    const { toteAssignments }: { toteAssignments: ToteAssignment[] } = await req.json()

    if (!toteAssignments?.length) {
      return NextResponse.json({ error: 'toteAssignments required' }, { status: 400 })
    }

    // Create pick run with user_id
    const { data: pickRun, error: runError } = await supabase
      .from('pick_runs')
      .insert({
        session_id: session.session_id,
        created_by_user_id: session.user_id ?? null,
        status: 'active',
        current_bin_index: 0,
      })
      .select()
      .single()

    if (runError || !pickRun) {
      throw new Error(`Failed to create pick run: ${runError?.message}`)
    }

    // Insert all order assignments
    const orderRows = toteAssignments.map((t) => ({
      pick_run_id: pickRun.id,
      shopify_order_id: t.orderId,
      shopify_order_number: t.orderNumber,
      tote_number: t.toteNumber,
      status: 'pending',
    }))

    const { error: ordersError } = await supabase
      .from('pick_run_orders')
      .insert(orderRows)

    if (ordersError) {
      // Rollback pick run
      await supabase.from('pick_runs').delete().eq('id', pickRun.id)
      throw new Error(`Failed to insert pick run orders: ${ordersError.message}`)
    }

    const newToken = refreshToken(session)
    const cookie = createSessionCookie(newToken)
    const response = NextResponse.json({ pickRun })
    response.cookies.set(cookie)

    return response
  } catch (err) {
    console.error('Create pick run error:', err)
    return NextResponse.json({ error: 'Failed to create pick run' }, { status: 500 })
  }
}

// GET active pick run for current user (for resume on login)
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  try {
    // Query by user_id if available, fall back to session_id for legacy runs
    const query = supabase
      .from('pick_runs')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)

    const { data: pickRun } = session.user_id
      ? await query.eq('created_by_user_id', session.user_id).single()
      : await query.eq('session_id', session.session_id).single()

    if (!pickRun) {
      return NextResponse.json({ pickRun: null })
    }

    const { data: orders } = await supabase
      .from('pick_run_orders')
      .select('*')
      .eq('pick_run_id', pickRun.id)

    const newToken = refreshToken(session)
    const cookie = createSessionCookie(newToken)
    const response = NextResponse.json({ pickRun, orders: orders ?? [] })
    response.cookies.set(cookie)
    return response
  } catch {
    return NextResponse.json({ pickRun: null })
  }
}
