import type { ComponentContract } from '@forumone/throughline-design-contract'
import type { Matcher, RankedComponent } from './types.js'

/**
 * Simple TF-IDF matcher over component search documents. Indexed once at
 * factory time; subsequent `rank()` calls scan the precomputed index.
 *
 * The search document weights `intent` more than `description`, and includes
 * variant `whenToUse` text + example intents. Editorial language often shows
 * up in those fields, so weighting them helps real intents like "introduce
 * a new program" find the Hero's `intent` rather than its name.
 */
export function createTfidfMatcher(components: ComponentContract[]): Matcher {
  const index = components.map((component) => {
    const document = makeSearchDocument(component)
    const tokens = tokenize(document)
    const termFreq = new Map<string, number>()
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1)
    }
    return { component, terms: termFreq, length: Math.max(tokens.length, 1) }
  })

  const docCount = index.length
  const docFreq = new Map<string, number>()
  for (const entry of index) {
    for (const term of entry.terms.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1)
    }
  }
  const idf = new Map<string, number>()
  for (const [term, df] of docFreq) {
    idf.set(term, Math.log((docCount + 1) / (df + 1)) + 1)
  }

  return {
    rank(query: string): RankedComponent[] {
      const queryCounts = new Map<string, number>()
      for (const token of tokenize(query)) {
        queryCounts.set(token, (queryCounts.get(token) ?? 0) + 1)
      }

      const scored: RankedComponent[] = index.map((entry) => {
        let score = 0
        for (const [term, queryCount] of queryCounts) {
          const docCountForTerm = entry.terms.get(term) ?? 0
          if (docCountForTerm === 0) continue
          const tf = docCountForTerm / entry.length
          const termIdf = idf.get(term) ?? 0
          score += tf * termIdf * queryCount
        }
        return { component: entry.component, score }
      })

      scored.sort((a, b) => b.score - a.score)
      return scored
    },
  }
}

function makeSearchDocument(component: ComponentContract): string {
  const parts: string[] = [
    // Intent and description are the most-weighted fields. Repeat the intent
    // twice so it dominates rankings when its terms match.
    component.intent,
    component.intent,
    component.description,
    component.name,
    ...(component.content.variants ?? []).flatMap((v) => [v.name, v.whenToUse]),
    ...component.examples.map((e) => e.intent),
  ]
  return parts.join(' ')
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'have',
  'has',
  'had',
  'are',
  'was',
  'were',
  'been',
  'being',
  'will',
  'would',
  'should',
  'could',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'these',
  'those',
  'its',
  'use',
  'used',
  'using',
  'when',
  'where',
  'how',
  'what',
  'which',
  'into',
  'onto',
  'than',
  'then',
  'them',
  'they',
  'their',
  'there',
])
