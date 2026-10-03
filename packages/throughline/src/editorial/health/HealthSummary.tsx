import type { Payload, PayloadRequest } from 'payload'
import { editorialRuntime } from '../config.js'
import { EditorialStyles } from './ContentHealthReport.js'
import { listHref } from './checks.js'
import { findContentNeedingAttention, type HealthCheckResult } from './find.js'

/*
Content health as counts, for a dashboard: each a link to the filtered list,
and a link to the full view. Costly checks are left to the view, because the
dashboard is opened far more often than anybody reviews anything.

A host renders it where it wants it, e.g. inside a `beforeDashboard` component:
`<HealthSummary payload={payload} user={user} />`.
*/

export async function HealthSummary({
  payload,
  user,
}: {
  payload: Payload
  user: PayloadRequest['user']
}) {
  if (!user) return null
  const health = editorialRuntime(payload.config).health
  if (!health) return null
  const { admin } = payload.config.routes
  const report = await findContentNeedingAttention(payload, {
    checks: health.checks,
    user,
    scope: 'summary',
  })

  const line = (check: HealthCheckResult) => {
    const groups = check.groups.filter((group) => group.total > 0)
    const total = groups.reduce((sum, group) => sum + group.total, 0)
    return (
      <li key={check.id} className="tl-editorial__row">
        <span>
          {check.label}: <strong>{total}</strong>
        </span>
        <span className="tl-editorial__meta">
          {groups.length === 0
            ? 'none'
            : groups.map((group, index) => (
                <span key={group.collection}>
                  {index > 0 && ' · '}
                  <a href={listHref(admin, group.collection, group.where)}>
                    {group.total} {(group.total === 1 ? group.singular : group.label).toLowerCase()}
                  </a>
                </span>
              ))}
        </span>
      </li>
    )
  }

  const shown = report.checks.filter((check) => !check.skipped)
  const left = report.checks
    .filter((check) => check.skipped === 'costly')
    .map((c) => c.label.toLowerCase())

  return (
    <section className="tl-editorial__panel" aria-labelledby="tl-dashboard-health">
      <EditorialStyles />
      <h2 id="tl-dashboard-health">Content health</h2>
      <ul className="tl-editorial__list">{shown.map(line)}</ul>
      <p className="tl-editorial__more">
        <a href={`${admin}${health.path}`}>
          Review content health{left.length > 0 ? `, including ${left.join(' and ')}` : ''}
        </a>
      </p>
    </section>
  )
}
