import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params

  const { data: pickRun, error } = await supabase
    .from('pick_runs')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !pickRun) {
    return NextResponse.json({ error: 'Pick run not found' }, { status: 404 })
  }

  const { data: orders } = await supabase
    .from('pick_run_orders')
    .select('*')
    .eq('pick_run_id', id)

  const { data: confirmations } = await supabase
    .from('pick_confirmations')
    .select('*')
    .eq('pick_run_id', id)

  return NextResponse.json({ pickRun, orders: orders ?? [], confirmations: confirmations ?? [] })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const allowed = ['status', 'current_bin_index']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('pick_runs')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const newToken = refreshToken(session)
  const cookie = createSessionCookie(newToken)
  const response = NextResponse.json({ pickRun: data })
  response.cookies.set(cookie)
  return response
}
