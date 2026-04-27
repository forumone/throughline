import { Inngest } from 'inngest'

export interface InngestClientOptions {
  /** App identifier used in Inngest's UI; should be stable across deployments. */
  id: string
  /** Inngest event key. Falls back to `process.env.INNGEST_EVENT_KEY`. */
  eventKey?: string
  /** Base URL for self-hosted Inngest deployments. */
  baseUrl?: string
  /** Override the environment ("development", "preview", "production", or a branch name). */
  env?: string
  /** Force development mode regardless of environment. */
  isDev?: boolean
}

/**
 * Creates an Inngest client preconfigured for Throughline. Plugins and the
 * audit writer accept this client to fire events; client apps construct it
 * once at module load and pass it everywhere.
 *
 * The signing key (used to verify incoming Inngest webhook calls) is read
 * from `INNGEST_SIGNING_KEY` by the framework's serve handler — it is not
 * a constructor option in Inngest 4.
 */
export function createInngestClient(options: InngestClientOptions): Inngest {
  const eventKey = options.eventKey ?? process.env['INNGEST_EVENT_KEY']
  const clientOptions: ConstructorParameters<typeof Inngest>[0] = { id: options.id }
  if (eventKey !== undefined) clientOptions.eventKey = eventKey
  if (options.baseUrl !== undefined) clientOptions.baseUrl = options.baseUrl
  if (options.env !== undefined) clientOptions.env = options.env
  if (options.isDev !== undefined) clientOptions.isDev = options.isDev
  return new Inngest(clientOptions)
}
