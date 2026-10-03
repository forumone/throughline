import { Button, Heading, Section, Text } from '@react-email/components'
import type { CSSProperties } from 'react'
import { EmailLayout } from './_layout.js'
import type { EmailBrandTokens } from '../tokens.js'

export type ApprovalDecisionKind = 'granted' | 'declined' | 'changes-requested'

export interface ApprovalDecisionEmailProps {
  requesterName: string
  /** Display name of the person who decided. */
  decidedBy: string
  targetTitle: string
  decision: ApprovalDecisionKind
  /** Free-form notes from the decider. Optional. */
  decisionNotes?: string
  previewUrl: string
  tokens: EmailBrandTokens
}

const HEADLINE: Record<ApprovalDecisionKind, string> = {
  granted: 'Approved',
  declined: 'Not approved',
  'changes-requested': 'Changes requested',
}

const HEADLINE_COLOR: Record<ApprovalDecisionKind, string> = {
  granted: '#16A34A',
  declined: '#DC2626',
  'changes-requested': '#CA8A04',
}

function nextStep(decision: ApprovalDecisionKind, target: string, decidedBy: string): string {
  if (decision === 'granted') {
    return `You can publish ${target} when you're ready. Ask Claude to publish it.`
  }
  if (decision === 'declined') {
    return `${target} was not approved. Read the decision notes below and discuss with ${decidedBy} if you'd like context.`
  }
  return `${decidedBy} requested changes to ${target}. Edit as requested and ask Claude to request approval again.`
}

export function ApprovalDecisionEmail(props: ApprovalDecisionEmailProps) {
  const { tokens, decision } = props

  const headlineStyle: CSSProperties = {
    color: HEADLINE_COLOR[decision],
    fontSize: 22,
    margin: 0,
  }
  const labelStyle: CSSProperties = {
    color: tokens.textSecondary,
    fontSize: 12,
    fontWeight: 600,
    margin: 0,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }
  const notesBoxStyle: CSSProperties = {
    backgroundColor: tokens.bgSecondary,
    padding: 16,
    borderRadius: 6,
    marginTop: 16,
  }
  const previewButtonStyle: CSSProperties = {
    backgroundColor: tokens.textPrimary,
    color: '#FFFFFF',
    padding: '12px 20px',
    borderRadius: 4,
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    display: 'inline-block',
  }

  return (
    <EmailLayout
      preview={`${HEADLINE[decision]}: ${props.targetTitle}`}
      tokens={tokens}
    >
      <Heading style={headlineStyle}>
        {HEADLINE[decision]}: {props.targetTitle}
      </Heading>

      <Text style={{ color: tokens.textPrimary, fontSize: 16, marginTop: 16 }}>
        Hi {props.requesterName},
      </Text>

      <Text style={{ color: tokens.textPrimary, fontSize: 16 }}>
        {props.decidedBy} reviewed your approval request.
      </Text>

      {props.decisionNotes ? (
        <Section style={notesBoxStyle}>
          <Text style={labelStyle}>Notes from {props.decidedBy}</Text>
          <Text style={{ color: tokens.textPrimary, fontSize: 14, margin: '8px 0 0' }}>
            {props.decisionNotes}
          </Text>
        </Section>
      ) : null}

      <Text style={{ color: tokens.textPrimary, fontSize: 14, marginTop: 24 }}>
        <strong>Next step:</strong> {nextStep(decision, props.targetTitle, props.decidedBy)}
      </Text>

      {decision !== 'declined' ? (
        <Section style={{ marginTop: 16 }}>
          <Button href={props.previewUrl} style={previewButtonStyle}>
            Preview {props.targetTitle}
          </Button>
        </Section>
      ) : null}
    </EmailLayout>
  )
}
