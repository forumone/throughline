import type { CollectionSlug, Config, Plugin } from 'payload'
import { approvalsPlugin } from './approvals/plugin.js'
import { expireStaleApprovalsJob } from './approvals/jobs/expire-stale-approvals.js'
import { DEFAULT_APPROVALS_SLUG } from './approvals/collection.js'
import type { ApprovalsPluginOptions } from './approvals/options.js'
import { buildActionUrl, generateActionToken } from './approvals/tokens.js'
import { auditEventEchoJob } from './audit/jobs/audit-event-echo.js'
import { auditPlugin, type AuditPluginOptions } from './audit/plugin.js'
import { DEFAULT_AUDIT_SLUG } from './audit/collection.js'
import { auditQueryPlugin } from './audit/query/plugin.js'
import type { AuditQueryPluginOptions } from './audit/query/options.js'
import { componentsPlugin } from './components/plugin.js'
import type { ComponentsPluginOptions } from './components/options.js'
import { editorialPlugin, type EditorialPluginOptions } from './editorial/plugin.js'
import type { WorkOptions } from './editorial/work/work.js'
import { emailJobs, emailPlugin } from './email/plugin.js'
import type { EmailPluginOptions } from './email/options.js'
import { fieldsPlugin } from './fields/checkSlug.js'
import { healthcheckJob } from './integrations/jobs/healthcheck.js'
import { integrationsJobs, integrationsPlugin } from './integrations/plugin.js'
import type { IntegrationsPluginOptions } from './integrations/options.js'
import { eventSenderFor } from './jobs/sender.js'
import { createHealthcheckFailureHandler } from './jobs/failure-handler.js'
import type { Job, JobsAdapter } from './jobs/types.js'
import type { PayloadJobsAdapter } from './jobs/payload/adapter.js'
import type {
  AuditEventEchoOptions,
  ExecuteScheduledPublishesOptions,
  ExpireStaleApprovalsOptions,
  HealthcheckOptions,
  PublishAtScheduledTimeOptions,
  RevalidateOnPublishOptions,
  ScheduledPublishRequest,
  ScheduledPublishResult,
} from './jobs/workflow-types.js'
import { createMcpToolCollector } from './mcp/collector.js'
import type { PayloadMcpTool } from './mcp/payload-mcp.js'
import { jobFailuresPlugin, type JobFailuresPluginOptions } from './observability/plugin.js'
import type { PluginAdminOptions } from './plugin-contract/admin.js'
import type { Logger } from './plugin-contract/index.js'
import type { McpToolContext } from './plugin-contract/mcp.js'
import { publishingPlugin } from './publishing/plugin.js'
import type { PublishableCollection, PublishingPluginOptions } from './publishing/options.js'
import { executeScheduledPublishesJob } from './publishing/jobs/execute-scheduled-publishes.js'
import { publishAtScheduledTimeJob } from './publishing/jobs/publish-at-scheduled-time.js'
import { revalidateOnPublishJob } from './publishing/jobs/revalidate-on-publish.js'
import { getPublishingService } from './publishing/service.js'
import { referencesPlugin, type ReferencesPluginOptions } from './references/plugin.js'

/*
One call for the suite: docs/spec/1.0-throughline-call.md has the reasoning.

It decides three things a site used to restate: the order the plugins load in,
the one value each constant two plugins share takes, and the list of jobs the
options call for. Each plugin is still exported from its own subpath for a site
that wires them by hand.
*/

/** The scheduled-publish callback the scheduling jobs call for each due document. */
type ScheduledPublish = (
  request: ScheduledPublishRequest,
  context: Parameters<PublishAtScheduledTimeOptions['publish']>[1],
) => Promise<ScheduledPublishResult>

/** What only `throughline()` supplies, so a site does not pass it. */
type Supplied = 'enabled' | 'mcpTools' | 'inngest' | 'emit' | 'logger'

