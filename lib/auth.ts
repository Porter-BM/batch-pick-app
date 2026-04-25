import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { SessionPayload, UserRole } from '@/types'

const COOKIE_NAME = 'batchpick_session'
const IDLE_TIMEOUT_MS = 15 * 60 * 1000

function getSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('Missing JWT_SECRET')
  return secret
}

export function signToken(payload: Omit<SessionPayload, 'last_active_at'>): string {
  return jwt.sign(
    { ...payload, last_active_at: Date.now() },
    getSecret(),
    { expiresIn: '8h' }
  )
}

export function verifyToken(token: string): SessionPayload | null {
  try {
    const payload = jwt.verify(token, getSecret()) as SessionPayload
    const idleMs = Date.now() - payload.last_active_at
    if (idleMs > IDLE_TIMEOUT_MS) return null
    return payload
  } catch {
    return null
  }
}

export function refreshToken(payload: SessionPayload): string {
  const { session_id, role, user_id, user_name, created_at } = payload
  return jwt.sign(
    { session_id, role, user_id, user_name, created_at, last_active_at: Date.now() },
    getSecret(),
    { expiresIn: '8h' }
  )
}

export function getSessionFromRequest(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}

export async function getServerSession(): Promise<SessionPayload | null> {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}

export function createSessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 8 * 60 * 60,
  }
}

export function clearSessionCookie() {
  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  }
}

export { COOKIE_NAME, IDLE_TIMEOUT_MS }
export type { UserRole }
