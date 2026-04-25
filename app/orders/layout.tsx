'use client'

import { SessionProvider } from '@/components/SessionProvider'

export default function PickerLayout({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
