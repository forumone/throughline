# Phase C6 — Publishing Server

## Goal

Build `@forumone/claude-cms-publishing` — the trust boundary of the framework. Wraps Payload's update operation with a policy-gated publish pipeline: composition validation, accessibility checks, required field checks, embargo enforcement, approval gating, and downstream event orchestration. Claude calls `publishing.publish(pageId)` rather than directly flipping `_status` in Payload, which is blocked at the Payload layer.

## Prerequisites

- C4 complete; core plumbing with audit log
- C5 complete; Component Server for composition validation

## Context

Without this server, Claude can publish anything by directly updating Payload. This is the wrong default. Publishing is consequential — it pushes content to the public site, triggers integrations, ships to caches, and may carry legal or compliance implications. The Publishing Server is the only sanctioned path to published state.

The key architectural principle: **Claude drafts freely, publishes deliberately**. Drafts are low-stakes — Claude can update draft content via Payload MCP without any ceremony. Publishing crosses a line that requires explicit validation and audit.

The pipeline is rigid by design. Every publish runs the same ordered steps:

1. Exist — the document must exist and not already be published to this version
2. Compose — composition rules pass (via Component Server)
3. Access — accessibility checks pass (alt text, heading hierarchy, link labels)
4. Complete — required fields are populated
5. Permit — embargo hasn't expired, expiration hasn't passed
6. Approve — if policy requires approval, a granted approval exists
7. Execute — write `_status: published`, set `publishedAt`, fire events

Each step can halt the pipeline with a clear, actionable error. Claude relays these to the marketer with specific guidance on what to fix.

The Publishing Server is client-agnostic by taking configuration:

- **Which collections are publishable** (Pages, Posts, or whatever the client has)
- **Accessibility checkers** (functions the client provides for custom checks beyond the built-ins)
- **Approval resolver** (function that returns the active approval for a document)
- **Event emitter** (Inngest client for firing `content/page.published`)

## Tasks

### C6.1 — Scaffold the package

```
packages/publishing/
├── src/
│   ├── plugin.ts
│   ├── options.ts
│   ├── pipeline/
│   │   ├── index.ts
│   │   ├── steps/
│   │   │   ├── exist.ts
│   │   │   ├── composition.ts
│   │   │   ├── accessibility.ts
│   │   │   ├── required-fields.ts
│   │   │   ├── embargo.ts
│   │   │   ├── approval.ts
│   │   │   └── execute.ts
│   │   └── types.ts
│   ├── checks/
│   │   ├── alt-text.ts
│   │   ├── heading-hierarchy.ts
│   │   ├── link-labels.ts
│   │   └── index.ts
│   ├── tools/
│   │   ├── publish.ts
│   │   ├── unpublish.ts
│   │   ├── schedule-publish.ts
│   │   ├── get-publish-status.ts
│   │   ├── rollback.ts
│   │   └── index.ts
│   ├── hooks/
│   │   └── block-status-writes.ts
│   └── index.ts
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── CHANGELOG.md
```

`package.json`:

```json
{
  "name": "@forumone/claude-cms-publishing",
  "version": "0.1.0",
  "description": "Policy-gated publishing server for the Claude-First CMS framework.",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./checks": { "types": "./dist/checks/index.d.ts", "default": "./dist/checks/index.js" }
  },
  "files": ["dist", "README.md", "CHANGELOG.md"],
  "scripts": {
    "build": "tsc -b",
    "dev": "tsc -b -w",
    "clean": "rm -rf dist .turbo",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint src",
    "test": "vitest run"
  },
  "peerDependencies": {
    "payload": "^3.0.0",
    "inngest": "^3.0.0"
  },
  "dependencies": {
    "@forumone/claude-cms-core": "workspace:*",
    "@forumone/claude-cms-plugin-contract": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@forumone/claude-cms-tsconfig": "workspace:*",
    "@forumone/claude-cms-eslint-config": "workspace:*",
    "inngest": "^3.0.0",
    "payload": "^3.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

### C6.2 — Define the plugin options

`src/options.ts`:

```typescript
import { z } from 'zod'
import type { BaseCorePluginOptions } from '@forumone/claude-cms-plugin-contract'
import type { Payload } from 'payload'
import type { Inngest } from 'inngest'

export interface PublishableCollection {
  /** Slug of the collection that can be published through this server. */
  slug: string
  /** Field name on the document that contains the composition blocks. Default: 'layout'. */
  layoutField?: string
  /** Field name for the SEO group. Used for required-field checks. Default: 'seo'. */
  seoField?: string
  /** Field name for the policy group (requiresApproval, embargo, etc.). Default: 'policy'. */
  policyField?: string
  /** Field name for the slug. Default: 'slug'. */
  slugField?: string
  /** Field name for publishedAt date. Default: 'publishedAt'. */
  publishedAtField?: string
  /** Field name for scheduledPublishAt. Default: 'scheduledPublishAt'. */
  scheduledPublishField?: string
  /** Required fields beyond the built-in SEO checks. */
  requiredFields?: Array<{ path: string; message: string }>
}

