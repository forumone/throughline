import type { Payload, PayloadRequest } from 'payload'
import { editorialRuntime } from '../config.js'
import { EditorialStyles } from '../health/ContentHealthReport.js'
import { HealthSummary } from '../health/HealthSummary.js'
import { relativeTime } from '../relativeTime.js'
import { readYourWork, type WorkRow, type YourWorkResult } from './work.js'

/*
The top of the dashboard: what is waiting on somebody. From forumone-2026's
`admin/YourWork.tsx`.

Payload's default dashboard is a card per collection, each saying only its own
name, so the first screen after signing in answers "what collections are
there", which nobody asks twice. The questions an editor opens the admin with
are "what did I leave half done" and "what is about to go out".

`editorialPlugin` puts `YourWorkDashboard` in `beforeDashboard`: the two panels,
and the content-health counts beside them when health is configured.
*/

function Rows({
  rows,
  empty,
  now,
  adminRoute,
}: {
  rows: WorkRow[]
  empty: string
  now: Date
  adminRoute: string
}) {
  if (rows.length === 0) return <p className="tl-editorial__empty">{empty}</p>
  return (
    <ul className="tl-editorial__list">
      {rows.map((row) => (
        <li key={`${row.collection}:${String(row.id)}`} className="tl-editorial__row">
          <a href={`${adminRoute}/collections/${row.collection}/${String(row.id)}`}>{row.title}</a>
          <span className="tl-editorial__meta">
            {row.label} · <time dateTime={row.at}>{relativeTime(row.at, now)}</time>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The two panels, from a result already read. Pure, for the parity test. */
export function YourWorkReport({ work, adminRoute }: { work: YourWorkResult; adminRoute: string }) {
  const now = new Date(work.generatedAt)
  return (
    <>
      <EditorialStyles />
      <section className="tl-editorial__panel" aria-labelledby="tl-dashboard-changes">
        <h2 id="tl-dashboard-changes">Unpublished changes</h2>
        <Rows
          rows={work.changes}
          empty="Nothing is waiting to be published."
          now={now}
          adminRoute={adminRoute}
        />
      </section>
      <section className="tl-editorial__panel" aria-labelledby="tl-dashboard-scheduled">
        <h2 id="tl-dashboard-scheduled">Scheduled to publish</h2>
        <Rows
          rows={work.scheduled}
          empty="Nothing is scheduled."
          now={now}
          adminRoute={adminRoute}
        />
      </section>
    </>
  )
}

/** `beforeDashboard`: "Your work", and content health's counts when there are checks. */
export async function YourWorkDashboard({
  payload,
  user,
}: {
  payload: Payload
  user?: PayloadRequest['user']
}) {
  if (!user) return null
  const runtime = editorialRuntime(payload.config)
  const { admin } = payload.config.routes
  const work = runtime.work
    ? await readYourWork(payload, { work: runtime.work.options, user })
    : null

  return (
    <div className="tl-editorial__dashboard">
      {work ? <YourWorkReport work={work} adminRoute={admin} /> : null}
      <HealthSummary payload={payload} user={user} />
    </div>
  )
}
