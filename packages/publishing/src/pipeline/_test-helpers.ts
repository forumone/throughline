import type { Inngest } from 'inngest'
import { vi } from 'vitest'
import type { Payload } from 'payload'
import type {
  PublishingPluginOptions,
  ResolvedCollection,
} from '../options.js'
import type { PipelineContext } from './types.js'

export const defaultCollection: ResolvedCollection = {
  slug: 'pages',
  layoutField: 'layout',
  seoField: 'seo',
  policyField: 'policy',
  slugField: 'slug',
  publishedAtField: 'publishedAt',
  scheduledPublishField: 'scheduledPublishAt',
}

export function makeContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const payloadUpdate = vi.fn(async () => ({ id: 'p1' }))
  const inngestSend = vi.fn(async () => ({}))

  const payload = { update: payloadUpdate } as unknown as Payload
  const inngest = { send: inngestSend } as unknown as Inngest

  const baseOptions: PublishingPluginOptions = {
    collections: [{ slug: defaultCollection.slug }],
    inngest,
    ...(overrides.options ?? {}),
  }

  return {
    payload: overrides.payload ?? payload,
    inngest: overrides.inngest ?? inngest,
    options: overrides.options ?? baseOptions,
    collection: overrides.collection ?? defaultCollection,
    document: overrides.document ?? {},
    documentId: overrides.documentId ?? 'p1',
    actor: overrides.actor ?? {
      user: { id: 'u1', email: 'tester@example.com', name: 'Tester', roles: ['admin'], groups: [] },
      apiKeyName: 'test',
    },
    ...(overrides.meta ? { meta: overrides.meta } : {}),
  }
}

export function attachComponentValidator(
  payload: Payload,
  validator: (input: { blocks: Array<{ type: string; variant?: string }> }) => Promise<{
    valid: boolean
    issues: Array<{ severity: 'error' | 'warning'; rule: string; message: string; blockIndex?: number }>
  }> | {
    valid: boolean
    issues: Array<{ severity: 'error' | 'warning'; rule: string; message: string; blockIndex?: number }>
  },
) {
  const symbol = Symbol.for('@forumone/throughline/components-validator')
  Object.defineProperty(payload, symbol, {
    value: validator,
    enumerable: false,
    writable: true,
    configurable: true,
  })
}
