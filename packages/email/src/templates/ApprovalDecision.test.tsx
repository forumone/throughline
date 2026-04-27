import { describe, expect, it } from 'vitest'
import { render } from '@react-email/render'
import { ApprovalDecisionEmail, type ApprovalDecisionKind } from './ApprovalDecision.js'
import { defaultTokens } from '../tokens.js'

const baseProps = {
  requesterName: 'Grace',
  decidedBy: 'Ada',
  targetTitle: 'Homepage',
  previewUrl: 'https://example.com/preview/abc',
  tokens: defaultTokens,
}

describe('ApprovalDecisionEmail', () => {
  it.each<ApprovalDecisionKind>(['granted', 'declined', 'changes-requested'])(
    'renders the %s headline',
    async (decision) => {
      const html = await render(ApprovalDecisionEmail({ ...baseProps, decision }))
      const headline = {
        granted: 'Approved',
        declined: 'Not approved',
        'changes-requested': 'Changes requested',
      }[decision]
      expect(html).toContain(headline)
      expect(html).toContain('Homepage')
    },
  )

  it('shows the preview button for granted and changes-requested', async () => {
    for (const decision of ['granted', 'changes-requested'] as ApprovalDecisionKind[]) {
      const html = await render(ApprovalDecisionEmail({ ...baseProps, decision }))
      expect(html).toContain('https://example.com/preview/abc')
    }
  })

  it('hides the preview button for declined decisions', async () => {
    const html = await render(ApprovalDecisionEmail({ ...baseProps, decision: 'declined' }))
    expect(html).not.toContain('https://example.com/preview/abc')
  })

  it('renders decisionNotes when supplied', async () => {
    const html = await render(
      ApprovalDecisionEmail({
        ...baseProps,
        decision: 'declined',
        decisionNotes: 'Headline still buries the lede.',
      }),
    )
    expect(html).toContain('Headline still buries the lede.')
    expect(html).toContain('Notes from')
  })

  it('omits the notes block when no decisionNotes are provided', async () => {
    const html = await render(ApprovalDecisionEmail({ ...baseProps, decision: 'granted' }))
    expect(html).not.toContain('Notes from')
  })

  it('produces a plaintext rendering with the next-step copy', async () => {
    const text = await render(
      ApprovalDecisionEmail({ ...baseProps, decision: 'granted' }),
      { plainText: true },
    )
    expect(text).toContain('Next step')
    expect(text).toContain('Homepage')
  })
})
