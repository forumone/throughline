import type { ReactNode } from 'react'

export const metadata = {
  title: '{{projectName}}',
  description: 'Powered by Payload CMS + Throughline',
}

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          margin: 0,
          padding: 0,
        }}
      >
        {children}
      </body>
    </html>
  )
}
