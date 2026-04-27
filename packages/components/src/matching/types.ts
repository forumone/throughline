import type { ComponentContract } from '@forumone/throughline-design-contract'

export interface RankedComponent {
  component: ComponentContract
  score: number
}

export interface Matcher {
  /** Returns the indexed components ranked best-first against the query. */
  rank(query: string): RankedComponent[]
}

/**
 * Surface returned by {@link suggest_for_intent}. Same shape regardless of the
 * underlying matcher.
 */
export interface RankedSuggestion {
  component: string
  score: number
  reasoning: string
  matchedIntent: string
  variant?: string
  warnings?: string[]
}