export interface AccessibilityCheck {
  name: string
  run: (doc: Record<string, unknown>, collection: PublishableCollection) => Promise<AccessibilityIssue[]>
}

export interface AccessibilityIssue {
  field?: string
  message: string
  severity: 'error' | 'warning'
}

export interface ApprovalResolver {
  /** Returns the active granted approval for this document, or null. */
  getActiveApproval: (collection: string, id: string, version: string) => Promise<ActiveApproval | null>
}

export interface ActiveApproval {
  id: string
  grantedAt: string
  grantedBy: string
  version: string
}

export interface PublishingPluginOptions extends BaseCorePluginOptions {
  /** Which collections are publishable through this server. */
  collections: PublishableCollection[]
  /** Additional accessibility checks beyond the built-ins. */
  accessibilityChecks?: AccessibilityCheck[]
  /** Resolver for checking approval state. If not provided, approval checks always pass. */
  approvalResolver?: ApprovalResolver
  /** Inngest client for firing publishing events. Required. */
  inngest: Inngest
}

export const PublishableCollectionSchema = z.object({
  slug: z.string(),
  layoutField: z.string().optional(),
  seoField: z.string().optional(),
  policyField: z.string().optional(),
  slugField: z.string().optional(),
  publishedAtField: z.string().optional(),
  scheduledPublishField: z.string().optional(),
  requiredFields: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
})

export function validateOptions(options: PublishingPluginOptions): PublishingPluginOptions {
  if (!options.collections || options.collections.length === 0) {
    throw new Error('publishingPlugin requires at least one collection in options.collections')
  }
  if (!options.inngest) {
    throw new Error('publishingPlugin requires an Inngest client in options.inngest')
  }
  for (const collection of options.collections) {
    const result = PublishableCollectionSchema.safeParse(collection)
    if (!result.success) {
      throw new Error(`Invalid collection config: ${result.error.message}`)
    }
  }
  return options
}

export function resolveCollection(
  options: PublishingPluginOptions,
  slug: string,
): Required<Omit<PublishableCollection, 'requiredFields'>> & Pick<PublishableCollection, 'requiredFields'> {
  const config = options.collections.find((c) => c.slug === slug)
  if (!config) {
    throw new Error(
      `Collection "${slug}" is not registered as publishable. Add it to publishingPlugin's collections option.`,
    )
  }
  return {
    slug: config.slug,
    layoutField: config.layoutField ?? 'layout',
    seoField: config.seoField ?? 'seo',
    policyField: config.policyField ?? 'policy',
    slugField: config.slugField ?? 'slug',
    publishedAtField: config.publishedAtField ?? 'publishedAt',
    scheduledPublishField: config.scheduledPublishField ?? 'scheduledPublishAt',
    requiredFields: config.requiredFields,
  }
}
```

### C6.3 — Define pipeline types

`src/pipeline/types.ts`:

```typescript
import type { Payload } from 'payload'
import type { Inngest } from 'inngest'
import type { PublishingPluginOptions, PublishableCollection } from '../options'
import type { AuthenticatedUser } from '@forumone/claude-cms-plugin-contract'

export interface PipelineContext {
  payload: Payload
  inngest: Inngest
  options: PublishingPluginOptions
  collection: Required<Omit<PublishableCollection, 'requiredFields'>> & Pick<PublishableCollection, 'requiredFields'>
  document: Record<string, unknown>
  documentId: string
  actor: { user: AuthenticatedUser | null; apiKeyName: string; sessionId?: string }
  meta?: { userPrompt?: string; reasoning?: string; changesSummary?: string }
}

export interface PipelineStepResult {
  pass: boolean
  reason?: string
  code?: string
  issues?: Array<{ field?: string; message: string; severity: 'error' | 'warning' }>
  suggestion?: string
}

export type PipelineStep = (context: PipelineContext) => Promise<PipelineStepResult>

export interface PipelineResult {
  success: boolean
  failedAt?: string
  reason?: string
  code?: string
  issues?: Array<{ field?: string; message: string; severity: 'error' | 'warning' }>
  suggestion?: string
  publishedAt?: string
  url?: string
}
```

### C6.4 — Build the pipeline steps

`src/pipeline/steps/exist.ts`:

```typescript
import type { PipelineStep } from '../types'