export interface ThroughlineOptions {
  /**
   * The jobs adapter: `inngestJobs(inngest)` or `payloadJobs()`. Every plugin
   * that announces events sends them through it. On Payload Jobs the suite's
   * jobs are registered with it too; on Inngest the site serves `suite.jobs`
   * from its own endpoint.
   */
  jobs: JobsAdapter
  /**
   * The content collections the suite governs: what publishing gates, what
   * "Your work" lists, and what the scheduling jobs publish.
   */
  collections: readonly CollectionSlug[]
  /** The sidebar group for every collection the suite adds, unless a plugin's own `admin` says otherwise. */
  admin?: PluginAdminOptions
  /** For every plugin's diagnostics. */
  logger?: Logger

  /** The audit log. Always on: every other plugin needs it. */
  audit?: Omit<AuditPluginOptions, Supplied>
  /** Where a job that ran out of retries is recorded. Always on. */
  jobFailures?: Omit<JobFailuresPluginOptions, Supplied>
  /** `check_slug`. Always on. */
  fields?: { canUse?: (ctx: McpToolContext) => boolean }

  /** On when present: the design system's components over MCP. */
  components?: Omit<ComponentsPluginOptions, Supplied>
  /** On when present: the publish pipeline, revalidation and scheduled publishing. */
  publishing?: ThroughlinePublishingOptions
  /** On when present: approval requests, their links and their expiry. */
  approvals?: Omit<ApprovalsPluginOptions, Supplied> & {
    /** The expiry job's own options. */
    expiry?: Omit<ExpireStaleApprovalsOptions, 'payload' | 'collectionSlug'>
  }
  /** On when present: the audit log's MCP query tools. */
  auditQuery?: Omit<AuditQueryPluginOptions, Supplied | 'collectionSlug'>
  /**
   * On when present: approval notifications. `buildActionUrl` defaults to a
   * link signed with approvals' secret, against approvals' public URL.
   */
  email?: Omit<
    EmailPluginOptions,
    Supplied | 'approvalsCollectionSlug' | 'onTerminalFailure' | 'buildActionUrl'
  > &
    Partial<Pick<EmailPluginOptions, 'buildActionUrl'>>
  /** On when present: third-party integrations. Each must define `createJobs`. */
  integrations?: Omit<IntegrationsPluginOptions, Supplied | 'onTerminalFailure'>
  /** On when present: what refers to a document, and the delete guards. */
  references?: Omit<ReferencesPluginOptions, Supplied>
  /** On when present: content health, the calendar, "Your work" and the palette. */
  editorial?: Omit<EditorialPluginOptions, Supplied | 'work'> & {
    work?: Omit<WorkOptions, 'collections'> & { dashboard?: boolean }
  }
  /** On when present: the healthcheck job. */
  healthcheck?: Omit<HealthcheckOptions, 'payload'>
  /** Extra handlers for the audit echo job, which runs whenever approvals or email are on. */
  auditEcho?: Omit<AuditEventEchoOptions, 'onTerminalFailure'>
}

export interface ThroughlinePublishingOptions extends Omit<
  PublishingPluginOptions,
  Supplied | 'collections'
> {
  /** The group publishing's required-field step reads `title` and `description` from. Default `seo`. */
  seoField?: string
  /** Per-collection settings beyond `seoField`, by slug. */
  collectionOptions?: Partial<Record<string, Omit<PublishableCollection, 'slug'>>>
  /**
   * Where each collection's documents are served, for revalidation. Without
   * it there is no revalidation job: a collection with no builder would have
   * its tags dropped and no path revalidated.
   */
  urls?: RevalidateOnPublishOptions['urlBuilders']
  /** The revalidation job's other options. */
  revalidation?: Omit<RevalidateOnPublishOptions, 'payload' | 'urlBuilders'>
  scheduling?: {
    /** Default: through the publishing service, as `scheduled-publish`. */
    publish?: ScheduledPublish
    /** The on-time job's own options. */
    onTime?: Omit<PublishAtScheduledTimeOptions, 'payload' | 'collections' | 'publish'>
    /** The daily backstop for a schedule whose wake-up never arrived, or `false` for none. */
    backstop?: false | Omit<ExecuteScheduledPublishesOptions, 'payload' | 'collections' | 'publish'>
  }
}

