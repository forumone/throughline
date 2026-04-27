import { Heading, Section, Text } from '@react-email/components'
import type { CSSProperties } from 'react'
import { FormsLayout } from './_layout.js'

export interface FormSubmissionField {
  field: string
  label?: string
  value: string
}

export interface FormSubmissionEmailProps {
  formTitle: string
  brandName: string
  receivedAt: string
  fields: FormSubmissionField[]
  /** Optional admin URL where the submission can be viewed in Payload. */
  adminUrl?: string
}

/**
 * Admin-facing notification sent to email destinations. Lays out submitted
 * fields in a labeled list rather than a table — tables have more cross-
 * client compatibility hazards than they're worth for a transactional
 * notification.
 */
export function FormSubmissionEmail(props: FormSubmissionEmailProps) {
  const labelStyle: CSSProperties = {
    color: '#52525B',
    fontSize: 12,
    fontWeight: 600,
    margin: '16px 0 4px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }
  const valueStyle: CSSProperties = {
    color: '#18181B',
    fontSize: 14,
    margin: 0,
    whiteSpace: 'pre-wrap',
  }
  const linkStyle: CSSProperties = {
    color: '#2563EB',
    fontSize: 14,
    textDecoration: 'underline',
  }

  return (
    <FormsLayout
      preview={`New submission for ${props.formTitle}`}
      brandName={props.brandName}
    >
      <Heading style={{ color: '#18181B', fontSize: 22, margin: 0 }}>
        New submission for {props.formTitle}
      </Heading>

      <Text style={{ color: '#52525B', fontSize: 14, marginTop: 8 }}>
        Received {props.receivedAt}.
      </Text>

      <Section>
        {props.fields.length === 0 ? (
          <Text style={{ color: '#52525B', fontSize: 14, marginTop: 16 }}>
            (No data submitted.)
          </Text>
        ) : (
          props.fields.map((field) => (
            <Section key={field.field}>
              <Text style={labelStyle}>{field.label ?? field.field}</Text>
              <Text style={valueStyle}>{field.value || '(empty)'}</Text>
            </Section>
          ))
        )}
      </Section>

      {props.adminUrl ? (
        <Section style={{ marginTop: 24 }}>
          <a href={props.adminUrl} style={linkStyle}>
            View in admin
          </a>
        </Section>
      ) : null}
    </FormsLayout>
  )
}
