import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { CSSProperties, ReactNode } from 'react'

export interface FormsLayoutProps {
  preview: string
  brandName: string
  children: ReactNode
}

/**
 * Lightweight chrome shared across the two forms-package templates. Modeled
 * on the email package's EmailLayout but uses neutral defaults rather than
 * pulling the full token surface — these emails are short, transactional,
 * and benefit from minimal branding.
 */
export function FormsLayout({ preview, brandName, children }: FormsLayoutProps) {
  const bodyStyle: CSSProperties = {
    backgroundColor: '#F5F5F5',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    margin: 0,
    padding: '24px 0',
  }
  const containerStyle: CSSProperties = {
    backgroundColor: '#FFFFFF',
    maxWidth: 600,
    margin: '0 auto',
    padding: 32,
    borderRadius: 8,
  }
  const headerStyle: CSSProperties = {
    color: '#18181B',
    fontWeight: 700,
    fontSize: 18,
    margin: 0,
  }
  const dividerStyle: CSSProperties = { borderColor: '#E4E4E7', margin: '24px 0' }
  const footerDividerStyle: CSSProperties = { borderColor: '#E4E4E7', margin: '32px 0 16px' }
  const footerStyle: CSSProperties = { color: '#52525B', fontSize: 12, margin: 0 }

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section>
            <Text style={headerStyle}>{brandName}</Text>
          </Section>
          <Hr style={dividerStyle} />
          {children}
          <Hr style={footerDividerStyle} />
          <Text style={footerStyle}>
            This is an automated message from {brandName}. Replies to this address are not monitored.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
