import { describe, expect, it } from 'vitest'
import { render } from '@react-email/render'
import { ApprovalRequestEmail } from './ApprovalRequest.js'
import { defaultTokens, mergeTokens } from '../tokens.js'

const baseProps = {
  approverName: 'Ada',
  requesterName: 'Grace',
  targetTitle: 'Homepage',
  targetKind: 'page' as const,
  changesSummary: 'Tightened the headline and added a Stats block.',
  previewUrl: 'https://example.com/preview/abc',
  approveUrl: 'https://example.com/api/approvals/action?token=approve',
  changesUrl: 'https://example.com/api/approvals/action?token=changes',
  discussUrl: 'https://example.com/discuss',
  expiresAt: 'May 5, 2026',
  tokens: defaultTokens,
}

describe('ApprovalRequestEmail', () => {
  it('renders the requester, approver, target, and summary', async () => {
    const html = await render(ApprovalRequestEmail(baseProps))
    // React inserts `<!-- -->` markers between adjacent text + expression
    // children, so we assert on identity-bearing fragments rather than
    // verbatim sentences.
    expect(html).toContain('Ada')
    expect(html).toContain('Grace')
    expect(html).toContain('Homepage')
    expect(html).toContain('Tightened the headline and added a Stats block.')
    expect(html).toContain('May 5, 2026')
  })

  it('omits the "Why" section when no reason is provided', async () => {
    const html = await render(ApprovalRequestEmail(baseProps))
    expect(html).not.toContain('Why')
  })

  it('shows the "Why" section when requestReason is provided', async () => {
    const html = await render(
      ApprovalRequestEmail({ ...baseProps, requestReason: 'Marketing wants this live before launch.' }),
    )
    expect(html).toContain('Why')
    expect(html).toContain('Marketing wants this live before launch.')
  })

  it('wires the preview, approve, changes, and discuss URLs onto the right CTAs', async () => {
    const html = await render(ApprovalRequestEmail(baseProps))
    expect(html).toContain('https://example.com/preview/abc')
    expect(html).toContain('https://example.com/api/approvals/action?token=approve')
    expect(html).toContain('https://example.com/api/approvals/action?token=changes')
    expect(html).toContain('https://example.com/discuss')
  })

  it('themes via custom tokens (brand name + primary color)', async () => {
    const tokens = mergeTokens({ brandName: 'Acme Foundation', brandPrimary: '#FF00AA' })
    const html = await render(ApprovalRequestEmail({ ...baseProps, tokens }))
    expect(html).toContain('Acme Foundation')
    expect(html.toLowerCase()).toContain('#ff00aa')
  })

  it('produces plaintext output that includes the summary and decision URLs', async () => {
    const text = await render(ApprovalRequestEmail(baseProps), { plainText: true })
    expect(text).toContain('Tightened the headline and added a Stats block.')
    expect(text).toContain('https://example.com/api/approvals/action?token=approve')
    expect(text).toContain('https://example.com/preview/abc')
  })
})
