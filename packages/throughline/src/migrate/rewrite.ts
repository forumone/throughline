import table from './exports.json' with { type: 'json' }

/*
Rewrites a source file's imports of the 0.x packages to their 1.0 homes, by
docs/spec/1.0-exports.md.

Each name goes to the 1.0 entry that exports it, from `exports.json`, which is
read from the packages themselves. Where a name is exported twice in one
package, the 0.x path's own 1.0 counterpart wins: `ContentField` from
design-contract is `/contract`'s, and from design-system-payload `/generate`'s.

What it cannot do safely it reports rather than guesses: a removed name, a
namespace or default import, a mock or a dynamic import whose names it cannot
see, a re-export of everything.
*/

const THROUGHLINE = '@forumone/throughline'
const DESIGN_SYSTEM = '@forumone/throughline-design-system'

/** Every 0.x public path, and its 1.0 counterpart: the default target for its names. */
export const COUNTERPARTS: Readonly<Record<string, string>> = {
  '@forumone/throughline-core': THROUGHLINE,
  '@forumone/throughline-core/audit': `${THROUGHLINE}/audit`,
  '@forumone/throughline-core/auth': THROUGHLINE,
  '@forumone/throughline-core/client': `${THROUGHLINE}/client`,
  '@forumone/throughline-core/env': THROUGHLINE,
  '@forumone/throughline-core/events': `${THROUGHLINE}/jobs`,
  '@forumone/throughline-core/fields': `${THROUGHLINE}/fields`,
  '@forumone/throughline-core/media': `${THROUGHLINE}/media`,
  '@forumone/throughline-core/mcp': THROUGHLINE,
  '@forumone/throughline-core/observability': `${THROUGHLINE}/observability`,
  '@forumone/throughline-core/references': `${THROUGHLINE}/media`,
  '@forumone/throughline-core/rsc': `${THROUGHLINE}/rsc`,
  '@forumone/throughline-core/testing': `${THROUGHLINE}/testing`,
  '@forumone/throughline-plugin-contract': THROUGHLINE,
  '@forumone/throughline-audit': `${THROUGHLINE}/audit`,
  '@forumone/throughline-approvals': `${THROUGHLINE}/approvals`,
  '@forumone/throughline-publishing': `${THROUGHLINE}/publishing`,
  '@forumone/throughline-publishing/checks': `${THROUGHLINE}/publishing`,
  '@forumone/throughline-publishing/client': `${THROUGHLINE}/client`,
  '@forumone/throughline-publishing/editorial': `${THROUGHLINE}/editorial`,
  '@forumone/throughline-publishing/rsc': `${THROUGHLINE}/rsc`,
  '@forumone/throughline-components': `${THROUGHLINE}/components`,
  '@forumone/throughline-integrations': `${THROUGHLINE}/integrations`,
  '@forumone/throughline-integrations/client': `${THROUGHLINE}/client`,
  '@forumone/throughline-email': `${THROUGHLINE}/email`,
  '@forumone/throughline-email/templates': `${THROUGHLINE}/email`,
  '@forumone/throughline-workflows': `${THROUGHLINE}/jobs`,
  '@forumone/throughline-workflows/cache-tags': `${THROUGHLINE}/cache-tags`,
  '@forumone/throughline-design-contract': `${DESIGN_SYSTEM}/contract`,
  '@forumone/throughline-design-contract/lint': `${DESIGN_SYSTEM}/lint`,
  '@forumone/throughline-design-system-payload': `${DESIGN_SYSTEM}/generate`,
  '@forumone/throughline-design-system-payload/generate': `${DESIGN_SYSTEM}/generate`,
  '@forumone/throughline-design-system-payload/render': `${DESIGN_SYSTEM}/render`,
  '@forumone/throughline-design-system-payload/client': `${DESIGN_SYSTEM}/client`,
  '@forumone/throughline-design-system-payload/testing': `${DESIGN_SYSTEM}/testing`,
}

/** Names 1.0 renamed, each to a name with the same value. */
export const RENAMED: Readonly<Record<string, string>> = {
  DEFAULT_AUDIT_COLLECTION_SLUG: 'DEFAULT_AUDIT_SLUG',
  DEFAULT_APPROVALS_COLLECTION_SLUG: 'DEFAULT_APPROVALS_SLUG',
}

