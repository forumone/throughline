/**
 * Server components for the admin, referenced from Payload's import map as
 * `@forumone/throughline/rsc#UsedOnPanel`, `#ContentHealthView` and the like,
 * or rendered by a host directly (`HealthSummary`, inside its own dashboard
 * component).
 *
 * Kept off the package root so a server-only consumer never loads React,
 * `@payloadcms/ui` or `@payloadcms/next`.
 */

// Media
export { UsedOnPanel } from '../references/UsedOnPanel.js'

// Editorial
export { ContentHealthView } from '../editorial/health/ContentHealthView.js'
export { ContentHealthReport } from '../editorial/health/ContentHealthReport.js'
export { HealthSummary } from '../editorial/health/HealthSummary.js'
export { ContentCalendarView } from '../editorial/calendar/ContentCalendarView.js'
export { ContentCalendarReport } from '../editorial/calendar/ContentCalendarReport.js'
export { YourWorkDashboard, YourWorkReport } from '../editorial/work/YourWork.js'

// MCP sign-in
export { ConnectMcpView, McpAuthorizeView } from '../mcp-oauth/admin/views.js'
