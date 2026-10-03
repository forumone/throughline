import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import { redirect } from 'next/navigation.js'
import type { AdminViewServerProps } from 'payload'
import { editorialRuntime } from '../config.js'
import { ContentHealthReport } from './ContentHealthReport.js'
import { findContentNeedingAttention } from './find.js'

/*
`/admin/content-health`: what needs a review, and where it is. Moved from
forumone-2026's `admin/ContentHealth.tsx` (#757 there).

"Your work" answers "what is waiting on me"; this answers the question a
content lead asks every quarter, "what is going stale?", without anybody
building a filter. `editorialPlugin` registers it with the site's checks.
*/

export async function ContentHealthView({
  initPageResult,
  params,
  searchParams,
  payload,
  i18n,
}: AdminViewServerProps) {
  const { req, permissions, locale, visibleEntities } = initPageResult
  // The signed-in person arrives on the request: Payload leaves the `user`
  // prop empty for a custom root view.
  const { user } = req
  const { admin } = payload.config.routes
  const health = editorialRuntime(payload.config).health
  const path = health?.path ?? '/content-health'
  if (!user) redirect(`${admin}/login?redirect=${encodeURIComponent(`${admin}${path}`)}`)

  const report = await findContentNeedingAttention(payload, { checks: health?.checks ?? [], user })

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
      <Gutter className="tl-health">
        <h1>Content health</h1>
        <p className="tl-health__lede">
          What needs a review, and where it is. Each count opens the list it counted.
        </p>
        <ContentHealthReport report={report} adminRoute={admin} />
      </Gutter>
    </DefaultTemplate>
  )
}
