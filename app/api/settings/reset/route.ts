import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    // Delete in dependency order to respect foreign key constraints

    // 1. Confirmations (references pick_runs)
    const { error: confirmError } = await supabase
      .from('pick_confirmations')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (confirmError) throw new Error(`Failed to clear confirmations: ${confirmError.message}`)

    // 2. Pick run orders (references pick_runs)
    const { error: ordersError } = await supabase
      .from('pick_run_orders')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (ordersError) throw new Error(`Failed to clear pick run orders: ${ordersError.message}`)

    // 3. Pick runs
    const { error: runsError } = await supabase
      .from('pick_runs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (runsError) throw new Error(`Failed to clear pick runs: ${runsError.message}`)

    // 4. Parked orders
    const { error: parkedError } = await supabase
      .from('parked_orders')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
    if (parkedError) throw new Error(`Failed to clear parked orders: ${parkedError.message}`)

    const newToken = refreshToken(session)
    const cookie = createSessionCookie(newToken)
    const response = NextResponse.json({ success: true, message: 'All pick data cleared' })
    response.cookies.set(cookie)
    return response
  } catch (err) {
    console.error('Reset error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Reset failed' }, { status: 500 })
  }
}
