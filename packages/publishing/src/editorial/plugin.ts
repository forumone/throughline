import type { Config, Plugin } from 'payload'
import type { McpToolDefinition } from '@forumone/throughline-plugin-contract'
import type { McpToolCollector, McpToolDescriptor } from '@forumone/throughline-core'
import { EDITORIAL_CUSTOM_KEY, type EditorialRuntime } from './config.js'
import type { CalendarOptions } from './calendar/calendar.js'
import { calendarClock } from './calendar/month.js'
import { CALENDAR_TOOL_DESCRIPTORS, createGetContentCalendarTool } from './calendar/tool.js'
import type { HealthCheck } from './health/checks.js'
import { HEALTH_TOOL_DESCRIPTORS, createFindContentNeedingAttentionTool } from './health/tool.js'
import { WORK_TOOL_DESCRIPTORS, createListMyWorkTool } from './work/tool.js'
import type { WorkOptions } from './work/work.js'

export interface EditorialPluginOptions {
  enabled?: boolean
  /** The content-health view, its dashboard summary and `find_content_needing_attention`. */
  health?: {
    checks: readonly HealthCheck[]
    /** Where the view lives under the admin route. Default `/content-health`. */
    path?: string
  }
  /** The content-calendar view and `get_content_calendar`. */
  calendar?: CalendarOptions & {
    /** Where the view lives under the admin route. Default `/content-calendar`. */
    path?: string
  }
  /**
   * "Your work" on the dashboard (unpublished changes and scheduled publishes,
   * with content health's counts beside them) and `list_my_work`.
   */
  work?: WorkOptions & {
    /** Put the panels in `beforeDashboard`. Default `true`; `false` for the tool alone. */
    dashboard?: boolean
  }
  /** Where the tools go. Omit for none. Must come before `mcpPlugin`. */
  mcpTools?: McpToolCollector
}

/** The views' import-map paths. */
export const CONTENT_HEALTH_VIEW_PATH = '@forumone/throughline-publishing/rsc#ContentHealthView'
export const CONTENT_CALENDAR_VIEW_PATH = '@forumone/throughline-publishing/rsc#ContentCalendarView'
export const YOUR_WORK_DASHBOARD_PATH = '@forumone/throughline-publishing/rsc#YourWorkDashboard'

function addView(
  config: Config,
  key: string,
  Component: string,
  path: string,
  title: string,
): Config {
  return {
    ...config,
    admin: {
      ...config.admin,
      components: {
        ...config.admin?.components,
        views: {
          ...config.admin?.components?.views,
          [key]: { Component, path: path as `/${string}`, meta: { title } },
        },
      },
    },
  }
}

/**
 * Editorial views for the admin, each with an MCP tool that returns the same
 * rows from the same read. 1.0 P2 moves these from forumone-2026 one at a time.
 *
 * ```ts
 * editorialPlugin({
 *   health: {
 *     checks: [
 *       staleCheck({ after: { pages: 12 } }),
 *       missingSeoCheck({ collections: ['pages', 'posts'] }),
 *       missingAltCheck({ inUse: findReferencedIds }),
 *     ],
 *   },
 *   calendar: {
 *     timeZone: 'America/New_York',
 *     collections: ['pages', 'posts'],
 *     events: [{ collection: 'events', startsField: 'startsAt', zoneField: 'startsAt_tz' }],
 *   },
 *   mcpTools,
 * })
 * ```
 */
export function editorialPlugin(options: EditorialPluginOptions): Plugin {
  return (incoming: Config): Config => {
    if (options.enabled === false) return incoming

    const runtime: EditorialRuntime = {}
    const descriptors: McpToolDescriptor[] = []
    let config: Config = incoming

    if (options.health) {
      const { checks } = options.health
      const path = options.health.path ?? '/content-health'
      const ids = checks.map((check) => check.id)
      const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
      if (duplicate) {
        throw new Error(`editorialPlugin: two health checks share the id "${duplicate}".`)
      }
      runtime.health = { checks, path }
      config = addView(config, 'contentHealth', CONTENT_HEALTH_VIEW_PATH, path, 'Content health')
      descriptors.push(...HEALTH_TOOL_DESCRIPTORS)
    }

    if (options.calendar) {
      const { path: rawPath, ...calendar } = options.calendar
      const path = rawPath ?? '/content-calendar'
      // Fails here, at boot, on a zone Intl does not know.
      calendarClock(calendar.timeZone, calendar.zoneLabel)
      runtime.calendar = { options: calendar, path }
      config = addView(
        config,
        'contentCalendar',
        CONTENT_CALENDAR_VIEW_PATH,
        path,
        'Content calendar',
      )
      descriptors.push(...CALENDAR_TOOL_DESCRIPTORS)
    }

    if (options.work) {
      const { dashboard, ...work } = options.work
      runtime.work = { options: work }
      if (dashboard !== false) {
        // First, so "what is waiting" sits above everything else on the dashboard.
        config = {
          ...config,
          admin: {
            ...config.admin,
            components: {
              ...config.admin?.components,
              beforeDashboard: [
                YOUR_WORK_DASHBOARD_PATH,
                ...(config.admin?.components?.beforeDashboard ?? []),
              ],
            },
          },
        }
      }
      descriptors.push(...WORK_TOOL_DESCRIPTORS)
    }

    if (descriptors.length > 0) options.mcpTools?.declare(descriptors, { serverName: 'editorial' })

    return {
      ...config,
      custom: { ...config.custom, [EDITORIAL_CUSTOM_KEY]: runtime },
      onInit: async (payload) => {
        if (config.onInit) await config.onInit(payload)
        if (!options.mcpTools) return
        const tools = [
          ...(runtime.health
            ? [createFindContentNeedingAttentionTool({ payload, checks: runtime.health.checks })]
            : []),
          ...(runtime.calendar
            ? [createGetContentCalendarTool({ payload, calendar: runtime.calendar.options })]
            : []),
          ...(runtime.work ? [createListMyWorkTool({ payload, work: runtime.work.options })] : []),
        ]
        if (tools.length > 0) {
          options.mcpTools.add(tools as unknown as McpToolDefinition[], { serverName: 'editorial' })
        }
      },
    }
  }
}