const FACTORY =
  'removed: register the job instead, with inngestJobs(inngest, { onFailure, payload }), or let throughline() list it in suite.jobs'
const VIA_THROUGHLINE = 'internal: throughline() does this. See docs/spec/1.0-throughline-call.md'

/** Names 1.0 removed or made internal, and what to do instead. */
export const REMOVED: Readonly<Record<string, string>> = {
  createRevalidateOnPublishFunction: `${FACTORY} (revalidateOnPublishJob, /publishing)`,
  createExecuteScheduledPublishesFunction: `${FACTORY} (executeScheduledPublishesJob, /publishing)`,
  createPublishAtScheduledTimeFunction: `${FACTORY} (publishAtScheduledTimeJob, /publishing)`,
  createExpireStaleApprovalsFunction: `${FACTORY} (expireStaleApprovalsJob, /approvals)`,
  createAuditEventEchoFunction: `${FACTORY} (auditEventEchoJob, /audit)`,
  createHealthcheckFunction: `${FACTORY} (healthcheckJob, /integrations)`,
  createNotifyApprovalRequestFunction: `${FACTORY} (emailJobs, /email)`,
  createNotifyApprovalDecisionFunction: `${FACTORY} (emailJobs, /email)`,
  createNotifyApprovalExpiredFunction: `${FACTORY} (emailJobs, /email)`,
  createMcpToolCollector: `${VIA_THROUGHLINE}; give mcpPlugin suite.mcpTools`,
  toPayloadMcpTool: VIA_THROUGHLINE,
  toPayloadMcpTools: VIA_THROUGHLINE,
  AddToolsOptions: VIA_THROUGHLINE,
  CreateMcpToolCollectorOptions: VIA_THROUGHLINE,
  DeclareToolsOptions: VIA_THROUGHLINE,
  McpToolDescriptor: VIA_THROUGHLINE,
  PayloadMcpRequest: VIA_THROUGHLINE,
  ToPayloadMcpToolOptions: VIA_THROUGHLINE,
  getPluginRegistry: `${VIA_THROUGHLINE}: it owns the order plugins register in`,
  PluginRegistry: VIA_THROUGHLINE,
  PluginRegistryEntry: VIA_THROUGHLINE,
  resolveAdminGroup: `${VIA_THROUGHLINE}; pass admin: { group } to it`,
  DEFAULT_ADMIN_GROUP: VIA_THROUGHLINE,
  getEmailFunctions: `${VIA_THROUGHLINE}; serve suite.jobs from the Inngest route`,
  getIntegrationRegistry: `${VIA_THROUGHLINE}; serve suite.jobs from the Inngest route`,
  getIntegrationContext: `${VIA_THROUGHLINE}; serve suite.jobs from the Inngest route`,
  APPROVALS_RESOLVER_SYMBOL:
    'internal: approvalsPlugin attaches the resolver and publishing finds it',
  auditServerFor: 'internal',
  mcpServerRefusal: 'internal',
  validateOptions: 'internal: each plugin validates its own options',
}

export interface Finding {
  /** 1-based. */
  line: number
  message: string
}

export interface Rewrite {
  text: string
  changed: boolean
  /** Rewritten, but worth a look: a mock or dynamic import pointed at one entry. */
  review: Finding[]
  /** Left as they were: what the codemod could not place. */
  unresolved: Finding[]
}

const OLD = Object.keys(COUNTERPARTS)
  .sort((a, b) => b.length - a.length)
  .map((s) => s.replace(/[/-]/g, (c) => `\\${c}`))
  .join('|')

