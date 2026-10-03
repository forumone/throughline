import { Button, Heading, Link, Section, Text } from '@react-email/components'
import type { CSSProperties } from 'react'
import { EmailLayout } from './_layout.js'
import type { EmailBrandTokens } from '../tokens.js'

export type ApprovalTargetKind = 'page' | 'post' | 'item'

export interface ApprovalRequestEmailProps {
  approverName: string
  requesterName: string
  targetTitle: string
  /**
   * Human-friendly noun for the target ("page", "post", "item"). Caller maps
   * the collection slug; the template renders it verbatim.
   */
  targetKind: ApprovalTargetKind
  changesSummary: string
  /** Free-form reason from the requester. Optional. */
  requestReason?: string
  previewUrl: string
  approveUrl: string
  changesUrl: string
  discussUrl: string
  /** Pre-formatted expiration string (e.g. `May 5, 2026`). */
  expiresAt: string
  tokens: EmailBrandTokens
}

export function ApprovalRequestEmail(props: ApprovalRequestEmailProps) {
  const { tokens } = props

  const labelStyle: CSSProperties = {
    color: tokens.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }
  const boxStyle: CSSProperties = {
    backgroundColor: tokens.bgSecondary,
    padding: 16,
    borderRadius: 6,
    marginTop: 16,
  }
  const primaryButtonStyle: CSSProperties = {
    backgroundColor: tokens.textPrimary,
    color: '#FFFFFF',
    padding: '12px 20px',
    borderRadius: 4,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    display: 'inline-block',
  }
  const approveButtonStyle: CSSProperties = {
    backgroundColor: tokens.brandPrimary,
    color: '#FFFFFF',
    padding: '10px 16px',
    borderRadius: 4,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    display: 'inline-block',
  }
  const outlineButtonStyle: CSSProperties = {
    backgroundColor: tokens.bgPrimary,
    color: tokens.textPrimary,
    padding: '10px 16px',
    border: `1px solid ${tokens.border}`,
    borderRadius: 4,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    display: 'inline-block',
  }
  const discussLinkStyle: CSSProperties = {
    color: tokens.brandPrimary,
    fontSize: 14,
    textDecoration: 'underline',
  }

  return (
    <EmailLayout preview={`Approval needed: ${props.targetTitle}`} tokens={tokens}>
      <Heading style={{ color: tokens.textPrimary, fontSize: 22, margin: 0 }}>
        Approval needed
      </Heading>

      <Text style={{ color: tokens.textPrimary, fontSize: 16, marginTop: 8 }}>
        Hi {props.approverName},
      </Text>

      <Text style={{ color: tokens.textPrimary, fontSize: 16 }}>
        {props.requesterName} is requesting approval to publish the {props.targetKind}{' '}
        <strong>{props.targetTitle}</strong>.
      </Text>

      <Section style={boxStyle}>
        <Text style={labelStyle}>What changed</Text>
        <Text style={{ color: tokens.textPrimary, fontSize: 14, margin: '8px 0 0' }}>
          {props.changesSummary}
        </Text>
      </Section>

      {props.requestReason ? (
        <Section style={{ marginTop: 16 }}>
          <Text style={labelStyle}>Why</Text>
          <Text style={{ color: tokens.textPrimary, fontSize: 14, margin: '8px 0 0' }}>
            {props.requestReason}
          </Text>
        </Section>
      ) : null}

      <Section style={{ marginTop: 24 }}>
        <Button href={props.previewUrl} style={primaryButtonStyle}>
          Preview the changes
        </Button>
      </Section>

      <Section style={{ marginTop: 32 }}>
        <Text style={{ color: tokens.textPrimary, fontSize: 14, fontWeight: 600 }}>
          Your decision:
        </Text>
        {/* HTML email layout: nested table is the only reliable cross-client way
            to align inline buttons. Don't replace with flexbox — Outlook ignores it. */}
        <table style={{ marginTop: 8 }}>
          <tbody>
            <tr>
              <td style={{ paddingRight: 8 }}>
                <Button href={props.approveUrl} style={approveButtonStyle}>
                  Approve
                </Button>
              </td>
              <td style={{ paddingRight: 8 }}>
                <Button href={props.changesUrl} style={outlineButtonStyle}>
                  Request changes
                </Button>
              </td>
              <td>
                <Link href={props.discussUrl} style={discussLinkStyle}>
                  Discuss
                </Link>
              </td>
            </tr>
          </tbody>
        </table>
      </Section>

      <Text style={{ color: tokens.textSecondary, fontSize: 12, marginTop: 24 }}>
        This request expires {props.expiresAt}.
      </Text>
    </EmailLayout>
  )
}
