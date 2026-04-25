import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest, refreshToken, createSessionCookie, IDLE_TIMEOUT_MS } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req)

  if (!session) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 })
  }

  const newToken = refreshToken(session)
  const cookie = createSessionCookie(newToken)

  const idleMs = Date.now() - session.last_active_at
  const remainingMs = IDLE_TIMEOUT_MS - idleMs

  const response = NextResponse.json({
    success: true,
    session_id: session.session_id,
    role: session.role,
    remaining_ms: remainingMs,
  })
  response.cookies.set(cookie)

  return response
}

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req)

  if (!session) {
    return NextResponse.json({ valid: false }, { status: 401 })
  }

  const idleMs = Date.now() - session.last_active_at
  const remainingMs = IDLE_TIMEOUT_MS - idleMs

  return NextResponse.json({
    valid: true,
    session_id: session.session_id,
    role: session.role,
    remaining_ms: remainingMs,
  })
}