export const existStep: PipelineStep = async (ctx) => {
  if (!ctx.document) {
    return { pass: false, code: 'not-found', reason: 'Document not found' }
  }

  const isPublished = ctx.document._status === 'published'
  const hasChanges = hasUnpublishedChanges(ctx.document)

  if (isPublished && !hasChanges) {
    return {
      pass: false,
      code: 'already-published',
      reason: 'Document is already published and has no unpublished changes',
    }
  }

  return { pass: true }
}

function hasUnpublishedChanges(doc: Record<string, unknown>): boolean {
  // Payload exposes `_isPublishedVersion` or similar; the exact field depends
  // on how Payload tracks drafts. Check the updatedAt vs publishedAt as a fallback.
  const updatedAt = doc.updatedAt ? new Date(doc.updatedAt as string).getTime() : 0
  const publishedAt = doc.publishedAt ? new Date(doc.publishedAt as string).getTime() : 0
  return updatedAt > publishedAt
}
```

`src/pipeline/steps/composition.ts`:

```typescript
import type { PipelineStep } from '../types'

/**
 * Validates composition by calling the Component Server's validation endpoint.
 * The Component Server must be registered in the same Payload instance.
 */
export const compositionStep: PipelineStep = async (ctx) => {
  const layout = ctx.document[ctx.collection.layoutField] as
    | Array<{ blockType: string; variant?: string }>
    | undefined

  if (!layout || layout.length === 0) {
    return { pass: true } // empty layouts don't trigger composition checks
  }

  // Call the Component Server's composition validator via the plugin registry.
  // The ComponentServer plugin registers a `validateComposition` capability
  // that we invoke here. Alternatively, call the MCP endpoint directly.
  const blocks = layout.map((b) => ({ type: b.blockType, variant: b.variant }))

  // In the concrete implementation, get the component server's validate
  // function via a symbol the components plugin attaches to payload.
  // For simplicity, do an internal HTTP call to the MCP endpoint.
  const result = await callComponentServerValidate(ctx, blocks)

  if (!result.valid) {
    const errors = result.issues.filter((i) => i.severity === 'error')
    return {
      pass: false,
      code: 'composition-errors',
      reason: `${errors.length} composition error${errors.length === 1 ? '' : 's'}`,
      issues: errors,
      suggestion:
        'Fix the composition errors listed. Common causes: duplicate Heroes, forbidden adjacent blocks, or unknown component types.',
    }
  }

  return { pass: true }
}

async function callComponentServerValidate(
  ctx: import('../types').PipelineContext,
  blocks: Array<{ type: string; variant?: string }>,
): Promise<{ valid: boolean; issues: Array<{ message: string; severity: 'error' | 'warning'; rule: string }> }> {
  // Resolve the components plugin's validator via the registry.
  // See C5.10 — components plugin attaches the validator to payload via symbol.
  const symbol = Symbol.for('@forumone/claude-cms/components-validator')
  const validator = (ctx.payload as unknown as Record<symbol, unknown>)[symbol] as
    | ((input: { blocks: typeof blocks }) => Promise<{ valid: boolean; issues: Array<{ message: string; severity: 'error' | 'warning'; rule: string }> }>)
    | undefined

  if (!validator) {
    throw new Error(
      'Components plugin validator not available. Ensure componentsPlugin is registered before publishingPlugin.',
    )
  }

  return validator({ blocks })
}
```

Note: this assumes C5's plugin will also expose its `validateComposition` function via a symbol for internal use by other plugins. Add that to C5's `onInit` as a minor addition.

`src/pipeline/steps/accessibility.ts`:

```typescript
import type { PipelineStep } from '../types'
import { altTextCheck, headingHierarchyCheck, linkLabelsCheck } from '../../checks'

const BUILT_IN_CHECKS = [altTextCheck, headingHierarchyCheck, linkLabelsCheck]

export const accessibilityStep: PipelineStep = async (ctx) => {
  const checks = [...BUILT_IN_CHECKS, ...(ctx.options.accessibilityChecks ?? [])]

  const allIssues = []
  for (const check of checks) {
    const issues = await check.run(ctx.document, ctx.collection)
    allIssues.push(...issues)
  }

  const errors = allIssues.filter((i) => i.severity === 'error')
  if (errors.length > 0) {
    return {
      pass: false,
      code: 'accessibility-errors',
      reason: `${errors.length} accessibility issue${errors.length === 1 ? '' : 's'}`,
      issues: errors,
      suggestion:
        'Every image needs alt text. Every link needs a label. Heading levels must not skip. Fix these before publishing.',
    }
  }

  return { pass: true }
}
```

`src/pipeline/steps/required-fields.ts`:

```typescript
import type { PipelineStep } from '../types'

