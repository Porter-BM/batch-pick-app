'use client'
import { SessionProvider } from '@/components/SessionProvider'
export default function TotesLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
