/**
 * Brand tokens that drive every template's appearance. Core ships neutral
 * defaults (black on white, system sans, "Your Site"); deployments override
 * via `emailPlugin({ tokens })` to swap in their brand identity. Forum One
 * colors do not live here — every consuming agency or product team supplies
 * their own.
 */
export interface EmailBrandTokens {
  /** Primary brand color used for affirmative buttons (Approve, Preview). */
  brandPrimary: string
  /** Hover/active state for the primary brand color. Reserved; not used by
   *  the layout itself but available for richer templates. */
  brandPrimaryHover: string
  /** Optional accent color for secondary highlights. */
  brandAccent?: string
  /** Default body text color. */
  textPrimary: string
  /** Muted text color (labels, footer, helper copy). */
  textSecondary: string
  /** Email card background. */
  bgPrimary: string
  /** Subdued background used for callout sections. */
  bgSecondary: string
  /** Border color for hairlines and box outlines. */
  border: string
  /** Font stack passed to the layout's body. */
  fontFamilySans: string
  /**
   * Display name used in three places: the layout header, the From name
   * (when EMAIL_FROM_NAME is unset), and the layout footer disclaimer.
   * Keeps "this came from <site>" consistent across every email.
   */
  brandName: string
  /** Optional logo URL shown in the layout header. Reserved for future use. */
  logoUrl?: string
}

export const defaultTokens: EmailBrandTokens = {
  brandPrimary: '#2563EB',
  brandPrimaryHover: '#1D4ED8',
  textPrimary: '#18181B',
  textSecondary: '#52525B',
  bgPrimary: '#FFFFFF',
  bgSecondary: '#FAFAFA',
  border: '#E4E4E7',
  fontFamilySans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  brandName: 'Your Site',
}

export function mergeTokens(overrides?: Partial<EmailBrandTokens>): EmailBrandTokens {
  if (!overrides) return defaultTokens
  return { ...defaultTokens, ...overrides }
}
