'use client'
import { SessionProvider } from '@/components/SessionProvider'
export default function PackingLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