export const requiredFieldsStep: PipelineStep = async (ctx) => {
  const issues: Array<{ field?: string; message: string; severity: 'error' | 'warning' }> = []

  // Check SEO fields — required for every publish
  const seo = ctx.document[ctx.collection.seoField] as Record<string, unknown> | undefined
  if (!seo?.title) {
    issues.push({ field: `${ctx.collection.seoField}.title`, message: 'SEO title is required', severity: 'error' })
  }
  if (!seo?.description) {
    issues.push({
      field: `${ctx.collection.seoField}.description`,
      message: 'SEO description is required',
      severity: 'error',
    })
  }

  // Check slug
  if (!ctx.document[ctx.collection.slugField]) {
    issues.push({ field: ctx.collection.slugField, message: 'Slug is required', severity: 'error' })
  }

  // Check collection-specific required fields
  for (const required of ctx.collection.requiredFields ?? []) {
    const value = getPath(ctx.document, required.path)
    if (value === null || value === undefined || value === '') {
      issues.push({ field: required.path, message: required.message, severity: 'error' })
    }
  }

  if (issues.length > 0) {
    return {
      pass: false,
      code: 'required-fields-missing',
      reason: `${issues.length} required field${issues.length === 1 ? '' : 's'} missing`,
      issues,
      suggestion: 'Fill in the missing fields and try again.',
    }
  }

  return { pass: true }
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[segment]
    }
    return undefined
  }, obj)
}
```

`src/pipeline/steps/embargo.ts`:

```typescript
import type { PipelineStep } from '../types'

export const embargoStep: PipelineStep = async (ctx) => {
  const policy = ctx.document[ctx.collection.policyField] as Record<string, unknown> | undefined
  if (!policy) return { pass: true }

  if (policy.embargoedUntil) {
    const embargo = new Date(policy.embargoedUntil as string)
    if (embargo > new Date()) {
      return {
        pass: false,
        code: 'embargoed',
        reason: `Embargoed until ${embargo.toISOString()}`,
        suggestion:
          'Either wait until the embargo expires, update the embargoedUntil date, or schedule publish for after the embargo.',
      }
    }
  }

  if (policy.expiresAt) {
    const expiry = new Date(policy.expiresAt as string)
    if (expiry < new Date()) {
      return {
        pass: false,
        code: 'expired',
        reason: `Content expired on ${expiry.toISOString()}`,
        suggestion: 'Update the expiresAt date or unpublish this content.',
      }
    }
  }

  return { pass: true }
}
```

`src/pipeline/steps/approval.ts`:

```typescript
import type { PipelineStep } from '../types'

export const approvalStep: PipelineStep = async (ctx) => {
  const policy = ctx.document[ctx.collection.policyField] as Record<string, unknown> | undefined
  if (!policy?.requiresApproval) return { pass: true }

  if (!ctx.options.approvalResolver) {
    // Policy requires approval but no resolver is configured. Fail closed.
    return {
      pass: false,
      code: 'approval-resolver-missing',
      reason: 'Document requires approval but no approval resolver is configured',
      suggestion:
        'Add the approvalsPlugin to your Payload config and pass its resolver to publishingPlugin.approvalResolver.',
    }
  }

  const versionId = String(ctx.document.updatedAt ?? ctx.document.id)
  const approval = await ctx.options.approvalResolver.getActiveApproval(
    ctx.collection.slug,
    ctx.documentId,
    versionId,
  )

  if (!approval) {
    return {
      pass: false,
      code: 'approval-required',
      reason: 'This document requires approval and no granted approval exists for the current version',
      suggestion:
        'Use the Approvals Server to request approval. Once granted, publish will succeed.',
    }
  }

  return { pass: true }
}
```

`src/pipeline/steps/execute.ts`:

```typescript
import type { PipelineStep } from '../types'

export const executeStep: PipelineStep = async (ctx) => {
  const now = new Date().toISOString()
  const wasFirstPublish = !ctx.document[ctx.collection.publishedAtField]
  const previousPublishedAt = ctx.document[ctx.collection.publishedAtField] as string | null | undefined

  await ctx.payload.update({
    collection: ctx.collection.slug,
    id: ctx.documentId,
    data: {
      _status: 'published',
      [ctx.collection.publishedAtField]: now,
    },
    context: { internal: true, bypassPublishingServer: true }, // signal to beforeChange hook
  })

  // Fire the event
  await ctx.inngest.send({
    name: 'content/page.published',
    data: {
      collection: ctx.collection.slug,
      id: ctx.documentId,
      slug: String(ctx.document[ctx.collection.slugField] ?? ctx.documentId),
      publishedBy: ctx.actor.user?.id ?? 'system',
      previousPublishedAt: previousPublishedAt ?? null,
      isFirstPublish: wasFirstPublish,
    },
  })

  return { pass: true }
}
```

### C6.5 — Build the pipeline runner

`src/pipeline/index.ts`:

```typescript
import { existStep } from './steps/exist'
import { compositionStep } from './steps/composition'
import { accessibilityStep } from './steps/accessibility'
import { requiredFieldsStep } from './steps/required-fields'
import { embargoStep } from './steps/embargo'
import { approvalStep } from './steps/approval'
import { executeStep } from './steps/execute'
import type { PipelineContext, PipelineResult, PipelineStep } from './types'

