import { describe, expect, it } from 'vitest'
import { render } from '@react-email/render'
import { FormSubmissionEmail } from './FormSubmission.js'
import { SubmitterConfirmationEmail } from './SubmitterConfirmation.js'

describe('FormSubmissionEmail', () => {
  it('renders the form title, received-at, and each field', async () => {
    const html = await render(
      FormSubmissionEmail({
        formTitle: 'Contact us',
        brandName: 'Acme',
        receivedAt: 'Apr 22, 2026',
        fields: [
          { field: 'name', label: 'Name', value: 'Ada' },
          { field: 'message', label: 'Message', value: 'Hi there.' },
        ],
      }),
    )
    expect(html).toContain('Contact us')
    expect(html).toContain('Apr 22, 2026')
    expect(html).toContain('Ada')
    expect(html).toContain('Hi there.')
  })

  it('falls back to the field name when no label is provided', async () => {
    const html = await render(
      FormSubmissionEmail({
        formTitle: 'X',
        brandName: 'Acme',
        receivedAt: 'now',
        fields: [{ field: 'phone_number', value: '555-0100' }],
      }),
    )
    expect(html).toContain('phone_number')
  })

  it('shows "(empty)" for blank values', async () => {
    const html = await render(
      FormSubmissionEmail({
        formTitle: 'X',
        brandName: 'Acme',
        receivedAt: 'now',
        fields: [{ field: 'name', label: 'Name', value: '' }],
      }),
    )
    expect(html).toContain('(empty)')
  })

  it('renders an admin link when adminUrl is provided', async () => {
    const html = await render(
      FormSubmissionEmail({
        formTitle: 'X',
        brandName: 'Acme',
        receivedAt: 'now',
        fields: [],
        adminUrl: 'https://admin.example.com/forms/1',
      }),
    )
    expect(html).toContain('https://admin.example.com/forms/1')
  })

  it('produces plaintext output that preserves field labels and values', async () => {
    const text = await render(
      FormSubmissionEmail({
        formTitle: 'Contact us',
        brandName: 'Acme',
        receivedAt: 'Apr 22, 2026',
        fields: [{ field: 'name', label: 'Name', value: 'Ada' }],
      }),
      { plainText: true },
    )
    expect(text).toContain('Name')
    expect(text).toContain('Ada')
  })
})

describe('SubmitterConfirmationEmail', () => {
  it('renders the subject as headline and splits body into paragraphs', async () => {
    const html = await render(
      SubmitterConfirmationEmail({
        recipientName: 'Ada',
        brandName: 'Acme',
        subject: 'Thanks for reaching out',
        body: 'We received your message.\n\nWe will respond within two business days.',
      }),
    )
    expect(html).toContain('Thanks for reaching out')
    expect(html).toContain('Ada')
    expect(html).toContain('We received your message.')
    expect(html).toContain('within two business days.')
  })

  it('handles an empty body without crashing', async () => {
    const html = await render(
      SubmitterConfirmationEmail({
        recipientName: 'Ada',
        brandName: 'Acme',
        subject: 'Thanks',
        body: '',
      }),
    )
    expect(html).toContain('Thanks')
    expect(html).toContain('Ada')
  })
})
