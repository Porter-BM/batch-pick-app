import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

// GET all users
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, role, active, created_at')
    .order('role', { ascending: false }) // admin first
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const newToken = refreshToken(session)
  const cookie = createSessionCookie(newToken)
  const response = NextResponse.json({ users })
  response.cookies.set(cookie)
  return response
}

// POST create user
export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin required' }, { status: 403 })
  }

  const { name, role, pin } = await req.json()
  if (!name || !role || !pin || pin.length < 4) {
    return NextResponse.json({ error: 'Name, role, and PIN (min 4 digits) required' }, { status: 400 })
  }

  const pin_hash = await bcrypt.hash(pin, 10)
  const { data, error } = await supabase
    .from('users')
    .insert({ name, role, pin_hash, active: true })
    .select('id, name, role, active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const newToken = refreshToken(session)
  const cookie = createSessionCookie(newToken)
  const response = NextResponse.json({ user: data })
  response.cookies.set(cookie)
  return response
}
