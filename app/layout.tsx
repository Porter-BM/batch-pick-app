import type { Metadata } from 'next'
import { Barlow_Condensed, Barlow, Geist_Mono } from 'next/font/google'
import './globals.css'

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-barlow',
})

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-barlow-condensed',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Batch Pick — Bear & Moo',
  description: 'Warehouse batch order picking',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable} ${geistMono.variable}`} style={{ colorScheme: 'dark' }}>
      <body className="bg-zinc-950 text-zinc-100 antialiased min-h-screen" style={{ fontFamily: 'var(--font-barlow), sans-serif', backgroundColor: '#09090b' }}>
        {children}
      </body>
    </html>
  )
}
