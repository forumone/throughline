import { relativeTime } from '../relativeTime.js'
import { EDITORIAL_CSS } from '../styles.js'
import { listHref } from './checks.js'
import type { HealthGroup, HealthReport } from './find.js'

/*
The content-health report, as markup. Pure: it takes the report and renders it,
so the parity test can render exactly what an editor sees from exactly the rows
the MCP tool returns.

Each check is a section; each collection in it is a count linking to the admin
list filtered by the same `where`, and the first rows.
*/

export function EditorialStyles() {
  return (
    <style href="throughline-editorial" precedence="default">
      {EDITORIAL_CSS}
    </style>
  )
}

function Rows({ group, adminRoute, now }: { group: HealthGroup; adminRoute: string; now: Date }) {
  return (
    <ul className="tl-editorial__list">
      {group.rows.map((row) => (
        <li key={String(row.id)} className="tl-editorial__row">
          <a href={`${adminRoute}/collections/${group.collection}/${String(row.id)}`}>
            {row.title}
          </a>
          <span className="tl-editorial__meta">
            {row.at ? (
              <>
                revised <time dateTime={row.at}>{relativeTime(row.at, now)}</time>
              </>
            ) : null}
            {row.at && row.note ? ' · ' : null}
            {row.note ?? null}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function ContentHealthReport({
  report,
  adminRoute,
}: {
  report: HealthReport
  adminRoute: string
}) {
  const now = new Date(report.generatedAt)
  return (
    <>
      <EditorialStyles />
      {report.checks.map((check) => {
        const groups = check.groups.filter((group) => group.total > 0)
        const excluded = check.groups.reduce((sum, group) => sum + (group.excluded ?? 0), 0)
        return (
          <section
            key={check.id}
            className="tl-editorial__panel"
            aria-labelledby={`tl-health-${check.id}`}
          >
            <h2 id={`tl-health-${check.id}`}>{check.label}</h2>
            {check.description ? <p className="tl-editorial__meta">{check.description}</p> : null}
            {check.skipped === 'failed' ? (
              <p className="tl-editorial__empty">This could not be checked.</p>
            ) : groups.length === 0 ? (
              <p className="tl-editorial__empty">{check.empty}</p>
            ) : (
              groups.map((group) => (
                <div key={group.collection} className="tl-health__group">
                  <h3>
                    {group.label}{' '}
                    {/*
                    The list runs the `where` alone, so it also holds what
                    `refine` dropped: the label counts what the list will show.
                    */}
                    <a href={listHref(adminRoute, group.collection, group.where)}>
                      {group.total + (group.excluded ?? 0) > group.rows.length
                        ? `See all ${group.total + (group.excluded ?? 0)}`
                        : 'Open as a list'}
                    </a>
                  </h3>
                  <Rows group={group} adminRoute={adminRoute} now={now} />
                </div>
              ))
            )}
            {excluded > 0 ? (
              <p className="tl-editorial__meta">
                {excluded} more {excluded === 1 ? 'is' : 'are'} not listed because nothing uses{' '}
                {excluded === 1 ? 'it' : 'them'}.
              </p>
            ) : null}
          </section>
        )
      })}
    </>
  )
}