const ORDERED_STEPS: Array<{ name: string; step: PipelineStep }> = [
  { name: 'exist', step: existStep },
  { name: 'composition', step: compositionStep },
  { name: 'accessibility', step: accessibilityStep },
  { name: 'required-fields', step: requiredFieldsStep },
  { name: 'embargo', step: embargoStep },
  { name: 'approval', step: approvalStep },
  { name: 'execute', step: executeStep },
]

export async function runPublishPipeline(context: PipelineContext): Promise<PipelineResult> {
  for (const { name, step } of ORDERED_STEPS) {
    const result = await step(context)
    if (!result.pass) {
      return {
        success: false,
        failedAt: name,
        reason: result.reason,
        code: result.code,
        issues: result.issues,
        suggestion: result.suggestion,
      }
    }
  }

  const publishedAt = new Date().toISOString()
  return {
    success: true,
    publishedAt,
  }
}

/** Runs the pipeline up to but not including execute; for get_publish_status. */
export async function runPreflightPipeline(context: PipelineContext): Promise<PipelineResult> {
  const preflightSteps = ORDERED_STEPS.filter((s) => s.name !== 'execute')
  for (const { name, step } of preflightSteps) {
    const result = await step(context)
    if (!result.pass) {
      return {
        success: false,
        failedAt: name,
        reason: result.reason,
        code: result.code,
        issues: result.issues,
        suggestion: result.suggestion,
      }
    }
  }
  return { success: true }
}

export * from './types'
```

### C6.6 — Build the accessibility checks

`src/checks/alt-text.ts`:

```typescript
import type { AccessibilityCheck } from '../options'

export const altTextCheck: AccessibilityCheck = {
  name: 'alt-text',
  async run(doc) {
    const issues = []
    walkForImages(doc, (image, path) => {
      if (!image.alt || String(image.alt).trim() === '') {
        issues.push({ field: path, message: `Image at ${path} is missing alt text`, severity: 'error' as const })
      }
    })
    return issues
  },
}

function walkForImages(
  value: unknown,
  visit: (image: { alt?: unknown }, path: string) => void,
  path = '',
): void {
  if (!value || typeof value !== 'object') return

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walkForImages(value[i], visit, `${path}[${i}]`)
    }
    return
  }

  const obj = value as Record<string, unknown>

  // Heuristic: treat an object with `url` and/or `filename` and/or `mimeType`
  // starting with 'image/' as an image.
  if (typeof obj.url === 'string' || typeof obj.filename === 'string') {
    const mime = obj.mimeType as string | undefined
    if (!mime || mime.startsWith('image/')) {
      visit(obj as { alt?: unknown }, path)
    }
  }

  for (const key of Object.keys(obj)) {
    walkForImages(obj[key], visit, path ? `${path}.${key}` : key)
  }
}
```

`src/checks/heading-hierarchy.ts`:

```typescript
import type { AccessibilityCheck } from '../options'

export const headingHierarchyCheck: AccessibilityCheck = {
  name: 'heading-hierarchy',
  async run(doc, collection) {
    const issues = []
    const layout = doc[collection.layoutField ?? 'layout'] as Array<{ blockType: string }> | undefined
    if (!layout) return issues

    // Structural heuristic: Hero = h1, SectionIntro = h2, Card headings = h3.
    // Multiple h1s or a page without an h1 is flagged. Full heading analysis
    // requires rendering; this is a structural proxy that's useful without it.
    const heroCount = layout.filter((b) => b.blockType === 'hero').length
    if (heroCount > 1) {
      issues.push({
        message: `Page has ${heroCount} Hero blocks but should have exactly one (becomes h1)`,
        severity: 'error' as const,
      })
    }

    return issues
  },
}
```

`src/checks/link-labels.ts`:

```typescript
import type { AccessibilityCheck } from '../options'

export const linkLabelsCheck: AccessibilityCheck = {
  name: 'link-labels',
  async run(doc) {
    const issues = []
    walkForLinks(doc, (link, path) => {
      const hasUrl = typeof link.url === 'string' && link.url.trim() !== ''
      const hasLabel = typeof link.label === 'string' && link.label.trim() !== ''
      if (hasUrl && !hasLabel) {
        issues.push({ field: path, message: `Link at ${path} has a URL but no label`, severity: 'error' as const })
      }
    })
    return issues
  },
}

