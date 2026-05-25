import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { RootProvider } from 'fumadocs-ui/provider/next'

import './globals.css'

const inter = Inter({
  subsets: ['latin']
})

export const metadata: Metadata = {
  title: {
    default: 'exjs-controllers',
    template: '%s | exjs-controllers'
  },
  description:
    'Declarative controllers, DTO validation, dependency injection, OpenAPI generation and Express bootstrap for TypeScript APIs.'
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="min-h-screen">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  )
}
