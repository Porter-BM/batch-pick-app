import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { signToken, createSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json()

    if (!pin || typeof pin !== 'string' || pin.length < 1) {
      return NextResponse.json({ error: 'PIN required' }, { status: 400 })
    }

    // Fetch all active users
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, role, pin_hash')
      .eq('active', true)

    if (error || !users || users.length === 0) {
      return NextResponse.json({ error: 'No users configured' }, { status: 500 })
    }

    // Check PIN against each user — find first match
    let matchedUser: { id: string; name: string; role: string } | null = null
    for (const user of users) {
      const match = await bcrypt.compare(pin, user.pin_hash)
      if (match) { matchedUser = user; break }
    }

    if (!matchedUser) {
      // Consistent timing to prevent enumeration
      await bcrypt.compare('dummy', '$2a$10$dummyhashfortimingnnnnnnnnnnnnnnnnnnnn')
      return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 })
    }

    const role = matchedUser.role as 'staff' | 'admin'
    const session_id = uuidv4()

    const token = signToken({
      session_id,
      role,
      user_id: matchedUser.id,
      user_name: matchedUser.name,
      created_at: Date.now(),
    })

    const cookie = createSessionCookie(token)
    const response = NextResponse.json({
      success: true,
      role,
      session_id,
      user_id: matchedUser.id,
      user_name: matchedUser.name,
    })
    response.cookies.set(cookie)
    return response
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