function walkForLinks(
  value: unknown,
  visit: (link: { url?: unknown; label?: unknown }, path: string) => void,
  path = '',
): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) walkForLinks(value[i], visit, `${path}[${i}]`)
    return
  }
  const obj = value as Record<string, unknown>
  if ('url' in obj && 'label' in obj) {
    visit(obj as { url?: unknown; label?: unknown }, path)
  }
  for (const key of Object.keys(obj)) {
    walkForLinks(obj[key], visit, path ? `${path}.${key}` : key)
  }
}
```

`src/checks/index.ts`:

```typescript
export { altTextCheck } from './alt-text'
export { headingHierarchyCheck } from './heading-hierarchy'
export { linkLabelsCheck } from './link-labels'
```

### C6.7 — Block direct status writes

`src/hooks/block-status-writes.ts`:

```typescript
import type { CollectionBeforeChangeHook } from 'payload'

/**
 * Payload hook that rejects any update touching `_status` unless the request
 * explicitly comes from the Publishing Server.
 */
export function createBlockStatusWritesHook(): CollectionBeforeChangeHook {
  return async ({ data, originalDoc, operation, context }) => {
    if (operation !== 'update') return data
    if (!data._status) return data

    // If the Publishing Server's execute step is running, it sets this context flag.
    if (context?.bypassPublishingServer) return data

    // If status hasn't actually changed, it's a no-op; let it through.
    if (data._status === originalDoc?._status) return data

    throw new Error(
      'Direct writes to _status are not allowed. Use the Publishing Server (publishing.publish / publishing.unpublish) instead.',
    )
  }
}
```

Register this hook on every publishable collection at plugin init.

### C6.8 — Build the MCP tools

`src/tools/publish.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import { withMeta, getAuditWriter } from '@forumone/claude-cms-core'
import type { Payload } from 'payload'
import { runPublishPipeline } from '../pipeline'
import { resolveCollection, type PublishingPluginOptions } from '../options'

export function createPublishTool(deps: { payload: Payload; options: PublishingPluginOptions }): McpToolDefinition {
  return {
    name: 'publish',
    description:
      'Publishes a draft document to the public site. Runs the full publish pipeline: composition validation, accessibility checks, required field checks, embargo enforcement, and approval gating. Returns success with the public URL, or a specific error with guidance for what to fix.',
    inputSchema: withMeta({
      collection: z.string().describe('The collection slug (e.g. "pages", "posts")'),
      id: z.string().describe('The document ID'),
    }),
    handler: async (input, ctx) => {
      const collection = resolveCollection(deps.options, input.collection)
      const document = await deps.payload.findByID({
        collection: input.collection,
        id: input.id,
        draft: true,
      })

      const result = await runPublishPipeline({
        payload: deps.payload,
        inngest: deps.options.inngest,
        options: deps.options,
        collection,
        document: document as Record<string, unknown>,
        documentId: input.id,
        actor: { user: ctx.user, apiKeyName: ctx.apiKeyName },
        meta: input._meta,
      })

      const auditWriter = getAuditWriter(deps.payload)
      await auditWriter({
        actor: {
          type: ctx.user ? 'user' : 'system',
          userId: ctx.user?.id,
          userName: ctx.user?.name,
          apiKeyName: ctx.apiKeyName,
        },
        action: 'publishing.publish',
        mcpServer: 'publishing',
        mcpTool: 'publish',
        targetCollection: input.collection,
        targetId: input.id,
        targetTitle: String(document.title ?? input.id),
        prompt: input._meta?.userPrompt,
        reasoning: input._meta?.reasoning,
        changesSummary: input._meta?.changesSummary,
        success: result.success,
        errorMessage: result.success ? undefined : result.reason,
      })

      if (result.success) {
        return {
          published: true,
          publishedAt: result.publishedAt,
          url: buildPublicUrl(deps.options, input.collection, document),
        }
      }

      return {
        published: false,
        failedAt: result.failedAt,
        reason: result.reason,
        code: result.code,
        issues: result.issues,
        suggestion: result.suggestion,
      }
    },
  }
}

