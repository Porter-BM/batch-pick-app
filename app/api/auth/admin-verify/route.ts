import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabase } from '@/lib/supabase'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req)
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { pin } = await req.json()
    if (!pin || typeof pin !== 'string') {
      return NextResponse.json({ error: 'PIN required' }, { status: 400 })
    }

    const { data: settings, error } = await supabase
      .from('settings')
      .select('admin_pin_hash')
      .eq('id', 1)
      .single()

    if (error || !settings) {
      return NextResponse.json({ error: 'Settings not configured' }, { status: 500 })
    }

    const isAdmin = await bcrypt.compare(pin, settings.admin_pin_hash)

    if (!isAdmin) {
      await bcrypt.compare('dummy', '$2a$10$dummyhashfortimingnnnnnnnnnnnnnnnnnnnnn')
      return NextResponse.json({ error: 'Incorrect supervisor PIN' }, { status: 401 })
    }

    // Refresh session activity
    const newToken = refreshToken(session)
    const cookie = createSessionCookie(newToken)
    const response = NextResponse.json({ success: true })
    response.cookies.set(cookie)

    return response
  } catch (err) {
    console.error('Admin verify error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
