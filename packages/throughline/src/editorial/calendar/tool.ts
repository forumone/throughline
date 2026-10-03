import { z } from 'zod'
import type { Payload, PayloadRequest } from 'payload'
import type { McpToolDefinition } from '../../index.js'
import type { McpToolDescriptor } from '../../index.js'
import {
  daysInMonth,
  readCalendarMonth,
  type CalendarMonth,
  type CalendarOptions,
} from './calendar.js'
import type { CalendarKind } from './find.js'
import { monthParam } from './month.js'

/*
The content calendar, as an MCP tool: the same month the view reads, as the
caller, as a list of days.
*/

export const CALENDAR_TOOLS = {
  getContentCalendar: {
    name: 'get_content_calendar',
    description:
      'One month of the content calendar: scheduled publishes, past publishes and events, by day in the site\'s time zone. Use for "what goes live next week?", "is anything scheduled on the 14th?", or to check two launches do not collide before scheduling. Pass `month` as YYYY-MM (default: this month) and `kinds` to narrow it.',
  },
} as const satisfies Record<string, McpToolDescriptor>

export const CALENDAR_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] = Object.values(CALENDAR_TOOLS)

const inputSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .describe('The month, as YYYY-MM. Default: the current month in the site time zone.'),
  kinds: z
    .array(z.enum(['scheduled', 'published', 'event']))
    .optional()
    .describe('Only these kinds of item. Default: all.'),
})

/** The month as the tool returns it: the month's own days with anything on them. */
export function toolCalendar(
  calendar: CalendarMonth,
  adminRoute: string,
  kinds?: readonly CalendarKind[],
) {
  const days = daysInMonth(calendar)
    .map((day) => ({
      day,
      items: (calendar.items.get(day) ?? [])
        .filter((item) => !kinds || kinds.includes(item.kind))
        .map((item) => ({
          ...item,
          time: calendar.clock.timeLabel(item.at, item.zone),
          adminUrl: `${adminRoute}/collections/${item.collection}/${String(item.id)}`,
        })),
    }))
    .filter((day) => day.items.length > 0)
  return {
    month: monthParam(calendar.month),
    timeZone: calendar.clock.zone,
    today: calendar.today,
    total: days.reduce((sum, day) => sum + day.items.length, 0),
    days,
  }
}

export function createGetContentCalendarTool(deps: {
  payload: Payload
  calendar: CalendarOptions
}): McpToolDefinition<typeof inputSchema> {
  return {
    ...CALENDAR_TOOLS.getContentCalendar,
    inputSchema,
    handler: async (input, ctx) => {
      if (!ctx.user) {
        return {
          error:
            'Must be authenticated: the calendar is read with your own access, and an API key alone carries no identity.',
        }
      }
      const calendar = await readCalendarMonth(deps.payload, {
        calendar: deps.calendar,
        // The same cast and the same reason as publishing's `resolvePublishingActor`.
        user: ctx.user as unknown as PayloadRequest['user'],
        ...(input.month ? { month: input.month } : {}),
      })
      return toolCalendar(calendar, deps.payload.config.routes.admin, input.kinds)
    },
  }
}
