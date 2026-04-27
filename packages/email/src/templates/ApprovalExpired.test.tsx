import { describe, expect, it } from 'vitest'
import { render } from '@react-email/render'
import { ApprovalExpiredEmail } from './ApprovalExpired.js'
import { defaultTokens } from '../tokens.js'

describe('ApprovalExpiredEmail', () => {
  it('renders the requester, target, and original request date', async () => {
    const html = await render(
      ApprovalExpiredEmail({
        requesterName: 'Grace',
        targetTitle: 'Homepage',
        requestedAt: 'Apr 15, 2026',
        tokens: defaultTokens,
      }),
    )
    expect(html).toContain('Grace')
    expect(html).toContain('Homepage')
    expect(html).toContain('Apr 15, 2026')
    expect(html).toContain('expired without a decision')
  })

  it('produces plaintext output that mentions re-requesting', async () => {
    const text = await render(
      ApprovalExpiredEmail({
        requesterName: 'Grace',
        targetTitle: 'Homepage',
        requestedAt: 'Apr 15, 2026',
        tokens: defaultTokens,
      }),
      { plainText: true },
    )
    expect(text).toContain('request approval again')
  })
})
