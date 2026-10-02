import type { Payload, SanitizedConfig } from 'payload'
import type { CalendarOptions } from './calendar/calendar.js'
import type { HealthCheck } from './health/checks.js'

/*
Where the editorial plugin leaves its configuration for its own server
components to find. Import-map components receive no plugin options, and the
checks and the calendar's zone label are functions, which cannot ride on serialized props; `config.custom` is
server-only and holds anything.
*/

export const EDITORIAL_CUSTOM_KEY = 'throughlineEditorial'

export interface EditorialRuntime {
  health?: {
    checks: readonly HealthCheck[]
    /** The view's path under the admin route. */
    path: string
  }
  calendar?: {
    options: CalendarOptions
    path: string
  }
}

export function editorialRuntime(config: Payload['config'] | SanitizedConfig): EditorialRuntime {
  return (
    ((config.custom ?? {}) as Record<string, EditorialRuntime | undefined>)[EDITORIAL_CUSTOM_KEY] ??
    {}
  )
}
