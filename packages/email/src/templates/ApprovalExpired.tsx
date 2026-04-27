import { Heading, Text } from '@react-email/components'
import { EmailLayout } from './_layout.js'
import type { EmailBrandTokens } from '../tokens.js'

export interface ApprovalExpiredEmailProps {
  requesterName: string
  targetTitle: string
  /** Pre-formatted "requested on" date (e.g. "Apr 15, 2026"). */
  requestedAt: string
  tokens: EmailBrandTokens
}

export function ApprovalExpiredEmail(props: ApprovalExpiredEmailProps) {
  const { tokens } = props
  return (
    <EmailLayout preview={`Approval expired: ${props.targetTitle}`} tokens={tokens}>
      <Heading style={{ color: tokens.textPrimary, fontSize: 22, margin: 0 }}>
        Approval expired
      </Heading>

      <Text style={{ color: tokens.textPrimary, fontSize: 16, marginTop: 16 }}>
        Hi {props.requesterName},
      </Text>

      <Text style={{ color: tokens.textPrimary, fontSize: 16 }}>
        The approval request you submitted for <strong>{props.targetTitle}</strong> on{' '}
        {props.requestedAt} has expired without a decision.
      </Text>

      <Text style={{ color: tokens.textPrimary, fontSize: 14, marginTop: 16 }}>
        If you still want to publish, ask Claude to request approval again — the framework will
        re-route to the same approver groups.
      </Text>
    </EmailLayout>
  )
}
