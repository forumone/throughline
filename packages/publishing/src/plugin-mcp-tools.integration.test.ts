import { auditPlugin, createMcpToolCollector } from '@forumone/throughline-core'
import { sqliteAdapter } from '@payloadcms/db-sqlite'
import type { Inngest } from 'inngest'
import { buildConfig, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { publishingPlugin } from './plugin.js'

/**
 * Does the collector actually get filled, inside a real Payload?
 *
 * The wiring rests on an ordering claim: every tool here is built at `onInit`
 * because every one closes over `payload`, and `@payloadcms/plugin-mcp` reads
 * `mcp.tools` inside the handler it builds per request — so an array handed over
 * at config time is read populated. The unit tests cover the collector; nothing
 * short of booting Payload covers the claim about *when* `onInit` runs relative
 * to the array being handed over.
 *
 * Against a real instance rather than a fake, for the reason the hook tests give:
 * three defects in this package came from unit tests encoding assumptions Payload
 * does not hold.
 */

const inngest = { send: async () => ({}) } as unknown as Inngest

/*
A database this file alone can see — see the note in
`hooks/block-status-writes.integration.test.ts`. `:memory:` is private to the
client that opens it; a shared-cache name is not.
*/
const DATABASE_URL = ':memory:'

let payload: Payload
const collector = createMcpToolCollector()

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'integration-secret-integration-secret',
    db: sqliteAdapter({ client: { url: DATABASE_URL } }),
    collections: [
      {
        slug: 'pages',
        fields: [
          { name: 'title', type: 'text' },
          { name: 'slug', type: 'text' },
        ],
        versions: { drafts: true },
      },
    ],
    plugins: [
      auditPlugin({ inngest }),
      publishingPlugin({ inngest, collections: [{ slug: 'pages' }], mcpTools: collector }),
    ],
    typescript: { outputFile: '/dev/null' },
    logger: { options: { level: 'silent' } },
  })

  payload = await getPayload({ config })
})

afterAll(async () => {
  await payload.db.destroy?.()
})

describe('publishingPlugin mcpTools', () => {
  it('fills the collector the host handed over at config time', () => {
    expect(collector.tools.map(tool => tool.name).sort()).toEqual([
      'get_publish_status',
      'publish',
      'rollback',
      'schedule_publish',
      'unpublish',
    ])
  })

  it('records which server contributed them', () => {
    expect(collector.servers).toContain('publishing')
  })

  /*
  Adapted on the way in, not left as Throughline's own shape: `plugin-mcp`
  registers a `ZodRawShape`, and `withMeta` produces an object around one.
  */
  it('hands over shapes the plugin can register', () => {
    const publish = collector.tools.find(tool => tool.name === 'publish')

    expect(publish).toBeDefined()
    expect(Object.keys(publish?.parameters ?? {})).toContain('collection')
    expect(Object.keys(publish?.parameters ?? {})).toContain('_meta')
  })

  /*
  The point of the whole exercise: a tool served through Payload's transport
  reaches the same pipeline the plugin's own endpoint does. `pages/1` does not
  exist, so this is the `exist` step answering — which is the first step, and
  proof the call arrived rather than that it succeeded.
  */
  it('serves a tool that reaches the real pipeline', async () => {
    const publish = collector.tools.find(tool => tool.name === 'publish')

    const result = await publish?.handler(
      { collection: 'pages', id: '404' },
      { user: null, payloadAPI: 'MCP', payload } as never,
      undefined,
    )

    const body = JSON.parse(String(result?.content[0]?.text)) as {
      published?: boolean
      failedAt?: string
    }
    expect(body.published).toBe(false)
    expect(body.failedAt).toBe('exist')
  })
})