export interface ThroughlineSuite {
  /** Every enabled Throughline plugin, in order. Add it before `mcpPlugin`. */
  plugin: Plugin
  /** For `mcpPlugin({ mcp: { tools: suite.mcpTools } })`. Filled as the plugins load. */
  mcpTools: PayloadMcpTool[]
  /** Every job the options call for. On Inngest, serve them: `inngestJobs(inngest, …).functions(suite.jobs)`. */
  jobs: Job[]
}

/**
 * Publishes a due document through the pipeline, as the clock rather than a
 * person, so a scheduled publish passes the same composition, accessibility
 * and approval gates an interactive one does.
 */
export const publishScheduledThroughPipeline: ScheduledPublish = async (
  { collection, id, reasoning },
  { payload },
) => {
  const outcome = await getPublishingService(payload).publish({
    collection,
    id,
    actor: { apiKeyName: 'scheduled-publish', channel: 'mcp' },
    meta: { reasoning },
  })
  return { published: outcome.published, reason: outcome.reason }
}

export function throughline(options: ThroughlineOptions): ThroughlineSuite {
  const mcpTools = createMcpToolCollector()
  // Plugins that announce events take an Inngest-shaped sender; this one sends
  // through the adapter, whichever runner it is.
  const inngest = eventSenderFor(options.jobs)
  const logger = options.logger ? { logger: options.logger } : {}
  /** A plugin's own sidebar group, or the suite's. */
  const adminFor = (own: { admin?: PluginAdminOptions } | undefined) => {
    const group = own?.admin ?? options.admin
    return group ? { admin: group } : {}
  }

  const auditSlug = options.audit?.slug ?? DEFAULT_AUDIT_SLUG
  const approvalsSlug = options.approvals?.collectionSlug ?? DEFAULT_APPROVALS_SLUG
  const collections = options.collections

  for (const integration of options.integrations?.integrations ?? []) {
    if (!integration.createJobs) {
      throw new Error(
        `throughline(): integration "${integration.id}" defines no createJobs. ` +
          'throughline() runs integrations through the jobs adapter, so give it a createJobs; ' +
          'a 0.x createFunctions can be derived from it, as the webhook integration does.',
      )
    }
  }
  if (options.email && !options.email.buildActionUrl && !options.approvals) {
    throw new Error(
      'throughline(): email has no buildActionUrl, and approvals is off, so there is no secret to sign its links with. ' +
        'Turn approvals on or pass email.buildActionUrl.',
    )
  }

  const plugins: Plugin[] = [
    auditPlugin({ ...options.audit, ...logger, ...adminFor(options.audit), inngest }),
    jobFailuresPlugin({ ...options.jobFailures, ...logger, ...adminFor(options.jobFailures), mcpTools }),
  ]
  if (options.components) {
    plugins.push(componentsPlugin({ ...options.components, ...logger, mcpTools }))
  }
  if (options.publishing) {
    const {
      seoField,
      collectionOptions,
      urls: _urls,
      revalidation: _r,
      scheduling: _s,
      ...rest
    } = options.publishing
    plugins.push(
      publishingPlugin({
        ...rest,
        ...logger,
        collections: collections.map((slug) => ({
          slug,
          ...(seoField ? { seoField } : {}),
          ...collectionOptions?.[slug],
        })),
        inngest,
        mcpTools,
      }),
    )
  }
  if (options.approvals) {
    const { expiry: _expiry, ...rest } = options.approvals
    plugins.push(
      approvalsPlugin({
        ...rest,
        ...logger,
        ...adminFor(options.approvals),
        collectionSlug: approvalsSlug,
        inngest,
        mcpTools,
      }),
    )
  }
  if (options.auditQuery) {
    plugins.push(
      auditQueryPlugin({ ...options.auditQuery, ...logger, collectionSlug: auditSlug, mcpTools }),
    )
  }
  const emailOptions: EmailPluginOptions | undefined = options.email && {
    ...options.email,
    ...logger,
    approvalsCollectionSlug: approvalsSlug,
    buildActionUrl: options.email.buildActionUrl ?? signedActionUrl(options.approvals ?? {}),
  }
  if (emailOptions) plugins.push(emailPlugin(emailOptions))
  if (options.integrations) {
    plugins.push(
      integrationsPlugin({
        ...options.integrations,
        ...logger,
        ...adminFor(options.integrations),
        emit: (event) => options.jobs.emit(event),
        mcpTools,
      }),
    )
  }
  if (options.references) {
    plugins.push(referencesPlugin({ ...options.references, mcpTools }))
  }
  plugins.push(fieldsPlugin({ ...options.fields, mcpTools }))
  if (options.editorial) {
    const { work, ...rest } = options.editorial
    plugins.push(editorialPlugin({ ...rest, work: { ...work, collections }, mcpTools }))
  }

  const jobs = suiteJobs(options, { approvalsSlug, emailOptions })
  if (isPayloadJobs(options.jobs)) plugins.push(options.jobs.plugin(jobs))

  const plugin: Plugin = async (config: Config) => {
    let next = config
    for (const each of plugins) next = await each(next)
    return next
  }
  return { plugin, mcpTools: mcpTools.tools, jobs }
}