function buildPublicUrl(options: PublishingPluginOptions, collection: string, doc: Record<string, unknown>): string {
  // Simple default. Clients with complex URL structures can override.
  const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? ''
  const slug = doc[resolveCollection(options, collection).slugField]
  if (collection === 'posts') return `${baseUrl}/blog/${slug}`
  return `${baseUrl}/${slug}`
}
```

`src/tools/unpublish.ts` — similar shape; updates `_status` to `draft`, fires `content/page.unpublished` event.

`src/tools/schedule-publish.ts` — validates the document would pass the pipeline right now, then stores `scheduledPublishAt`. An Inngest cron (C10) later executes it.

`src/tools/get-publish-status.ts`:

```typescript
import { z } from 'zod'
import type { McpToolDefinition } from '@forumone/claude-cms-plugin-contract'
import { withMeta } from '@forumone/claude-cms-core'
import type { Payload } from 'payload'
import { runPreflightPipeline } from '../pipeline'
import { resolveCollection, type PublishingPluginOptions } from '../options'

export function createGetPublishStatusTool(deps: { payload: Payload; options: PublishingPluginOptions }): McpToolDefinition {
  return {
    name: 'get_publish_status',
    description:
      "Returns the current publishability of a document without actually publishing. Shows current status, unpublished changes, what would happen if you tried to publish, any blockers, and approval state. Use this to answer 'is this ready to publish?' without side effects.",
    inputSchema: withMeta({
      collection: z.string(),
      id: z.string(),
    }),
    handler: async (input, ctx) => {
      const collection = resolveCollection(deps.options, input.collection)
      const document = await deps.payload.findByID({
        collection: input.collection,
        id: input.id,
        draft: true,
      })

      const preflight = await runPreflightPipeline({
        payload: deps.payload,
        inngest: deps.options.inngest,
        options: deps.options,
        collection,
        document: document as Record<string, unknown>,
        documentId: input.id,
        actor: { user: ctx.user, apiKeyName: ctx.apiKeyName },
      })

      return {
        currentStatus: document._status ?? 'draft',
        hasUnpublishedChanges: (document.updatedAt as string) > (document[collection.publishedAtField] as string ?? ''),
        lastPublished: document[collection.publishedAtField] ?? null,
        wouldPublish: {
          canPublish: preflight.success,
          blockers: preflight.success
            ? []
            : [{ code: preflight.code, message: preflight.reason, suggestion: preflight.suggestion }],
          issues: preflight.issues ?? [],
        },
      }
    },
  }
}
```

`src/tools/rollback.ts` — fetches a previous version from Payload's version history, validates through the pipeline, updates the document to that version.

`src/tools/index.ts` — re-exports all five tool factories.

### C6.9 — Build the plugin

`src/plugin.ts`:

```typescript
import type { CorePlugin } from '@forumone/claude-cms-plugin-contract'
import { getPluginRegistry } from '@forumone/claude-cms-plugin-contract'
import { createMcpHandler, createNamedLogger } from '@forumone/claude-cms-core'
import { validateOptions, type PublishingPluginOptions } from './options'
import { createBlockStatusWritesHook } from './hooks/block-status-writes'
import {
  createPublishTool,
  createUnpublishTool,
  createSchedulePublishTool,
  createGetPublishStatusTool,
  createRollbackTool,
} from './tools'

export const publishingPlugin: CorePlugin<PublishingPluginOptions> = (rawOptions) => (incomingConfig) => {
  if (rawOptions.enabled === false) return incomingConfig

  const options = validateOptions(rawOptions)
  const routePrefix = options.routePrefix ?? '/api/publishing'
  const logger = createNamedLogger('publishing', options.logger)

  // Inject the blocking hook into every publishable collection
  const modifiedCollections = (incomingConfig.collections ?? []).map((collection) => {
    const config = options.collections.find((c) => c.slug === collection.slug)
    if (!config) return collection
    return {
      ...collection,
      hooks: {
        ...(collection.hooks ?? {}),
        beforeChange: [
          ...(collection.hooks?.beforeChange ?? []),
          createBlockStatusWritesHook(),
        ],
      },
    }
  })

  return {
    ...incomingConfig,
    collections: modifiedCollections,
    endpoints: [
      ...(incomingConfig.endpoints ?? []),
      {
        path: `${routePrefix}/mcp`,
        method: 'post',
        handler: async (req) => {
          const handler = (req.payload as unknown as Record<symbol, unknown>)[MCP_HANDLER_SYMBOL] as
            | ((r: Request) => Promise<Response>)
            | undefined
          if (!handler) {
            return new Response(JSON.stringify({ error: 'Publishing MCP not initialized' }), {
              status: 503,
              headers: { 'content-type': 'application/json' },
            })
          }
          return handler(req as unknown as Request)
        },
      },
    ],
    onInit: async (payload) => {
      if (incomingConfig.onInit) await incomingConfig.onInit(payload)

      const registry = getPluginRegistry(payload)
      registry.requireCapability('audit-log', '@forumone/claude-cms-publishing')

      const tools = [
        createPublishTool({ payload, options }),
        createUnpublishTool({ payload, options }),
        createSchedulePublishTool({ payload, options }),
        createGetPublishStatusTool({ payload, options }),
        createRollbackTool({ payload, options }),
      ]

      const handler = createMcpHandler({
        payload,
        serverName: 'publishing',
        tools,
        logger: { info: logger.info, error: logger.error },
      })

      Object.defineProperty(payload as object, MCP_HANDLER_SYMBOL, {
        value: handler,
        enumerable: false,
        writable: false,
      })

      registry.register({
        id: '@forumone/claude-cms-publishing',
        version: '0.1.0',
        capabilities: ['publishing', 'publish-pipeline'],
      })

      logger.info('Publishing server ready', {
        collections: options.collections.map((c) => c.slug),
      })
    },
  }
}

