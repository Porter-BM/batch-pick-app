import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

// PATCH update user (name, role, active, or PIN)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSessionFromRequest(req)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  const { id } = await params
  const { name, role, active, pin } = await req.json()

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (role !== undefined) updates.role = role
  if (active !== undefined) updates.active = active
  if (pin) {
    if (pin.length < 4) return NextResponse.json({ error: 'PIN must be at least 4 digits' }, { status: 400 })
    updates.pin_hash = await bcrypt.hash(pin, 10)
  }

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('id, name, role, active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const newToken = refreshToken(session)
  const cookie = createSessionCookie(newToken)
  const response = NextResponse.json({ user: data })
  response.cookies.set(cookie)
  return response
}
