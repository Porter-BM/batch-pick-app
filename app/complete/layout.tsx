'use client'
import { SessionProvider } from '@/components/SessionProvider'
export default function CompleteLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
