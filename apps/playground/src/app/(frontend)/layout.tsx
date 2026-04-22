import type { Metadata } from 'next'
import React from 'react'

export const metadata: Metadata = {
  title: 'Throughline playground',
}

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  )
}
