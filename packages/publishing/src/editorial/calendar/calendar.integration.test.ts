import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { createMcpToolCollector } from '@forumone/throughline-core'
import type { McpToolContext } from '@forumone/throughline-plugin-contract'
import { buildConfig, getPayload, type CollectionConfig, type Payload } from 'payload'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorialRuntime } from '../config.js'
import { CONTENT_CALENDAR_VIEW_PATH, editorialPlugin } from '../plugin.js'
import { readCalendarMonth, type CalendarOptions } from './calendar.js'
import { ContentCalendarReport } from './ContentCalendarReport.js'
import { createGetContentCalendarTool, toolCalendar } from './tool.js'

/*
The content calendar against a real Payload and database, and the parity test
1.0's plan asks of every editorial move: the items the tool returns are the
items the view draws, linked the same way.
*/

const Users: CollectionConfig = { slug: 'users', auth: true, fields: [] }

const Pages: CollectionConfig = {
  slug: 'pages',
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'publishedAt', type: 'date' },
    { name: 'scheduledPublishAt', type: 'date' },
  ],
}

const Events: CollectionConfig = {
  slug: 'events',
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text' },
    { name: 'publishedAt', type: 'date' },
    { name: 'startsAt', type: 'date', timezone: true },
  ],
}

const calendar: CalendarOptions = {
  timeZone: 'America/New_York',
  collections: ['pages'],
  events: [{ collection: 'events', startsField: 'startsAt', zoneField: 'startsAt_tz' }],
}

const collector = createMcpToolCollector()
let payload: Payload
let user: Awaited<ReturnType<Payload['create']>>

beforeAll(async () => {
  const config = await buildConfig({
    secret: 'test-secret-test-secret-test-secret',
    db: sqliteAdapter({ client: { url: ':memory:' } }),
    admin: { user: 'users' },
    collections: [Users, Pages, Events],
    plugins: [editorialPlugin({ calendar, mcpTools: collector })],
    logger: { options: { level: 'silent' } },
    // Otherwise getPayload forks `payload generate:types`, which hangs and outlives the run.
    typescript: { autoGenerate: false },
  })
  payload = await getPayload({ config })
  user = await payload.create({
    collection: 'users',
    data: { email: 'e@example.com', password: 'pw-pw-pw-pw' },
  })

  await payload.create({
    collection: 'pages',
    data: { title: 'Launched', _status: 'published', publishedAt: '2026-10-05T14:00:00.000Z' },
  })
  // Scheduled on a draft: the schedule lives on the latest version only.
  await payload.create({
    collection: 'pages',
    draft: true,
    data: {
      title: 'Coming soon',
      _status: 'draft',
      scheduledPublishAt: '2026-10-20T13:00:00.000Z',
    },
  })
  // 11:30 PM Eastern on the 31st is 1 November in UTC.
  await payload.create({
    collection: 'pages',
    data: { title: 'Late night', _status: 'published', publishedAt: '2026-11-01T03:30:00.000Z' },
  })
  await payload.create({
    collection: 'events',
    draft: true,
    data: {
      title: 'Webinar',
      _status: 'draft',
      startsAt: '2026-10-14T18:00:00.000Z',
      startsAt_tz: 'America/Los_Angeles',
    } as never,
  })
  // Outside the month entirely.
  await payload.create({
    collection: 'pages',
    data: { title: 'Last year', _status: 'published', publishedAt: '2025-10-05T14:00:00.000Z' },
  })
}, 120_000)

afterAll(async () => {
  await payload?.destroy?.()
})

const october = () => readCalendarMonth(payload, { calendar, user, month: '2026-10' })

describe('readCalendarMonth', () => {
  it('places each kind on its day in the site zone', async () => {
    const { items } = await october()
    const on = (day: string) => (items.get(day) ?? []).map((item) => [item.kind, item.title])
    expect(on('2026-10-05')).toEqual([['published', 'Launched']])
    expect(on('2026-10-20')).toEqual([['scheduled', 'Coming soon']])
    expect(on('2026-10-31')).toEqual([['published', 'Late night']])
    expect(on('2026-10-14')).toEqual([['event', 'Webinar']])
    expect([...items.values()].flat().map((item) => item.title)).not.toContain('Last year')
  })

  it('marks an unpublished event a draft, and keeps the zone it was entered in', async () => {
    const [webinar] = (await october()).items.get('2026-10-14') ?? []
    expect(webinar).toMatchObject({ draft: true, zone: 'America/Los_Angeles' })
  })
})

describe('parity: the view and the tool show the same items', () => {
  const ctx = () =>
    ({
      user: { id: String(user.id), email: 'e@example.com', name: 'E', roles: [], groups: [] },
      apiKeyName: 'test',
      logger: console,
    }) as unknown as McpToolContext

  it('draws every item the tool returns, with the same link', async () => {
    const tool = createGetContentCalendarTool({ payload, calendar })
    const fromTool = (await tool.handler({ month: '2026-10' }, ctx())) as ReturnType<
      typeof toolCalendar
    >
    const month = await october()
    expect(fromTool).toEqual({ ...toolCalendar(month, '/admin'), today: fromTool.today })
    expect(fromTool.total).toBe(4)

    for (const view of ['grid', 'list'] as const) {
      const html = renderToStaticMarkup(
        createElement(ContentCalendarReport, {
          calendar: month,
          view,
          here: '/admin/content-calendar',
          adminRoute: '/admin',
        }),
      )
      for (const item of fromTool.days.flatMap((day) => day.items)) {
        expect(html).toContain(`href="${item.adminUrl}"`)
        expect(html).toContain(item.title)
      }
    }
  })

  it('narrows by kind, and gives each item its time label', async () => {
    const tool = createGetContentCalendarTool({ payload, calendar })
    const events = (await tool.handler(
      { month: '2026-10', kinds: ['event'] },
      ctx(),
    )) as ReturnType<typeof toolCalendar>
    expect(events.days.flatMap((day) => day.items.map((item) => [item.title, item.time]))).toEqual([
      ['Webinar', '2:00 PM ET (11:00 AM PT)'],
    ])
  })

  it('refuses a caller with no identity', async () => {
    const tool = createGetContentCalendarTool({ payload, calendar })
    expect(await tool.handler({}, { ...ctx(), user: null } as McpToolContext)).toHaveProperty(
      'error',
    )
  })
})

describe('the plugin', () => {
  it('registers the view, leaves the options for it, and binds the tool', () => {
    const views = payload.config.admin.components?.views as Record<
      string,
      { Component: unknown; path: string }
    >
    expect(views['contentCalendar']).toMatchObject({
      Component: CONTENT_CALENDAR_VIEW_PATH,
      path: '/content-calendar',
    })
    expect(editorialRuntime(payload.config).calendar?.options.timeZone).toBe('America/New_York')
    expect(collector.unbound).toEqual([])
    expect(collector.tools.map((tool) => tool.name)).toContain('get_content_calendar')
  })

  it('refuses a time zone it does not know, at boot', () => {
    expect(() => editorialPlugin({ calendar: { ...calendar, timeZone: 'Eastern' } })({})).toThrow(
      /not an IANA time zone/,
    )
  })
})