const MCP_HANDLER_SYMBOL = Symbol.for('@forumone/claude-cms/publishing-mcp-handler')
```

### C6.10 — Index exports, tests, README, changeset

`src/index.ts`:

```typescript
export { publishingPlugin } from './plugin'
export type {
  PublishingPluginOptions,
  PublishableCollection,
  AccessibilityCheck,
  AccessibilityIssue,
  ApprovalResolver,
  ActiveApproval,
} from './options'
```

Tests for: each pipeline step, the pipeline runner, each accessibility check, the block-status-writes hook, each MCP tool, the plugin registration flow. Use a mock Payload client for unit tests and the playground for integration.

README: usage, configuration shape, how to add custom accessibility checks, how to integrate with the Approvals plugin.

Changeset:

> Initial release. Policy-gated publishing server with seven-step pipeline (exist, composition, accessibility, required fields, embargo, approval, execute). Blocks direct _status writes through Payload MCP. Provides five MCP tools: publish, unpublish, schedule_publish, get_publish_status, rollback.

## Acceptance criteria

- [ ] Seven-step pipeline executes in order, fails on first failure
- [ ] Direct `_status` writes via Payload MCP throw; Publishing Server writes succeed (via bypass flag)
- [ ] Composition step calls Component Server via symbol; fails loudly if unavailable
- [ ] Accessibility checks cover alt text, heading hierarchy, link labels (extensible via options)
- [ ] Required field checks cover SEO title/description, slug, plus configurable per-collection fields
- [ ] Embargo and expiration enforced
- [ ] Approval gating works when resolver is configured; fails closed when resolver is missing but policy requires approval
- [ ] Execute step updates document and fires `content/page.published` event
- [ ] All five MCP tools implemented with `_meta` support and audit writes
- [ ] `get_publish_status` runs preflight without side effects
- [ ] Rollback validates through the pipeline before reverting
- [ ] Plugin requires `audit-log` capability; fails at init if audit plugin isn't registered
- [ ] Playground integration test: publish succeeds, rejects two heroes, rejects missing alt text, rejects missing approval
- [ ] Test coverage 80%+

## Notes for Claude Code

- Add a small change to C5's plugin: in its `onInit`, attach the composition validator to Payload via `Symbol.for('@forumone/claude-cms/components-validator')` so C6's pipeline can call it. This is a one-liner in C5 but it's the coupling point between the two packages.
- The bypass flag (`context.bypassPublishingServer`) is what distinguishes a legitimate publish from an attempt to circumvent the server. Keep it in the hook logic exactly as documented; removing it breaks the trust boundary.
- The pipeline's step order is not arbitrary. Composition before accessibility because a composition error might make accessibility checks spurious. Approval last because it's the most expensive check (potentially hitting other plugins). Don't reorder without thinking through the cascading effects.
- Accessibility checks for Phase 1 are intentionally structural — no rendering, no contrast analysis, no screen-reader simulation. This is the 80% that catches 80% of problems. Full a11y checking is a Phase 2 service addition.
- The approval resolver option is how the Publishing Server stays decoupled from the Approvals Server. Clients wire them together by passing the Approvals plugin's resolver to the Publishing plugin. If a client doesn't use approvals, they don't configure a resolver and all approval checks pass.
- Error messages are user-facing. Claude will relay them. Write them in a neutral voice that works for any client — core shouldn't have Forum One voice baked in.
- Each pipeline step returns the same result shape so the runner treats them uniformly. Don't let one step evolve a different return type; refactor the runner if you need richer results.
- Commit after pipeline types (C6.3), each batch of steps (C6.4), the runner (C6.5), the hook (C6.7), each tool (C6.8), and the plugin (C6.9).

## What's next

Phase C7 builds the Approvals Server. Approvals feed into Publishing's approval step — the Approvals plugin exposes a resolver that Publishing consumes. After C7, the governance loop is complete.
