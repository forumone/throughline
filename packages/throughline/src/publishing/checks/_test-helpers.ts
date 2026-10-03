import type { ResolvedCollection } from '../options.js'

/** A resolved collection with default field names — sufficient for most check tests. */
export const defaultCollection: ResolvedCollection = {
  slug: 'pages',
  layoutField: 'layout',
  seoField: 'seo',
  policyField: 'policy',
  slugField: 'slug',
  publishedAtField: 'publishedAt',
  scheduledPublishField: 'scheduledPublishAt',
}