function suiteJobs(
  options: ThroughlineOptions,
  shared: { approvalsSlug: string; emailOptions: EmailPluginOptions | undefined },
): Job[] {
  const jobs: Job[] = []
  const scheduled = options.collections.map((slug) => ({ slug }))
  if (options.publishing) {
    const { urls, revalidation, scheduling } = options.publishing
    if (urls) jobs.push(revalidateOnPublishJob({ ...revalidation, urlBuilders: urls }))
    const publish = scheduling?.publish ?? publishScheduledThroughPipeline
    jobs.push(publishAtScheduledTimeJob({ ...scheduling?.onTime, collections: scheduled, publish }))
    if (scheduling?.backstop !== false) {
      jobs.push(
        executeScheduledPublishesJob({ ...scheduling?.backstop, collections: scheduled, publish }),
      )
    }
  }
  if (options.approvals) {
    jobs.push(
      expireStaleApprovalsJob({
        ...options.approvals.expiry,
        collectionSlug: shared.approvalsSlug,
      }),
    )
  }
  if (options.approvals || options.email || options.auditEcho) {
    jobs.push(auditEventEchoJob({ ...options.auditEcho }))
  }
  if (options.healthcheck) {
    jobs.push(
      healthcheckJob({
        onFailure: createHealthcheckFailureHandler(),
        ...options.healthcheck,
      }),
    )
  }
  if (shared.emailOptions) jobs.push(...emailJobs(shared.emailOptions))
  if (options.integrations) {
    jobs.push(...integrationsJobs({ integrations: options.integrations.integrations ?? [] }))
  }
  return jobs
}

/**
 * An approval link signed with approvals' secret, against approvals' public
 * URL: what every site wrote by hand. Each is read when a link is built, so an
 * environment variable set after the config loads still counts.
 */
export function signedActionUrl(
  approvals: Pick<ApprovalsPluginOptions, 'tokenSecret' | 'publicUrl'>,
): EmailPluginOptions['buildActionUrl'] {
  return async ({ approvalId, action, approverId }) => {
    const secret = approvals.tokenSecret ?? process.env['APPROVAL_TOKEN_SECRET']
    if (!secret)
      throw new Error(
        'Signing an approval link needs APPROVAL_TOKEN_SECRET, or approvals.tokenSecret.',
      )
    const base = approvals.publicUrl ?? process.env['NEXT_PUBLIC_SERVER_URL']
    if (!base)
      throw new Error(
        'Building an approval link needs NEXT_PUBLIC_SERVER_URL, or approvals.publicUrl.',
      )
    const token = await generateActionToken(
      { approvalId, action, approverId, issuedAt: Date.now() },
      secret,
    )
    return buildActionUrl(base, token)
  }
}

function isPayloadJobs(adapter: JobsAdapter): adapter is PayloadJobsAdapter {
  return adapter.runner === 'payload'
}
