import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSessionFromRequest, refreshToken, createSessionCookie } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('settings')
    .select('id, bin_location_metafield_key, max_batch_size')
    .eq('id', 1)
    .single()

  if (error) return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })

  return NextResponse.json({ settings: data })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const updates: Record<string, unknown> = {}

    if (body.staff_pin) {
      if (!/^\d{4,8}$/.test(body.staff_pin)) {
        return NextResponse.json({ error: 'Staff PIN must be 4–8 digits' }, { status: 400 })
      }
      updates.staff_pin_hash = await bcrypt.hash(body.staff_pin, 10)
    }

    if (body.admin_pin) {
      if (!/^\d{4,8}$/.test(body.admin_pin)) {
        return NextResponse.json({ error: 'Admin PIN must be 4–8 digits' }, { status: 400 })
      }
      updates.admin_pin_hash = await bcrypt.hash(body.admin_pin, 10)
    }

    if (body.bin_location_metafield_key) {
      updates.bin_location_metafield_key = body.bin_location_metafield_key
    }

    if (body.max_batch_size) {
      const size = parseInt(body.max_batch_size, 10)
      if (isNaN(size) || size < 1 || size > 50) {
        return NextResponse.json({ error: 'Max batch size must be 1–50' }, { status: 400 })
      }
      updates.max_batch_size = size
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
    }

    const { error } = await supabase.from('settings').update(updates).eq('id', 1)

    if (error) throw new Error(error.message)

    const newToken = refreshToken(session)
    const cookie = createSessionCookie(newToken)
    const response = NextResponse.json({ success: true })
    response.cookies.set(cookie)
    return response
  } catch (err) {
    console.error('Settings update error:', err)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
