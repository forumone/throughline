import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { CSSProperties, ReactNode } from 'react'
import type { EmailBrandTokens } from '../tokens.js'

export interface EmailLayoutProps {
  /** Inbox preview snippet (the line shown next to the subject in clients). */
  preview: string
  tokens: EmailBrandTokens
  children: ReactNode
}

/**
 * Shared chrome for every transactional template: brand-name header,
 * thin rule, body slot, and a footer disclaimer that names the brand
 * again. Sticking to React Email primitives (`Body`, `Container`,
 * `Section`) keeps Outlook / Gmail / Apple Mail rendering consistent;
 * raw `<div>` + CSS is where compatibility nightmares live.
 */
export function EmailLayout({ preview, tokens, children }: EmailLayoutProps) {
  const bodyStyle: CSSProperties = {
    backgroundColor: '#F5F5F5',
    fontFamily: tokens.fontFamilySans,
    margin: 0,
    padding: '24px 0',
  }
  const containerStyle: CSSProperties = {
    backgroundColor: tokens.bgPrimary,
    maxWidth: 600,
    margin: '0 auto',
    padding: 32,
    borderRadius: 8,
  }
  const brandStyle: CSSProperties = {
    color: tokens.textPrimary,
    fontWeight: 700,
    fontSize: 18,
    margin: 0,
  }
  const dividerStyle: CSSProperties = { borderColor: tokens.border, margin: '24px 0' }
  const footerDividerStyle: CSSProperties = { borderColor: tokens.border, margin: '32px 0 16px' }
  const footerTextStyle: CSSProperties = {
    color: tokens.textSecondary,
    fontSize: 12,
    margin: 0,
  }

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section>
            <Text style={brandStyle}>{tokens.brandName}</Text>
          </Section>
          <Hr style={dividerStyle} />
          {children}
          <Hr style={footerDividerStyle} />
          <Text style={footerTextStyle}>
            This message is from your {tokens.brandName} content system. If you did not expect this,
            contact your system administrator.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
