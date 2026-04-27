import { Heading, Text } from '@react-email/components'
import { FormsLayout } from './_layout.js'

export interface SubmitterConfirmationEmailProps {
  /** Free-form recipient name (or `"there"` if unknown). */
  recipientName: string
  brandName: string
  /** Per-form subject line; the configured fallback is "Thank you for your submission". */
  subject: string
  /** Per-form body. Multi-paragraph; rendered as plain prose preserving line breaks. */
  body: string
}

/**
 * Submitter-facing auto-reply. Intentionally minimal: a greeting, the
 * configured body, and a brand-named footer. The `body` is operator-
 * authored copy from the form admin; this template treats it as trusted
 * (admin-edited) content but renders it as plaintext — `body` strings
 * containing HTML render literally rather than as markup.
 */
export function SubmitterConfirmationEmail(props: SubmitterConfirmationEmailProps) {
  return (
    <FormsLayout preview={props.subject} brandName={props.brandName}>
      <Heading style={{ color: '#18181B', fontSize: 22, margin: 0 }}>
        {props.subject}
      </Heading>

      <Text style={{ color: '#18181B', fontSize: 16, marginTop: 16 }}>
        Hi {props.recipientName},
      </Text>

      {(props.body || '').split(/\n{2,}/).map((paragraph, idx) => (
        <Text
          key={idx}
          style={{ color: '#18181B', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
        >
          {paragraph}
        </Text>
      ))}
    </FormsLayout>
  )
}