/** The 1.0 entry for one name imported from one 0.x path, or why there is none. */
export function placeName(
  oldSpecifier: string,
  name: string,
): { specifier: string; name: string } | { reason: string } {
  const counterpart = COUNTERPARTS[oldSpecifier]
  if (!counterpart) return { reason: `${oldSpecifier} is not a 0.x Throughline path` }
  const renamed = RENAMED[name] ?? name
  if (name in REMOVED) return { reason: `${name}: ${REMOVED[name]}` }
  const pkg = counterpart.startsWith(DESIGN_SYSTEM) ? DESIGN_SYSTEM : THROUGHLINE
  const homes = (table as Record<string, Record<string, string[]>>)[pkg]?.[renamed] ?? []
  if (homes.includes(counterpart)) return { specifier: counterpart, name: renamed }
  if (homes.length === 1) return { specifier: homes[0]!, name: renamed }
  if (homes.length === 0) {
    return { reason: `${name} is not exported by ${pkg} 1.0; see docs/spec/1.0-exports.md` }
  }
  return { reason: `${name} is exported from ${homes.join(' and ')}; choose one` }
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

/** `{ a, type B, c as d }` -> its specifiers, keeping `type` and `as`. */
function specifiersOf(
  body: string,
): Array<{ raw: string; name: string; typeOnly: boolean; alias?: string }> {
  return body
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const typeOnly = /^type\s+/.test(raw)
      const rest = raw.replace(/^type\s+/, '')
      const [name, alias] = rest.split(/\s+as\s+/).map((part) => part.trim())
      return { raw, name: name!, typeOnly, ...(alias ? { alias } : {}) }
    })
}

export function rewriteSource(text: string): Rewrite {
  const review: Finding[] = []
  const unresolved: Finding[] = []
  let out = text

  // 1. Named imports and re-exports: split by where each name now lives.
  const declaration = new RegExp(
    `(import|export)(\\s+type)?\\s*\\{([^}]*)\\}\\s*from\\s*(['"])(${OLD})\\4`,
    'g',
  )
  out = out.replace(
    declaration,
    (
      whole,
      kw: string,
      typeKw: string | undefined,
      body: string,
      quote: string,
      oldSpecifier: string,
      offset: number,
    ) => {
      const groups = new Map<string, string[]>()
      const left: string[] = []
      for (const spec of specifiersOf(body)) {
        const placed = placeName(oldSpecifier, spec.name)
        if ('reason' in placed) {
          unresolved.push({ line: lineOf(text, offset), message: placed.reason })
          left.push(spec.raw)
          continue
        }
        const local = spec.alias ?? (placed.name !== spec.name ? spec.name : undefined)
        const written =
          (spec.typeOnly ? 'type ' : '') +
          placed.name +
          (local && local !== placed.name ? ` as ${local}` : '')
        groups.set(placed.specifier, [...(groups.get(placed.specifier) ?? []), written])
      }
      const type = typeKw ? ' type' : ''
      const lines = [...groups.entries()].map(
        ([specifier, names]) =>
          `${kw}${type} { ${names.join(', ')} } from ${quote}${specifier}${quote}`,
      )
      if (left.length > 0)
        lines.push(`${kw}${type} { ${left.join(', ')} } from ${quote}${oldSpecifier}${quote}`)
      return lines.length > 0 ? lines.join('\n') : whole
    },
  )

  // 2. Everything else that names a 0.x path as a whole: point it at the
  //    counterpart, and say so, because the names inside cannot be checked.
  const whole = new RegExp(
    `(import\\s+\\*\\s+as\\s+\\w+\\s+from|import\\s+\\w+\\s+from|export\\s+\\*\\s+from|import\\(|vi\\.mock\\(|vi\\.doMock\\(|declare\\s+module)\\s*(['"])(${OLD})\\2`,
    'g',
  )
  out = out.replace(
    whole,
    (match, head: string, quote: string, oldSpecifier: string, offset: number) => {
      const counterpart = COUNTERPARTS[oldSpecifier]!
      review.push({
        line: lineOf(out, offset),
        message: `${head.trim()} ${oldSpecifier} now names ${counterpart}; check the names it relies on live there`,
      })
      return `${head} ${quote}${counterpart}${quote}`.replace(/\(\s+/, '(')
    },
  )

  // 3. Admin component paths: 'pkg/client#Name', as an importMap or a config names them.
  const componentPath = new RegExp(`(['"\`])(${OLD})#(\\w+)\\1`, 'g')
  out = out.replace(
    componentPath,
    (match, quote: string, oldSpecifier: string, name: string, offset: number) => {
      const placed = placeName(oldSpecifier, name)
      if ('reason' in placed) {
        unresolved.push({
          line: lineOf(out, offset),
          message: `${oldSpecifier}#${name}: ${placed.reason}`,
        })
        return match
      }
      return `${quote}${placed.specifier}#${placed.name}${quote}`
    },
  )

  return { text: out, changed: out !== text, review, unresolved }
}
