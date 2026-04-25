'use client'
import { SessionProvider } from '@/components/SessionProvider'
export default function PickLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
