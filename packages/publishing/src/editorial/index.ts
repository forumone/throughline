export {
  editorialPlugin,
  CONTENT_CALENDAR_VIEW_PATH,
  CONTENT_HEALTH_VIEW_PATH,
  YOUR_WORK_DASHBOARD_PATH,
} from './plugin.js'
export type { EditorialPluginOptions } from './plugin.js'

export {
  listHref,
  missingAltCheck,
  missingSeoCheck,
  monthsBefore,
  staleCheck,
  whereQuery,
} from './health/checks.js'
export type {
  HealthCheck,
  HealthRow,
  MissingAltCheckOptions,
  MissingSeoCheckOptions,
  StaleCheckOptions,
} from './health/checks.js'

export { findContentNeedingAttention } from './health/find.js'
export type {
  FindContentNeedingAttentionOptions,
  HealthCheckResult,
  HealthGroup,
  HealthReport,
} from './health/find.js'

export {
  HEALTH_TOOLS,
  HEALTH_TOOL_DESCRIPTORS,
  createFindContentNeedingAttentionTool,
  toolReport,
} from './health/tool.js'
export type { HealthToolDeps } from './health/tool.js'

export { relativeTime } from './relativeTime.js'

export { clockFor, daysInMonth, readCalendarMonth } from './calendar/calendar.js'
export type { CalendarMonth, CalendarOptions } from './calendar/calendar.js'
export { findContentCalendar } from './calendar/find.js'
export type {
  CalendarEventSource,
  CalendarItem,
  CalendarKind,
  CalendarSources,
} from './calendar/find.js'
export {
  calendarClock,
  dayTitle,
  defaultZoneLabel,
  gridDays,
  monthParam,
  monthTitle,
  queryRange,
  shiftMonth,
} from './calendar/month.js'
export type { CalendarClock, Month } from './calendar/month.js'
export {
  CALENDAR_TOOLS,
  CALENDAR_TOOL_DESCRIPTORS,
  createGetContentCalendarTool,
  toolCalendar,
} from './calendar/tool.js'

export { readYourWork } from './work/work.js'
export type { WorkOptions, WorkRow, YourWorkResult } from './work/work.js'
export { WORK_TOOLS, WORK_TOOL_DESCRIPTORS, createListMyWorkTool, toolWork } from './work/tool.js'
