# @forumone/throughline-publishing

The trust boundary of the framework. The Publishing MCP server wraps Payload's update operation with a seven-stage policy-gated pipeline: exists, composition, accessibility, required-fields, embargo, approval, execute. Only this plugin can transition a document to `_status: 'published'`; direct writes through Payload MCP are blocked.

## Install

```bash
pnpm add @forumone/throughline-publishing
```

Peer dependencies: `payload@^3.0.0`, `inngest@^4.0.0`. Depends on `@forumone/throughline-core`.

## Public API

```typescript
import { publishingPlugin } from '@forumone/throughline-publishing'
import type {
  PublishingPluginOptions,
  PublishableCollection,
  ResolvedCollection,
  AccessibilityCheck,
  AccessibilityIssue,
  ApprovalResolver,
  ActiveApproval,
  PipelineContext,
  PipelineResult,
  PipelineStep,
  PipelineStepResult,
} from '@forumone/throughline-publishing'
```

## `publishingPlugin(options)`

```typescript
publishingPlugin({
  inngest,                                    // required
  collections: PublishableCollection[],       // required
  accessibilityChecks?: AccessibilityCheck[],
  approvalResolver?: ApprovalResolver,
  routePrefix?: string,                       // default '/publishing'
})
```

`PublishableCollection`:

```typescript
interface PublishableCollection {
  slug: string
  layoutField?: string                        // default 'layout'
  requiredFields?: string[]                   // dot paths, e.g. ['seo.title']
  embargoField?: string                       // default 'policy.embargoedUntil'
  approvalField?: string                      // default 'policy.requiresApproval'
  approverGroupsField?: string                // default 'policy.approverGroups'
}
```

`AccessibilityCheck`:

```typescript
interface AccessibilityCheck {
  name: string
  description: string
  appliesToCollections?: string[]
  check: (input: { collection: string; doc: unknown; payload: Payload }) => Promise<CheckResult>
}

type CheckResult =
  | { status: 'pass' }
  | { status: 'warn'; message: string; details?: Record<string, unknown> }
  | { status: 'fail'; message: string; remedy?: string; details?: Record<string, unknown> }
```

See [Customizing accessibility checks](../guides/customizing-accessibility-checks.md).

`ApprovalResolver`:

```typescript
interface ApprovalResolver {
  getActiveApproval: (
    collection: string,
    id: string,
    version: string,
  ) => Promise<ActiveApproval | null>
}
```

The Publishing plugin asks for an active approval at stage 6. The Approvals plugin provides one via `attachApprovalResolver(payload, options)`; the Publishing plugin's option lets you supply a different resolver if you have a custom approval system.

## MCP tools

| Tool | Required role | Purpose |
| --- | --- | --- |
| `publish` | `editor`, `admin` | Run the publish pipeline |
| `unpublish` | `editor`, `admin` | Set `_status` back to `'draft'` |
| `schedule_publish` | `editor`, `admin` | Set `scheduledPublishAt`; the Workflows package's cron picks it up |
| `cancel_scheduled_publish` | `editor`, `admin` | Clear `scheduledPublishAt` |
| `rollback` | `admin` | Restore a previous version and publish it |
| `get_publish_status` | any | Returns the document's status, scheduled publish time, latest publish event |

## Pipeline stages

In order:

1. **Exists** — `payload.findByID` resolves; caller has read access
2. **Composition** — calls `validate_composition` on the Components MCP
3. **Accessibility** — every registered `AccessibilityCheck` returns `pass` or `warn` (a `fail` short-circuits)
4. **Required fields** — collection's `requiredFields` are populated
5. **Embargo** — `embargoField` is in the past or unset
6. **Approval** — if `approvalField` is true, `approvalResolver.getActiveApproval` returns a non-null approval
7. **Execute** — flips `_status: 'published'`, writes `publishedAt`, fires `content/page.published`

The first stage that fails returns:

```json
{
  "error": {
    "code": "PUBLISH_REJECTED",
    "stage": "<one of 'exists' | 'composition' | 'accessibility' | 'required-fields' | 'embargo' | 'approval'>",
    "reason": "<human-readable>",
    "remedy": "<optional, suggested next step>",
    "details": { /* stage-specific */ }
  }
}
```

See [The trust boundary](../concepts/the-trust-boundary.md) for full design rationale.

## Events fired

| Event | When |
| --- | --- |
| `content/page.published` | Stage 7 succeeds |
| `content/page.unpublished` | `unpublish` succeeds |
| `content/page.scheduled` | `schedule_publish` succeeds |
| `content/page.scheduled_canceled` | `cancel_scheduled_publish` succeeds |
| `content/page.rolled_back` | `rollback` succeeds |

(Despite the `page.` prefix, these fire for any collection registered with the plugin. The name is historical.)

## Capabilities registered

- `publishing` — the plugin is loaded
- `publish-pipeline` — the pipeline orchestrator is available

## Common usage

```typescript
import { publishingPlugin } from '@forumone/throughline-publishing'
import { attachApprovalResolver } from '@forumone/throughline-approvals'

publishingPlugin({
  inngest,
  collections: [
    { slug: 'pages', requiredFields: ['seo.title'] },
    { slug: 'programs', requiredFields: ['seo.title', 'summary'] },
  ],
  accessibilityChecks: [
    requireImageAltText,
    requireSeoDescription,
  ],
  approvalResolver: {
    getActiveApproval: async (collection, id, version) => {
      // The Approvals plugin attaches its resolver via Symbol — use that:
      return null  // overridden by the next plugin's attachApprovalResolver
    },
  },
}),

// After approvalsPlugin runs, the resolver attaches:
approvalsPlugin({ /* ... */ }),
attachApprovalResolver(payload),  // wires Approvals' resolver into Publishing
```

The CLI scaffolder writes a stub `approvalResolver` and adds the actual wiring via `getApprovalResolver` in `onInit` — see the generated `payload.config.ts`.

## Related

- Concept: [The trust boundary](../concepts/the-trust-boundary.md)
- Guide: [Adding a collection](../guides/adding-a-collection.md), [Customizing accessibility checks](../guides/customizing-accessibility-checks.md)
- Reference: [@forumone/throughline-approvals](approvals.md), [@forumone/throughline-workflows](workflows.md)
