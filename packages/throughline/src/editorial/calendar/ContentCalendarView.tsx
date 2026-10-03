import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation.js'
import type { AdminViewServerProps } from 'payload'
import { editorialRuntime } from '../config.js'
import { readCalendarMonth } from './calendar.js'
import { ContentCalendarReport } from './ContentCalendarReport.js'

/*
`/admin/content-calendar`: a month at a glance. The dashboard lists the next
few scheduled publishes; this shows the month: what goes live next week, whether
two campaign pages collide, an event beside the post announcing it.

Read-only. Rescheduling is a pipeline operation, done from the document's own
Schedule control. The month is in the URL (`?month=2026-10`) so it can be
linked. `editorialPlugin` registers it with the site's sources and zone.
*/

export async function ContentCalendarView({
  initPageResult,
  params,
  searchParams,
  payload,
  i18n,
}: AdminViewServerProps) {
  const { req, permissions, locale, visibleEntities } = initPageResult
  // The signed-in person arrives on the request, not as the `user` prop.
  const { user } = req
  const { admin } = payload.config.routes
  const runtime = editorialRuntime(payload.config).calendar
  const here = `${admin}${runtime?.path ?? '/content-calendar'}`
  if (!user) redirect(`${admin}/login?redirect=${encodeURIComponent(here)}`)
  if (!runtime) throw new Error('ContentCalendarView: editorialPlugin was given no `calendar`.')

  const calendar = await readCalendarMonth(payload, {
    calendar: runtime.options,
    user,
    month: searchParams?.['month'],
  })
  const view = searchParams?.['view'] === 'list' ? 'list' : 'grid'

  return (
    <DefaultTemplate
      i18n={i18n}
      {...(locale ? { locale } : {})}
      {...(params ? { params } : {})}
      payload={payload}
      permissions={permissions}
      req={req}
      {...(searchParams ? { searchParams } : {})}
      user={user}
      visibleEntities={visibleEntities}
    >
      <Gutter className="tl-calendar">
        <ContentCalendarReport calendar={calendar} view={view} here={here} adminRoute={admin} />
      </Gutter>
    </DefaultTemplate>
  )
}
