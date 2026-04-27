import type { InngestFunction } from 'inngest'
import type { ExecuteScheduledPublishesOptions } from './types.js'

const DEFAULT_SCHEDULE = '*/5 * * * *'

interface DueDoc {
  id: string
  title: string
  collection: string
}

interface PublishingMcpResponse {
  result?: { content?: Array<{ text?: string; type?: string }> }
  error?: { message: string; code?: number }
}

/**
 * Cron-driven scheduled publish executor. Every tick (default: every 5
 * minutes) the function looks for documents in any of the configured
 * collections whose `_status` is still `draft` and whose
 * `scheduledPublishAt` has passed. For each, it calls the publishing
 * server's MCP `publish` tool — going through the full publishing pipeline
 * means scheduled publishes get the same composition / accessibility /
 * approval checks as interactive publishes.
 *
 * The `publishingApiKey` (or `PUBLISHING_SYSTEM_API_KEY` env var) must
 * carry `publishing.execute` scope. The factory throws at construction if
 * neither is present so misconfigurations surface immediately.
 *
 * Failures from the publishing MCP are logged but do not throw; the
 * unpublished document stays at `_status: draft` until either an admin
 * intervenes or the next tick succeeds. Throwing would retry indefinitely
 * on a permanent error (e.g. composition check failure), which is wrong
 * for cron-style work.
 */
export function createExecuteScheduledPublishesFunction(
  options: ExecuteScheduledPublishesOptions,
): InngestFunction.Any {
  const apiKey = options.publishingApiKey ?? process.env['PUBLISHING_SYSTEM_API_KEY']
  if (!apiKey) {
    throw new Error(
      'createExecuteScheduledPublishesFunction requires options.publishingApiKey or the PUBLISHING_SYSTEM_API_KEY env var.',
    )
  }

  const schedule = options.schedule ?? DEFAULT_SCHEDULE
  const baseUrl = options.publishingServerUrl.replace(/\/$/, '')

  return options.inngest.createFunction(
    {
      id: options.id ?? 'execute-scheduled-publishes',
      triggers: [{ cron: schedule }],
    },
    async ({ step, logger }) => {
      const nowIso = new Date().toISOString()
      let publishedCount = 0
      let blockedCount = 0

      for (const config of options.collections) {
        const statusField = config.statusField ?? '_status'
        const scheduledField = config.scheduledField ?? 'scheduledPublishAt'

        const due = await step.run(`find-due-${config.slug}`, async (): Promise<DueDoc[]> => {
          const result = await options.payload.find({
            collection: config.slug,
            where: {
              and: [
                { [statusField]: { equals: 'draft' } },
                { [scheduledField]: { exists: true } },
                { [scheduledField]: { less_than_equal: nowIso } },
              ],
            },
            limit: 100,
          })
          return (result.docs as Array<Record<string, unknown>>).map((doc) => ({
            id: String(doc['id']),
            title: String(doc['title'] ?? doc['id']),
            collection: config.slug,
          }))
        })

        for (const doc of due) {
          const outcome = await step.run(
            `publish-${config.slug}-${doc.id}`,
            async (): Promise<'published' | 'blocked' | 'error'> => {
              return executePublish({ doc, baseUrl, apiKey, logger })
            },
          )
          if (outcome === 'published') publishedCount += 1
          if (outcome === 'blocked') blockedCount += 1
        }
      }

      logger.info('Scheduled publish tick complete', { publishedCount, blockedCount })
      return { publishedCount, blockedCount }
    },
  )
}

interface ExecutePublishArgs {
  doc: DueDoc
  baseUrl: string
  apiKey: string
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void }
}

async function executePublish({
  doc,
  baseUrl,
  apiKey,
  logger,
}: ExecutePublishArgs): Promise<'published' | 'blocked' | 'error'> {
  let response: Response
  try {
    response = await fetch(`${baseUrl}/api/publishing/mcp`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'publish',
          arguments: {
            collection: doc.collection,
            id: doc.id,
            _meta: { reasoning: 'Scheduled publish executed by workflow cron' },
          },
        },
      }),
    })
  } catch (error) {
    logger.error('Scheduled publish HTTP error', {
      document: doc.title,
      error: error instanceof Error ? error.message : String(error),
    })
    return 'error'
  }

  if (!response.ok) {
    logger.error('Scheduled publish HTTP non-2xx', {
      document: doc.title,
      status: response.status,
    })
    return 'error'
  }

  const body = (await response.json()) as PublishingMcpResponse
  if (body.error) {
    logger.warn('Scheduled publish blocked by policy', {
      document: doc.title,
      reason: body.error.message,
    })
    return 'blocked'
  }

  logger.info('Scheduled publish succeeded', { document: doc.title })
  return 'published'
}
