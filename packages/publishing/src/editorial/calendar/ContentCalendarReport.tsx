import { EditorialStyles } from '../health/ContentHealthReport.js'
import { daysInMonth, type CalendarMonth } from './calendar.js'
import type { CalendarItem, CalendarKind } from './find.js'
import { dayTitle, monthParam, monthTitle, shiftMonth, type Month } from './month.js'

/*
The content calendar, as markup. Pure: it takes a month already read and
renders it, so the parity test can render exactly what an editor sees from
exactly the items the tool returns. From forumone-2026's
`admin/ContentCalendar.tsx` (#761 there).

A grid, or `?view=list` for the same month as an agenda, which reads better on a
phone and with a screen reader. Kinds differ by border style as well as colour.
*/

const KIND_LABEL: Record<CalendarKind, string> = {
  scheduled: 'Scheduled',
  published: 'Published',
  event: 'Event',
}

/** Items drawn in one grid cell before the rest collapse into "+N more". */
const PER_CELL = 4

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function ContentCalendarReport({
  calendar,
  view,
  here,
  adminRoute,
}: {
  calendar: CalendarMonth
  view: 'grid' | 'list'
  /** The view's own URL, for month and view links. */
  here: string
  adminRoute: string
}) {
  const { month, days, items, today, clock } = calendar
  const inMonth = new Set(daysInMonth(calendar))

  const href = (target: Month, targetView: string = view) =>
    `${here}?month=${monthParam(target)}${targetView === 'list' ? '&view=list' : ''}`
  const docHref = (item: CalendarItem) =>
    `${adminRoute}/collections/${item.collection}/${String(item.id)}`
  const describe = (item: CalendarItem) =>
    `${KIND_LABEL[item.kind]}${item.draft ? ' (draft)' : ''} · ${clock.timeLabel(item.at, item.zone)}`
  const keyOf = (item: CalendarItem) => `${item.kind}:${item.collection}:${String(item.id)}`

  const chip = (item: CalendarItem) => (
    <a
      key={keyOf(item)}
      className={`tl-calendar__item tl-calendar__item--${item.kind}`}
      href={docHref(item)}
      title={`${item.title} — ${describe(item)}`}
    >
      <span className="tl-calendar__kind">{KIND_LABEL[item.kind]}: </span>
      {item.title}
    </a>
  )

  const monthDays = days.filter((key) => inMonth.has(key))
  const count = monthDays.reduce((sum, key) => sum + (items.get(key)?.length ?? 0), 0)

  return (
    <>
      <EditorialStyles />
      <div className="tl-calendar__header">
        <h1>{monthTitle(month)}</h1>
        <nav className="tl-calendar__controls" aria-label="Month">
          <a href={href(shiftMonth(month, -1))}>← Previous</a>
          <a href={href(clock.parseMonth(undefined, new Date()))}>Today</a>
          <a href={href(shiftMonth(month, 1))}>Next →</a>
          <span aria-hidden="true">|</span>
          {view === 'grid' ? (
            <a href={href(month, 'list')}>List</a>
          ) : (
            <a href={href(month, 'grid')}>Grid</a>
          )}
        </nav>
      </div>
      <p className="tl-calendar__legend">
        <span className="tl-calendar__item tl-calendar__item--scheduled">Scheduled publish</span>
        <span className="tl-calendar__item tl-calendar__item--published">Published</span>
        <span className="tl-calendar__item tl-calendar__item--event">Event</span>
        <span className="tl-editorial__meta">
          Times are {clock.label}, the site&rsquo;s time zone.
        </span>
      </p>

      {view === 'grid' ? (
        <table className="tl-calendar__grid">
          <caption className="tl-calendar__caption">
            {monthTitle(month)}: {count} {count === 1 ? 'item' : 'items'}
          </caption>
          <thead>
            <tr>
              {WEEKDAYS.map((day) => (
                <th key={day} scope="col">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: days.length / 7 }, (_, week) => (
              <tr key={week}>
                {days.slice(week * 7, week * 7 + 7).map((key) => {
                  const list = items.get(key) ?? []
                  const classes = ['tl-calendar__day']
                  if (!inMonth.has(key)) classes.push('tl-calendar__day--outside')
                  if (key === today) classes.push('tl-calendar__day--today')
                  return (
                    <td key={key} className={classes.join(' ')}>
                      <span className="tl-calendar__date">
                        {Number(key.slice(8))}
                        {key === today && <span className="tl-calendar__kind"> (today)</span>}
                      </span>
                      {list.slice(0, PER_CELL).map(chip)}
                      {list.length > PER_CELL && (
                        <a className="tl-calendar__more" href={`${href(month, 'list')}#day-${key}`}>
                          +{list.length - PER_CELL} more
                        </a>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      ) : count === 0 ? (
        <p className="tl-editorial__empty">
          Nothing is scheduled, published or happening this month.
        </p>
      ) : (
        monthDays.map((key) => {
          const list = items.get(key) ?? []
          if (list.length === 0) return null
          return (
            <section key={key} id={`day-${key}`} className="tl-editorial__panel">
              <h2>
                {dayTitle(key)}
                {key === today ? ' (today)' : ''}
              </h2>
              <ul className="tl-editorial__list">
                {list.map((item) => (
                  <li key={keyOf(item)} className="tl-editorial__row">
                    <a href={docHref(item)}>{item.title}</a>
                    <span className="tl-editorial__meta">{describe(item)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
    </>
  )
}
